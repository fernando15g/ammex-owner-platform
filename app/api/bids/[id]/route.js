// PATCH /api/bids/[id] — amend a bid in place. When status flips to a terminal
// outcome, cascade to its line items: Lost/No Bid -> close; Awarded -> activate.
import { NextResponse } from "next/server";
import { updateBid } from "@/lib/notion/bidRepository";
import { closeLineItemsForBid, activateLineItemsForBid } from "@/lib/notion/lineItemRepository";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const changes = body.changes || body;
    const result = await updateBid(params.id, changes);

    let lineItemCascade = null;
    if (changes.status === "Lost" || changes.status === "No Bid") {
      lineItemCascade = await closeLineItemsForBid(params.id);
    } else if (changes.status === "Awarded") {
      lineItemCascade = await activateLineItemsForBid(params.id);
    }
    return NextResponse.json({ ok: true, ...result, lineItemCascade });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
