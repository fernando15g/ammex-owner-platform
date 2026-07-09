// PATCH /api/billing/event/[id] — edit a billing event
import { NextResponse } from "next/server";
import { updateBillingEvent } from "@/lib/notion/billingRepository";
export const dynamic = "force-dynamic";
export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const result = await updateBillingEvent(params.id, body.changes || body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
