// PATCH /api/line-items/[id] — update a line item (qty, price, status, etc).
import { NextResponse } from "next/server";
import { updateLineItem } from "@/lib/notion/lineItemRepository";
export const dynamic = "force-dynamic";
export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const result = await updateLineItem(params.id, body.changes || body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
