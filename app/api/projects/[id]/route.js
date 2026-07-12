// PATCH /api/projects/[id] — edit a project's identity: name, Project ID,
// status, start date, foreman, and the bid it's attached to.
import { NextResponse } from "next/server";
import { updateProject } from "@/lib/notion/projectRepository";
import { validateProjectEdit } from "@/lib/rules/mutations";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const changes = body.changes || body;
    validateProjectEdit(changes);
    const result = await updateProject(params.id, changes);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
