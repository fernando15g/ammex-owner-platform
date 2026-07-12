// POST /api/projects — create a project. This is the path that did not exist:
// projects could only be born in Notion. Optionally attaches a bid, which is the
// link that lets the project resolve its line items (and therefore its contract).
import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { createProject } from "@/lib/notion/projectRepository";
import { validateProjectEdit } from "@/lib/rules/mutations";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const p = body.project || body;
    validateProjectEdit(p);
    const result = await createProject(p);

    // Creating a project from a bid means the bid was won. Say so, rather than
    // making someone remember to. This also activates the bid's line items,
    // which is what gives the project its contract value.
    if (p.relatedBidId) {
      try {
        const { updateBid } = await import("@/lib/notion/bidRepository");
        const { activateLineItemsForBid } = await import("@/lib/notion/lineItemRepository");
        const { getPage } = await import("@/lib/notion/client");
        const { mapBid } = await import("@/lib/rules/money");
        const bid = mapBid(await getPage(p.relatedBidId));   // one page, not the whole workspace
        if (bid && bid.status !== "Awarded") {
          await updateBid(p.relatedBidId, { status: "Awarded" });
          await activateLineItemsForBid(p.relatedBidId);
          await audit({
            actor: currentActor(),
            action: "Update",
            entity: "Bid",
            entityName: bid.name || "",
            entityId: p.relatedBidId,
            changes: `Status: ${bid.status} → Awarded (a project was created from it)`,
          });
        }
      } catch (e) {
        // Never let this take down the project creation itself.
        console.error("[projects] couldn't auto-award the bid:", e.message || e);
      }
    }
    await audit({
      actor: currentActor(),
      action: "Create",
      entity: "Project",
      entityName: p.name || "",
      entityId: p.projectId || result.id,
      changes: `created${p.relatedBidId ? " (bid attached)" : ""}`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
