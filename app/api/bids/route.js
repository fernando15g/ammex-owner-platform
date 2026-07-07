// POST /api/bids — create a bid tracking record (metadata + numbers, no math).
import { NextResponse } from "next/server";
import { createBid } from "@/lib/notion/bidRepository";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const result = await createBid(body.metadata || body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
