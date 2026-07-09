// PATCH /api/billing/settings — update a project's billing settings
import { NextResponse } from "next/server";
import { updateProjectBilling } from "@/lib/notion/billingRepository";
export const dynamic = "force-dynamic";
export async function PATCH(req) {
  try {
    const body = await req.json();
    const result = await updateProjectBilling(body.projectId, body.settings || {});
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
