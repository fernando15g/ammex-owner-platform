// GET /api/reconcile — run the checks and report. Read-only: it never fixes
// anything. A tool that quietly repaired your books would be worse than the bug.
import { NextResponse } from "next/server";
import { getReconciliation } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, report: await getReconciliation() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
