// POST /api/bids/[id]/specialty — replace a bid's SPECIALTY line items with the
// set priced on the bid form. Rebar lines are never touched.
//
// This is what lets the OS price PT/mesh like the calculator AND have it be
// billable: each specialty scope becomes a real line item (PT LBS / SF / HRS),
// so it flows into contract value, the bid sheet, and invoicing — one source of
// truth, no separate specialty store to drift.
//
// Body: { lines: [{ type, qty, unitPrice, productivity }] }  (already priced by
// the client; qty/unitPrice are what bills, productivity rides for cost/hours).
import { NextResponse } from "next/server";
import { audit } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { archivePage } from "@/lib/notion/client";
import { getAllLineItems, createLineItem, updateLineItem } from "@/lib/notion/lineItemRepository";
import { isSpecialtyLine } from "@/lib/rules/specialty";

export const dynamic = "force-dynamic";

// type → the unit that makes a line bill correctly and classify as that specialty
const UNIT_FOR = { "PT Building": "PT LBS", Mesh: "SF", "PT Bridge": "HRS" };

export async function POST(req, { params }) {
  try {
    const { lines = [] } = await req.json();
    const bidId = params.id;

    const all = await getAllLineItems();
    const existingSpecialty = all.filter((l) => l.bidId === bidId && isSpecialtyLine(l));

    // Archive the bid's current specialty lines, then recreate from the form.
    // Rebar lines on the same bid are left completely alone.
    for (const l of existingSpecialty) await archivePage(l.id);

    const created = [];
    for (const ln of lines) {
      const unit = UNIT_FOR[ln.type];
      if (!unit) continue;
      const qty = Number(ln.qty) || 0;
      if (qty <= 0) continue;
      created.push(await createLineItem({
        bidId,
        description: ln.type,
        itemNo: "",
        quantity: qty,
        unit,
        unitPrice: Number(ln.unitPrice) || 0,
        specialtyType: ln.type,   // EXPLICIT stamp — the read side trusts this, never the unit
        productivity: ln.productivity != null && ln.productivity !== "" ? Number(ln.productivity) : null,
        lineType: "Standard",
        status: "Proposed",
      }));
    }

    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Bid",
      entityName: "specialty scope",
      entityId: bidId,
      changes: `specialty lines set (${created.length})`,
    });

    return NextResponse.json({ ok: true, created: created.length, archived: existingSpecialty.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
