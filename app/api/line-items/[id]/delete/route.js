// POST /api/line-items/[id]/delete — delete a line item, with the money guard:
// UNBILLED lines (qty-to-date = 0) archive cleanly. BILLED lines are blocked —
// deleting billed work would desync invoices from the contract; close/void it
// instead (status Closed keeps history and stops future billing).
import { NextResponse } from "next/server";
import { getPage, archivePage } from "@/lib/notion/client";
import { mapLineItem, updateLineItem } from "@/lib/notion/lineItemRepository";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  try {
    const { mode } = await req.json().catch(() => ({}));
    const line = mapLineItem(await getPage(params.id));
    const billed = (line.qtyToDate || 0) > 0;

    if (billed && mode !== "close") {
      return NextResponse.json({
        ok: false,
        blocked: true,
        error: `"${line.description}" has ${line.qtyToDate} billed — deleting it would desync your invoices from the contract. Close it instead (keeps history, stops future billing).`,
      }, { status: 409 });
    }

    if (billed && mode === "close") {
      await updateLineItem(params.id, { status: "Closed" });
      return NextResponse.json({ ok: true, closed: true });
    }

    await archivePage(params.id);
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
