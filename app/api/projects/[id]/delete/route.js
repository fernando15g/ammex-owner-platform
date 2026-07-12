// POST /api/projects/[id]/delete — delete a project, guarded.
// A project carrying billing history can't be deleted: its invoices and payments
// would be orphaned. The API says so and offers Closed instead.
import { NextResponse } from "next/server";
import { archiveProject } from "@/lib/notion/projectRepository";
import { getAllBillingEvents, groupEventsByProject } from "@/lib/notion/billingRepository";
import { getAllLineItems } from "@/lib/notion/lineItemRepository";
import { getEverything } from "@/lib/data";
import { planProjectDelete } from "@/lib/rules/mutations";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  try {
    const [data, events, lines] = await Promise.all([getEverything(), getAllBillingEvents(), getAllLineItems()]);
    const project = data.projects.find((p) => p.id === params.id);
    if (!project) throw new Error("Project not found.");

    const evts = groupEventsByProject(events).get(params.id) || [];
    const plines = lines.filter(
      (l) => l.projectId === params.id || (project.relatedBidId && l.bidId === project.relatedBidId)
    );

    const plan = planProjectDelete(project, evts, plines);
    if (!plan.canDelete) {
      return NextResponse.json({ ok: false, blocked: true, error: plan.reason }, { status: 409 });
    }

    await archiveProject(params.id);
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
