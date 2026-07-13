// PATCH /api/bids/[id] — amend a bid in place. When status flips to a terminal
// outcome, cascade to its line items: Lost/No Bid -> close; Awarded -> activate.
import { NextResponse } from "next/server";
import { updateBid } from "@/lib/notion/bidRepository";
import { closeLineItemsForBid, activateLineItemsForBid } from "@/lib/notion/lineItemRepository";
import { audit, describeChanges } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { getPage } from "@/lib/notion/client";
import { mapBid } from "@/lib/rules/money";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const changes = body.changes || body;

    // The "before" snapshot, for the audit log. Read ONLY this bid — reading the
    // whole workspace here (as this used to) is slow enough to blow the
    // serverless timeout, and when it does, the save silently never happens.
    let before = {};
    try { before = mapBid(await getPage(params.id)) || {}; } catch {}

    // A bid can't be Lost while a project is built on it. Marking it Lost closes
    // its line items — which would silently strip that project's contract value
    // and leave a live job with nothing to bill. Block it; don't cascade it.
    if (changes.status === "Lost" || changes.status === "No Bid") {
      const { getEverything } = await import("@/lib/data");
      const all = await getEverything();
      const owner = all.projects.find((p) =>
        (p.relatedBidIds || []).includes(params.id) || p.relatedBidId === params.id
      );
      if (owner) {
        return NextResponse.json({
          ok: false,
          blocked: true,
          error:
            `This bid is attached to project "${owner.name}". Marking it ${changes.status} would close its ` +
            `line items and strip that project's contract value. Detach it from the project first.`,
        }, { status: 409 });
      }
    }

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
