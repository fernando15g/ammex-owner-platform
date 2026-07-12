// POST /api/projects/suggest-id — suggest the next Project ID by following the
// pattern already in use (e.g. 26-04 -> 26-05). Returns null rather than
// inventing a convention.
import { NextResponse } from "next/server";
import { suggestProjectId } from "@/lib/notion/projectRepository";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json({ ok: true, projectId: await suggestProjectId() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
