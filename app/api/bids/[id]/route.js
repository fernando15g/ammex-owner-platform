// PATCH /api/bids/[id] — amend a bid IN PLACE (metadata + numbers + recomputed
// economics). The client recomputes with the shared engine; this validates and
// writes everything to the SAME bid. No new bids, no orphans.
import { NextResponse } from "next/server";
import { updateBid } from "@/lib/notion/bidRepository";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const result = await updateBid(params.id, body.changes || body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
