// PATCH /api/bids/[id] — amend a bid in place. When status flips to a terminal
// outcome, cascade to its line items: Lost/No Bid -> close; Awarded -> activate.
import { NextResponse } from "next/server";
import { updateBid } from "@/lib/notion/bidRepository";
import { closeLineItemsForBid, activateLineItemsForBid } from "@/lib/notion/lineItemRepository";
import { audit, describeChanges } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { getEverything } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const changes = body.changes || body;

    // capture the "before" so the log can say what actually moved
    const before = (await getEverything()).bids.find((b) => b.id === params.id) || {};
    const result = await updateBid(params.id, changes);
    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Bid",
      entityName: before.name || before.projectName || "",
      entityId: params.id,
      changes: describeChanges(before, changes),
    });

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
