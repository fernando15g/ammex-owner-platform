// PATCH /api/projects/[id] — edit a project's identity: name, Project ID,
// status, start date, foreman, and the bid it's attached to.
import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { updateProject } from "@/lib/notion/projectRepository";
import { validateProjectEdit } from "@/lib/rules/mutations";
import { getPage } from "@/lib/notion/client";
import { mapProjectLite } from "@/lib/data";

export const dynamic = "force-dynamic";

// GET — the project plus the bid options its form needs (used by the edit modal
// so it can show the same fields as the project page without navigating away).
export async function GET(req, { params }) {
  try {
    const { getProjectAdmin } = await import("@/lib/data");
    const data = await getProjectAdmin(params.id);
    if (!data?.project) throw new Error("Project not found.");
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const changes = body.changes || body;
    validateProjectEdit(changes);

    // Read ONLY this project for the audit "before". Reading the whole workspace
    // on every save is slow enough to blow the serverless timeout — and when it
    // does, the write never happens and the change silently doesn't stick.
    let before = {};
    try { before = mapProjectLite(await getPage(params.id)) || {}; } catch {}

    // GC lives on the BID, not the project — write it through, so there's one
    // source of truth. (A project with no bid has nowhere to put it, which is
    // consistent with "no bid attached = the project isn't finished yet".)
    const { gc, ...projectChanges } = changes;
    if (gc !== undefined) {
      const bidId = projectChanges.relatedBidId ?? before.relatedBidId;
      if (bidId) {
        const { updateBid } = await import("@/lib/notion/bidRepository");
        await updateBid(bidId, { gc });
      }
    }

    // A bid attached to a project that has PROGRESSED was, by definition, won.
    // Attaching used to be the only trigger — so moving a project along the stage
    // path left its bid sitting in "Reviewing", which is the system lying to
    // itself. Any bid on a project past Awarded must say Awarded.
    const progressed = ["Awarded", "Mobilizing", "Active", "Punchlist", "Waiting on billing", "Closed", "Paid"];
    const nowStatus = projectChanges.status ?? before.status;
    const bidIds = projectChanges.relatedBidIds ?? before.relatedBidIds ?? (before.relatedBidId ? [before.relatedBidId] : []);

    if (progressed.includes(nowStatus) && bidIds.length) {
      const { updateBid } = await import("@/lib/notion/bidRepository");
      const { activateLineItemsForBid } = await import("@/lib/notion/lineItemRepository");
      const { mapBid } = await import("@/lib/rules/money");
      for (const bidId of bidIds) {
        try {
          const b = mapBid(await getPage(bidId));
          if (b && b.status !== "Awarded") {
            await updateBid(bidId, { status: "Awarded" });
            await activateLineItemsForBid(bidId);
            await audit({
              actor: currentActor(), action: "Update", entity: "Bid",
              entityName: b.name || "", entityId: bidId,
              changes: `Status: ${b.status} → Awarded (its project is ${nowStatus})`,
            });
          }
        } catch (e) {
          console.error("[projects] couldn't align bid status:", e.message || e);
        }
      }
    }

    const newBidId = null;   // handled above
    if (newBidId) {
      try {
        const { updateBid } = await import("@/lib/notion/bidRepository");
        const { activateLineItemsForBid } = await import("@/lib/notion/lineItemRepository");
        const { mapBid } = await import("@/lib/rules/money");
        const bid = mapBid(await getPage(newBidId));
        if (bid && bid.status !== "Awarded") {
          await updateBid(newBidId, { status: "Awarded" });
          await activateLineItemsForBid(newBidId);
          await audit({
            actor: currentActor(),
            action: "Update",
            entity: "Bid",
            entityName: bid.name || "",
            entityId: newBidId,
            changes: `Status: ${bid.status} → Awarded (attached to project "${before.name}")`,
          });
        }
      } catch (e) {
        console.error("[projects] couldn't auto-award the attached bid:", e.message || e);
      }
    }

    const result = await updateProject(params.id, projectChanges);
    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Project",
      entityName: before.name || changes.name || "",
      entityId: before.projectId || params.id,
      changes: describeChanges(before, changes),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
