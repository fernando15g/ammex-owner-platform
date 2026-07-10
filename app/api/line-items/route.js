// POST /api/line-items — create line item(s). Body: { items: [...] } or single.
import { NextResponse } from "next/server";
import { createLineItem } from "@/lib/notion/lineItemRepository";
export const dynamic = "force-dynamic";
export async function POST(req) {
  try {
    const body = await req.json();
    const items = body.items || [body.item || body];
    const results = [];
    for (const it of items) results.push(await createLineItem(it));
    return NextResponse.json({ ok: true, created: results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
