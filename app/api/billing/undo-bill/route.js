// POST /api/billing/undo-bill — undo the LAST invoice: reverse each line's
// qty-to-date by the snapshot, and void the event (zeroed, kept for audit —
// never deleted). Body: { eventId }.
import { NextResponse } from "next/server";
import { getPage } from "@/lib/notion/client";
import { mapBillingEvent, updateBillingEvent } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { resolveLine } from "@/lib/rules/appIds";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { eventId } = await req.json();
    const bill = mapBillingEvent(await getPage(eventId));
    if (bill.type !== "Bill") throw new Error("Only bills can be undone.");
    const m = (bill.notes || "").match(/\[snap\](\{.*\})\s*$/s);
    if (!m) throw new Error("No snapshot on this bill — undo manually.");
    if ((bill.amount || 0) === 0) throw new Error("This bill is already voided.");
    const snap = JSON.parse(m[1]);

    const all = await getAllLineItems();
    for (const sl of snap.lines || []) {
      const line = resolveLine(sl, all);
      if (!line) continue;
      await updateLineItem(line.id, { qtyToDate: Math.max((line.qtyToDate || 0) - (sl.q || 0), 0) });
    }
    await updateBillingEvent(eventId, {
      name: `VOID — ${bill.name || bill.invoiceNumber || "invoice"}`,
      amount: 0,
      retentionWithheld: 0,
      pounds: 0,
      notes: `${bill.notes}\n[voided] undone — quantities reversed`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
