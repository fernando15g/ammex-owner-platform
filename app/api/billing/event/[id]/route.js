// PATCH /api/billing/event/[id] — edit a billing event.
// Every change passes the rules layer first (lib/rules/mutations). Money fields
// on an invoice are NOT editable here: an invoice's amount is derived from the
// quantities it billed, so editing the total would desync it from its lines.
// Editing a payment's amount re-runs the short-pay logic, unwinding the old
// effect before applying the new one — all of it inside a transaction seam.
import { NextResponse } from "next/server";
import { getPage } from "@/lib/notion/client";
import { mapBillingEvent, updateBillingEvent } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { validateEventEdit, planShortPayUnwind, readTag } from "@/lib/rules/mutations";
import { applyShortPay, findInvoiceFor } from "@/lib/rules/shortPayApply";
import { withTransaction } from "@/lib/data/tx";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const changes = body.changes || body;

    const event = mapBillingEvent(await getPage(params.id));
    validateEventEdit(event, changes);           // throws on anything illegal

    // Simple case: no money movement to reconcile.
    const amountChanged = "amount" in changes && Number(changes.amount) !== (event.amount || 0);
    const isShortPay = event.type === "Payment" && !!readTag(event.notes, "carry");
    if (!amountChanged || (event.type === "Payment" && !isShortPay && !event.invoiceNumber)) {
      await updateBillingEvent(params.id, changes);
      return NextResponse.json({ ok: true, mode: "simple" });
    }

    // Payment amount changed and it touches an invoice: unwind, then re-apply.
    const [allEvents, allLines] = await Promise.all([
      import("@/lib/notion/billingRepository").then((m) => m.getAllBillingEvents()),
      getAllLineItems(),
    ]);
    const invoice = findInvoiceFor(event, allEvents);

    const result = await withTransaction(async (tx) => {
      // 1) undo the previous short pay, if this payment was one
      const unwind = planShortPayUnwind(event, invoice);
      if (unwind) {
        for (const r of unwind.lineRestores) {
          const line = allLines.find((l) => l.id === r.id);
          if (!line) continue;
          const before = line.qtyToDate || 0;
          await updateLineItem(r.id, { qtyToDate: before + r.addQty });
          tx.onRollback(`line ${r.id} qty`, () => updateLineItem(r.id, { qtyToDate: before }));
          line.qtyToDate = before + r.addQty; // keep in-memory copy current
        }
        if (unwind.invoiceId) {
          const beforeNotes = invoice.notes;
          await updateBillingEvent(unwind.invoiceId, { notes: unwind.invoiceNotes });
          tx.onRollback("invoice notes", () => updateBillingEvent(unwind.invoiceId, { notes: beforeNotes }));
          invoice.notes = unwind.invoiceNotes;
        }
      }

      // 2) write the new payment amount
      const beforeEvent = { amount: event.amount, notes: event.notes, date: event.date, invoiceNumber: event.invoiceNumber };
      await updateBillingEvent(params.id, { ...changes, notes: changes.notes ?? stripCarry(event.notes) });
      tx.onRollback("payment", () => updateBillingEvent(params.id, beforeEvent));

      // 3) re-apply short pay if the NEW amount is short against that invoice
      if (invoice) {
        const applied = await applyShortPay({
          invoice, lines: allLines, paidAmount: Number(changes.amount),
          paymentId: params.id, tx, updateLineItem, updateBillingEvent,
        });
        return { mode: applied ? "reapplied-short-pay" : "full-payment", rolledForward: applied?.rolledForward || 0 };
      }
      return { mode: "amount-updated" };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e), rollbackFailed: !!e.rollbackFailed }, { status: 400 });
  }
}

function stripCarry(notes) {
  return String(notes || "").replace(/\n?\[carry\]\{.*?\}\s*(?=\n|$)/s, "").trim();
}
