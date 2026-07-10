// POST /api/billing/short-pay — billed X, received Y (< expected). Per the
// admin's real process: adjust the record so it matches what was actually paid,
// and roll the unpaid quantity forward (it re-bills next cycle automatically).
// Body: { eventId, paidAmount, paymentDate }.
// Mechanics: read the bill's snapshot -> convert the net shortfall to a gross
// quantity cut -> reduce the bill (amount + retention) to match the payment ->
// reduce lines' qty-to-date by the cut (so next invoice's "previous" is lower
// and the difference re-bills) -> log the Payment for what was received.
import { NextResponse } from "next/server";
import { getPage } from "@/lib/notion/client";
import { mapBillingEvent, updateBillingEvent, createBillingEvent } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { shortPayAdjustment } from "@/lib/rules/invoicing";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { eventId, paidAmount, paymentDate } = await req.json();
    if (!eventId || paidAmount == null) throw new Error("eventId and paidAmount required");

    const page = await getPage(eventId);
    const bill = mapBillingEvent(page);
    if (bill.type !== "Bill") throw new Error("Short pay applies to Bill events only");

    // parse snapshot
    const m = (bill.notes || "").match(/\[snap\](\{.*\})\s*$/s);
    if (!m) throw new Error("This bill has no line snapshot (created before itemized billing) — adjust manually.");
    const snap = JSON.parse(m[1]);
    const r = (snap.r || 0) / 100;

    const gross = bill.amount || 0;
    const retention = bill.retentionWithheld || 0;
    const expectedNet = gross - retention;
    const paid = Number(paidAmount);
    if (paid >= expectedNet) throw new Error(`Paid ($${paid}) covers the expected net ($${expectedNet.toFixed(2)}) — log a normal payment instead.`);

    // net shortfall -> gross cut (retention scales with gross)
    const shortNet = expectedNet - paid;
    const grossCut = r < 1 ? shortNet / (1 - r) : shortNet;

    const snapLines = snap.lines.map((l) => ({ id: l.id, unitPrice: l.u, thisQty: l.q }));
    const { reductions } = shortPayAdjustment(snapLines, gross, gross - grossCut);

    // 1) adjust the bill to match reality
    await updateBillingEvent(eventId, {
      amount: Number((gross - grossCut).toFixed(2)),
      retentionWithheld: Number((retention - grossCut * r).toFixed(2)),
      pounds: Math.max(Math.round((bill.pounds || 0) - reductions.reduce((a, x) => a + x.qtyReduction, 0)), 0),
      notes: `${bill.notes}\n[short pay] expected $${expectedNet.toFixed(2)}, received $${paid.toFixed(2)} — $${shortNet.toFixed(2)} rolled to next cycle`,
    });

    // 2) roll unpaid quantity forward: lower each line's qty-to-date
    const all = await getAllLineItems();
    for (const red of reductions) {
      if (red.qtyReduction <= 0) continue;
      const line = all.find((l) => l.id === red.id);
      if (!line) continue;
      await updateLineItem(red.id, { qtyToDate: Math.max(Math.round((line.qtyToDate || 0) - red.qtyReduction), 0) });
    }

    // 3) log the payment actually received
    await createBillingEvent({
      projectId: bill.projectId,
      type: "Payment",
      name: `Payment — ${bill.invoiceNumber || "short pay"}`,
      amount: paid,
      date: paymentDate || new Date().toISOString().slice(0, 10),
      notes: `Short pay against ${bill.invoiceNumber || "bill"} — unpaid balance rolls to next invoice`,
    });

    return NextResponse.json({ ok: true, rolledForward: Number(shortNet.toFixed(2)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
