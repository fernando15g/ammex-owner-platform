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
