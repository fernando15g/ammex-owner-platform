// POST /api/billing/create-bill — the itemized bill.
// Body: { projectId, relatedBidId, invoiceNumber, date, dueDate, notes,
//         retentionEnabled, retentionPct, rows: [{ lineId?, itemNo, description,
//         unit, unitPrice, estimateQty, toDateQty }] }
// Rows with lineId advance existing lines; rows without create NEW line items
// (weight-sheet additions). Retention only applies when the toggle is on.
import { NextResponse } from "next/server";
import { getAllLineItems, createLineItem, updateLineItem } from "@/lib/notion/lineItemRepository";
import { createBillingEvent } from "@/lib/notion/billingRepository";
import { computeInvoice } from "@/lib/rules/invoicing";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { projectId, relatedBidId, invoiceNumber, date, dueDate, notes, retentionEnabled = false, retentionPct = 0, rows = [] } = await req.json();
    if (!projectId) throw new Error("projectId required");
    if (!rows.length) throw new Error("No rows to bill.");
    const pct = retentionEnabled ? Number(retentionPct) || 0 : 0;
    const n = (v) => (v === "" || v == null ? null : Number(v));

    const all = await getAllLineItems();

    // 1) create any NEW lines (from the weight sheet)
    const working = []; // { line, toDateQty }
    for (const r of rows) {
      const toDate = n(r.toDateQty);
      if (r.lineId) {
        const line = all.find((l) => l.id === r.lineId);
        if (!line) continue;
        working.push({ line, toDateQty: toDate });
      } else {
        if (!r.description && !r.itemNo) continue;
        const created = await createLineItem({
          description: r.description || r.itemNo,
          itemNo: r.itemNo || "",
          bidId: relatedBidId || null,
          projectId,
          quantity: n(r.estimateQty) ?? toDate ?? 0,
          unit: r.unit || "LBS",
          unitPrice: n(r.unitPrice) ?? 0,
          furnInst: null,
          lineType: "Standard",
          status: "Active",
          qtyToDate: 0,
        });
        working.push({
          line: { id: created.id, itemNo: r.itemNo || "", description: r.description || "", quantity: n(r.estimateQty) ?? toDate ?? 0, unit: r.unit || "LBS", unitPrice: n(r.unitPrice) ?? 0, furnInst: null, qtyToDate: 0 },
          toDateQty: toDate,
        });
      }
    }
    if (!working.length) throw new Error("No valid rows.");

    // 2) compute the invoice (template math) over exactly these rows
    const lines = working.map((w) => w.line);
    const newQty = {};
    for (const w of working) if (w.toDateQty != null) newQty[w.line.id] = w.toDateQty;
    const inv = computeInvoice(lines, newQty, pct);
    if (inv.grossThisEstimate <= 0) throw new Error("Nothing to bill — no quantities advanced this period.");

    // 3) the invoice record, carrying a compact snapshot for view/short-pay/undo
    const snap = { r: pct, lines: inv.rows.filter((x) => x.thisQty !== 0).map((x) => ({ id: x.id, u: x.unitPrice, q: x.thisQty })) };
    const event = await createBillingEvent({
      projectId,
      type: "Bill",
      name: `Invoice ${invoiceNumber || ""}`.trim(),
      invoiceNumber: invoiceNumber || "",
      amount: Number(inv.grossThisEstimate.toFixed(2)),
      retentionWithheld: Number(inv.retention.toFixed(2)),
      date: date || null,
      dueDate: dueDate || null,
      pounds: Number(inv.thisQty.toFixed(1)),
      notes: `${notes || ""}\n[snap]${JSON.stringify(snap)}`,
    });

    // 4) advance lines + activate on the project
    for (const x of inv.rows) {
      const w = working.find((k) => k.line.id === x.id);
      if (!w) continue;
      const wasNew = !rows.find((r) => r.lineId === x.id);
      if (x.toDateQty !== x.prevQty || wasNew) {
        await updateLineItem(x.id, { qtyToDate: x.toDateQty, status: "Active", projectId });
      }
    }

    return NextResponse.json({ ok: true, eventId: event.id, totalDue: inv.totalDue });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
