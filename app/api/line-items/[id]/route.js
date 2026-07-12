// PATCH /api/line-items/[id] — edit a line item, through the rules layer.
// qtyToDate is owned by invoicing and cannot be set here. Bid quantity can't drop
// below what's billed, and the unit price of a billed line is frozen (changing it
// would make past invoices disagree with the contract).
import { NextResponse } from "next/server";
import { getPage } from "@/lib/notion/client";
import { mapLineItem, updateLineItem } from "@/lib/notion/lineItemRepository";
import { validateLineEdit } from "@/lib/rules/mutations";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  try {
    const body = await req.json();
    const changes = body.changes || body;
    const internal = body.internal === true; // invoicing flow may move qtyToDate

    const line = mapLineItem(await getPage(params.id));
    validateLineEdit(line, changes, { allowQtyToDate: internal });

    const result = await updateLineItem(params.id, changes);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
