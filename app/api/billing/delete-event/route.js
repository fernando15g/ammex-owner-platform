// POST /api/billing/delete-event — delete a billing event, REVERSING its effects.
// Body: { eventId }.
// An invoice (Bill) carries a line snapshot: deleting it rolls each line's
// qty-to-date back by what that invoice billed, so quantities and contract math
// stay in sync. Payments and change orders just remove cleanly (their effect is
// the amount itself). Notion pages are ARCHIVED (recoverable), not hard-purged.
import { NextResponse } from "next/server";
import { getPage, archivePage } from "@/lib/notion/client";
import { mapBillingEvent } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { eventId } = await req.json();
    if (!eventId) throw new Error("eventId required");
    const ev = mapBillingEvent(await getPage(eventId));

    // Reverse an invoice's line-quantity effect before removing it
    if (ev.type === "Bill") {
      const m = (ev.notes || "").match(/\[snap\](\{.*\})\s*$/s);
      if (m) {
        const snap = JSON.parse(m[1]);
        const all = await getAllLineItems();
        for (const l of snap.lines || []) {
          const line = all.find((x) => x.id === l.id);
          if (!line) continue;
          await updateLineItem(l.id, { qtyToDate: Math.max((line.qtyToDate || 0) - (l.q || 0), 0) });
        }
      }
    }

    await archivePage(eventId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
