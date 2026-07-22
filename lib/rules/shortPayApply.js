// =============================================================================
// APPLYING A SHORT PAY — one implementation, used everywhere.
//
// This logic used to be copy-pasted into log-payment and short-pay, and was
// missing entirely from edit and delete. That is precisely why editing or
// deleting a short-paid payment left the invoice stamped and the line
// quantities rolled back with nothing to justify them.
//
// The model (settled with Fern): an invoice is a HISTORICAL RECORD. It keeps the
// amount it was billed at, forever. A short pay does not rewrite it — it stamps
// an [adjust] record on it, rolls the unpaid quantity back onto the lines so the
// work re-bills next cycle, and closes that invoice's balance so the money is
// never counted twice.
// =============================================================================

import { shortPayAdjustment } from "@/lib/rules/invoicing";
import { readTag, writeTag } from "@/lib/rules/mutations";
import { resolveLine } from "@/lib/rules/appIds";

// Find the invoice a payment belongs to (payments are tied by invoice number).
export function findInvoiceFor(payment, allEvents) {
  if (!payment?.invoiceNumber) return null;
  return allEvents.find((e) => e.type === "Bill" && e.invoiceNumber === payment.invoiceNumber) || null;
}

// Is this payment short against its invoice's expected net?
export function isShort(invoice, paidAmount) {
  const gross = invoice.amount || 0;
  const retention = invoice.retentionWithheld || 0;
  return Number(paidAmount) < gross - retention - 0.005;
}

// Apply a short pay. Writes through the injected repo functions and registers
// compensating undos on the transaction. Returns null when the payment is NOT
// short (nothing to do). Never rewrites the invoice's amount.
//
// `allocation` (optional): a MANUAL per-line rollback — [{ key, qty }] where key
// is the line's app-owned Line ID (or page id) and qty is the GROSS pounds to
// roll back onto that line. When given, the shortfall lands exactly where the
// caller says (the lines the GC disputed) instead of being spread proportionally.
// Safeguards: a line can't roll back more than it was billed on THIS invoice, and
// the rolled gross dollars must reconcile to the shortfall. Omitted → Auto
// (proportional across the invoice's lines), the original behavior.
export async function applyShortPay({ invoice, lines, paidAmount, paymentId, allocation = null, tx, updateLineItem, updateBillingEvent }) {
  const gross = invoice.amount || 0;
  const retention = invoice.retentionWithheld || 0;
  const expectedNet = gross - retention;
  const paid = Number(paidAmount);

  if (paid >= expectedNet - 0.005) return null; // full payment

  const snap = readTag(invoice.notes, "snap");
  if (!snap) {
    throw new Error(
      "This invoice has no line snapshot (it predates itemized billing), so the unpaid " +
      "balance can't be rolled back to specific lines. Undo it and re-create it from the grid."
    );
  }

  const r = (snap.r || 0) / 100;
  const shortNet = expectedNet - paid;
  const grossCut = r < 1 ? shortNet / (1 - r) : shortNet;

  // Key each snapshot row by its APPLICATION-OWNED Line ID where present, so the
  // reduction we compute can be matched back to a real line regardless of what
  // database the line lives in. Old snapshots (page id only) still resolve.
  const refByKey = new Map();
  const snapByKey = new Map();
  const snapLines = (snap.lines || []).map((l) => {
    const key = l.lid || l.id;
    refByKey.set(key, { lid: l.lid || null, id: l.id || null });
    snapByKey.set(key, { unitPrice: l.u, thisQty: l.q });
    return { id: key, unitPrice: l.u, thisQty: l.q };
  });

  let reductions;
  const mode = Array.isArray(allocation) && allocation.length ? "manual" : "auto";
  if (mode === "manual") {
    // The caller placed the rollback on specific lines (matching the GC's sheet).
    reductions = allocation
      .map((a) => {
        const key = a.key;
        const sl = snapByKey.get(key);
        if (!sl) throw new Error("A rollback line wasn't on this invoice — it can't be rolled back here.");
        const qty = Number(a.qty) || 0;
        if (qty < -1e-6) throw new Error("A rollback quantity can't be negative.");
        if (qty > sl.thisQty + 1e-4) {
          throw new Error(`A line can't roll back more than it was billed on this invoice (max ${sl.thisQty} lbs).`);
        }
        return { id: key, qtyReduction: qty, dollarCut: qty * sl.unitPrice };
      })
      .filter((x) => x.qtyReduction > 0);
    const allocGross = reductions.reduce((s, x) => s + x.dollarCut, 0);
    if (Math.abs(allocGross - grossCut) > 0.02) {
      throw new Error(
        `The rollback totals $${allocGross.toFixed(2)} but the shortfall to roll back is $${grossCut.toFixed(2)}. They have to match.`
      );
    }
  } else {
    // AUTO: proportional across the invoice's lines by dollar share.
    ({ reductions } = shortPayAdjustment(snapLines, gross, gross - grossCut));
  }

  // 1) roll the unpaid quantity back onto the lines (it re-bills next cycle)
  for (const red of reductions) {
    if (red.qtyReduction <= 0) continue;
    const line = resolveLine(refByKey.get(red.id), lines);
    if (!line) continue;
    const before = line.qtyToDate || 0;
    const after = Math.max(before - red.qtyReduction, 0);
    await updateLineItem(line.id, { qtyToDate: after });
    tx?.onRollback(`line ${line.lineId || line.id} qty`, () => updateLineItem(line.id, { qtyToDate: before }));
    line.qtyToDate = after;
  }

  // 2) stamp the invoice — it KEEPS its original amount
  const adjust = {
    billedOriginal: Number(gross.toFixed(2)),
    expectedNet: Number(expectedNet.toFixed(2)),
    received: Number(paid.toFixed(2)),
    rolledForward: Number(shortNet.toFixed(2)),
    grossRolled: Number(grossCut.toFixed(2)),
    mode,
  };
  const beforeInvoiceNotes = invoice.notes;
  const humanLine = `[short pay] billed $${gross.toFixed(2)}, received $${paid.toFixed(2)}, $${shortNet.toFixed(2)} rolled to the next invoice (balance closed here)`;
  const newNotes = writeTag(`${beforeInvoiceNotes}\n${humanLine}`, "adjust", adjust);
  await updateBillingEvent(invoice.id, { notes: newNotes });
  tx?.onRollback("invoice adjust stamp", () => updateBillingEvent(invoice.id, { notes: beforeInvoiceNotes }));
  invoice.notes = newNotes;

  // 3) tag the payment with the line-level carry detail (the audit trail)
  const carry = {
    fromInvoice: invoice.invoiceNumber || "",
    grossRolled: Number(grossCut.toFixed(2)),
    netShort: Number(shortNet.toFixed(2)),
    lines: reductions
      .filter((x) => x.qtyReduction > 0)
      .map((x) => {
        const ref = refByKey.get(x.id) || {};
        // the qty is kept EXACT (to 4dp); the UI rounds it for display
        return { lid: ref.lid || null, id: ref.id || null, qty: Number(x.qtyReduction.toFixed(4)), amt: Number(x.dollarCut.toFixed(2)) };
      }),
  };
  if (paymentId) {
    await updateBillingEvent(paymentId, {
      notes: writeTag(
        `Short pay against ${invoice.invoiceNumber || "invoice"} — $${shortNet.toFixed(2)} re-bills next cycle within its line items`,
        "carry", carry
      ),
    });
  }

  return { rolledForward: adjust.rolledForward, carry, adjust };
}
