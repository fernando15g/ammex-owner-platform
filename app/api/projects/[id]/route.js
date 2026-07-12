// PATCH /api/projects/[id] — edit a project's identity: name, Project ID,
// status, start date, foreman, and the bid it's attached to.
import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { updateProject } from "@/lib/notion/projectRepository";
import { validateProjectEdit } from "@/lib/rules/mutations";
import { getEverything } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const changes = body.changes || body;
    validateProjectEdit(changes);
    const before = (await getEverything()).projects.find((p) => p.id === params.id) || {};
    const result = await updateProject(params.id, changes);
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
