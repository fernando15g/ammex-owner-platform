// POST /api/billing/event — create a billing event (bill / payment / change order)
import { NextResponse } from "next/server";
import { createBillingEvent } from "@/lib/notion/billingRepository";
export const dynamic = "force-dynamic";
export async function POST(req) {
  try {
    const body = await req.json();
    const result = await createBillingEvent(body.event || body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
