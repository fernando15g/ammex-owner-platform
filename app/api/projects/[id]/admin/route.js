// GET /api/projects/[id]/admin — the project plus the bids it could attach to.
// Feeds the Project details modal, which reuses the project page's own form.
import { NextResponse } from "next/server";
import { getProjectAdmin } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const data = await getProjectAdmin(params.id);
    if (!data.project) throw new Error("Project not found.");
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
