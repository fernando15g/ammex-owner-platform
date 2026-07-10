// POST /api/billing/log-payment — log a payment AGAINST a specific invoice.
// Body: { projectId, billEventId, paidAmount, paymentDate }.
// The payment ties to the invoice (+ project). If paidAmount < the invoice's
// expected net (gross − retention), it's a SHORT PAY: adjust the bill to match,
// roll the unpaid quantity forward, and log the payment for what was received.
// Otherwise it's a normal payment logged against that invoice.
import { NextResponse } from "next/server";
import { getPage } from "@/lib/notion/client";
import { mapBillingEvent, updateBillingEvent, createBillingEvent } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { shortPayAdjustment } from "@/lib/rules/invoicing";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { projectId, billEventId, paidAmount, paymentDate } = await req.json();
    if (paidAmount == null || isNaN(Number(paidAmount))) throw new Error("A valid payment amount is required.");
    const paid = Number(paidAmount);
    const date = paymentDate || new Date().toISOString().slice(0, 10);

    // No invoice selected -> generic payment on the project (allowed, but tie is preferred)
    if (!billEventId) {
      if (!projectId) throw new Error("Select an invoice or provide a project.");
      await createBillingEvent({ projectId, type: "Payment", name: "Payment", amount: paid, date, notes: "Payment (no invoice specified)" });
      return NextResponse.json({ ok: true, mode: "generic" });
    }

    const bill = mapBillingEvent(await getPage(billEventId));
    if (bill.type !== "Bill") throw new Error("Payments must be applied to a Bill.");
    const gross = bill.amount || 0;
    const retention = bill.retentionWithheld || 0;
    const expectedNet = gross - retention;

    // FULL (or over) payment -> just log it, tied to the invoice
    if (paid >= expectedNet - 0.005) {
      await createBillingEvent({
        projectId: bill.projectId, type: "Payment",
        name: `Payment — ${bill.invoiceNumber || "invoice"}`,
        invoiceNumber: bill.invoiceNumber || "",
        amount: paid, date,
        notes: `Payment against ${bill.invoiceNumber || "invoice"}`,
      });
      return NextResponse.json({ ok: true, mode: "full" });
    }

    // SHORT PAY -> needs the line snapshot to roll forward
    const m = (bill.notes || "").match(/\[snap\](\{.*\})\s*$/s);
    if (!m) {
      // No snapshot (older/non-itemized bill): still log payment + note the short,
      // but we can't roll specific line quantities. Adjust the bill amount to match.
      await createBillingEvent({ projectId: bill.projectId, type: "Payment", name: `Payment — ${bill.invoiceNumber || "invoice"}`, invoiceNumber: bill.invoiceNumber || "", amount: paid, date, notes: `Short pay against ${bill.invoiceNumber || "invoice"} — no line snapshot; balance not auto-rolled` });
      return NextResponse.json({ ok: true, mode: "short-no-snapshot", shortfall: Number((expectedNet - paid).toFixed(2)) });
    }
    const snap = JSON.parse(m[1]);
    const r = (snap.r || 0) / 100;
    const shortNet = expectedNet - paid;
    const grossCut = r < 1 ? shortNet / (1 - r) : shortNet;

    const snapLines = snap.lines.map((l) => ({ id: l.id, unitPrice: l.u, thisQty: l.q }));
    const { reductions } = shortPayAdjustment(snapLines, gross, gross - grossCut);

    // 1) adjust the bill to reality
    await updateBillingEvent(billEventId, {
      amount: Number((gross - grossCut).toFixed(2)),
      retentionWithheld: Number((retention - grossCut * r).toFixed(2)),
      pounds: Number(((bill.pounds || 0) - reductions.reduce((a, x) => a + x.qtyReduction, 0)).toFixed(1)),
      notes: `${bill.notes}\n[short pay] expected $${expectedNet.toFixed(2)}, received $${paid.toFixed(2)} — $${shortNet.toFixed(2)} rolled to next cycle`,
    });
    // 2) roll unpaid quantity forward
    const all = await getAllLineItems();
    for (const red of reductions) {
      if (red.qtyReduction <= 0) continue;
      const line = all.find((l) => l.id === red.id);
      if (!line) continue;
      await updateLineItem(red.id, { qtyToDate: Math.max((line.qtyToDate || 0) - red.qtyReduction, 0) });
    }
    // 3) log the payment received, tied to the invoice, with a structured
    //    carry-forward tag: the next bill reads this to show a quiet reminder,
    //    and it's the audit trail of what rolled back to which lines.
    const carry = {
      fromInvoice: bill.invoiceNumber || "",
      grossRolled: Number(grossCut.toFixed(2)),
      netShort: Number(shortNet.toFixed(2)),
      lines: reductions.filter((x) => x.qtyReduction > 0).map((x) => ({ id: x.id, qty: Number(x.qtyReduction.toFixed(1)), amt: Number(x.dollarCut.toFixed(2)) })),
    };
    await createBillingEvent({
      projectId: bill.projectId, type: "Payment",
      name: `Payment — ${bill.invoiceNumber || "short pay"}`,
      invoiceNumber: bill.invoiceNumber || "",
      amount: paid, date,
      notes: `Short pay against ${bill.invoiceNumber || "invoice"} — $${shortNet.toFixed(2)} re-bills next cycle within its line items\n[carry]${JSON.stringify(carry)}`,
    });
    return NextResponse.json({ ok: true, mode: "short", rolledForward: Number(shortNet.toFixed(2)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
