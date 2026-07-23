// POST /api/projects/[id]/delete — delete a project and everything tied to it.
//
// A project can't just be archived on its own: its invoices, payments and line
// items reference it, and leaving them behind orphans real money records. So the
// delete CASCADES — billing events and line items go with it, all inside one
// transaction, so a half-delete can't leave the books in a broken state.
//
// Body: { deleteBid } — also archive the linked bid (a test job's bid usually
// goes with it; a real one you may want to keep in the pipeline).
//
// The "type DELETE" confirmation in the UI is the safeguard. This is deliberate:
// the owner shouldn't have to open Notion to clean up after testing.
import { NextResponse } from "next/server";
import { audit } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { archivePage } from "@/lib/notion/client";
import { archiveProject } from "@/lib/notion/projectRepository";
import { getAllBillingEvents, groupEventsByProject } from "@/lib/notion/billingRepository";
import { getAllLineItems } from "@/lib/notion/lineItemRepository";
import { getEverything } from "@/lib/data";
import { withTransaction } from "@/lib/data/tx";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  try {
    let body = {};
    try { body = await req.json(); } catch {}
    const deleteBid = !!body.deleteBid;

    const [data, events, lines] = await Promise.all([getEverything(), getAllBillingEvents(), getAllLineItems()]);
    const project = data.projects.find((p) => p.id === params.id);
    if (!project) throw new Error("Project not found.");

    const evts = groupEventsByProject(events).get(params.id) || [];
    const plines = lines.filter(
      (l) => l.projectId === params.id || (project.relatedBidId && l.bidId === project.relatedBidId)
    );

    await withTransaction(async () => {
      for (const e of evts) await archivePage(e.id);          // invoices, payments, COs, retention
      for (const l of plines) await archivePage(l.id);        // its line items
      await archiveProject(params.id);
      if (deleteBid && project.relatedBidId) await archivePage(project.relatedBidId);
    });

    const parts = [`${evts.length} billing event(s)`, `${plines.length} line item(s)`];
    if (deleteBid && project.relatedBidId) parts.push("its bid");
    await audit({
      actor: currentActor(),
      action: "Delete",
      entity: "Project",
      entityName: project.name || "",
      entityId: project.projectId || params.id,
      changes: `deleted with ${parts.join(", ")}`,
    });

    return NextResponse.json({
      ok: true, deleted: true,
      eventsArchived: evts.length,
      linesArchived: plines.length,
      bidArchived: !!(deleteBid && project.relatedBidId),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
