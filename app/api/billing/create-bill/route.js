// POST /api/billing/create-bill — the itemized bill.
// Body: { projectId, relatedBidId, invoiceNumber, date, dueDate, notes,
//         retentionEnabled, retentionPct, rows: [{ lineId?, itemNo, description,
//         unit, unitPrice, estimateQty, toDateQty }] }
//
// ORDER MATTERS: validate and compute the FULL invoice BEFORE writing anything
// to Notion. If the bill is invalid ("nothing to bill", etc.) we throw before
// any create/update — so a rejected bill leaves ZERO records behind.
import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { getAllLineItems, createLineItem, updateLineItem } from "@/lib/notion/lineItemRepository";
import { createBillingEvent } from "@/lib/notion/billingRepository";
import { computeInvoice } from "@/lib/rules/invoicing";
import { lineRef } from "@/lib/rules/appIds";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { projectId, relatedBidId, relatedBidIds, invoiceNumber, date, dueDate, notes, retentionEnabled = false, retentionPct = 0, rows = [], billingJobReference = "" } = await req.json();
    if (!projectId) throw new Error("projectId required");
    if (!rows.length) throw new Error("No rows to bill.");
    const pct = retentionEnabled ? Number(retentionPct) || 0 : 0;
    const n = (v) => (v === "" || v == null ? null : Number(v));

    const all = await getAllLineItems();

    // -------------------------------------------------------------------------
    // PHASE A — PLAN ONLY (no writes). Build the working set in memory. New
    // lines are planned with a temp id so we can compute the invoice; they are
    // only actually created in Phase C, AFTER validation passes.
    // -------------------------------------------------------------------------
    const plan = []; // { kind: "existing"|"new", tempId, stored?, line, toDateQty, edited?, createPayload? }
    let tmp = 0;
    for (const r of rows) {
      const toDate = n(r.toDateQty);
      if (r.lineId) {
        const stored = all.find((l) => l.id === r.lineId);
        if (!stored) continue;
        const line = {
          ...stored,
          itemNo: r.itemNo ?? stored.itemNo,
          description: r.description ?? stored.description,
          quantity: n(r.estimateQty) ?? stored.quantity,
          unit: r.unit || stored.unit,
          unitPrice: n(r.unitPrice) ?? stored.unitPrice,
        };
        const edited = line.itemNo !== stored.itemNo || line.description !== stored.description || line.quantity !== stored.quantity || line.unit !== stored.unit || line.unitPrice !== stored.unitPrice;
        plan.push({ kind: "existing", line, toDateQty: toDate, edited });
      } else {
        if (!r.description && !r.itemNo) continue;
        const tempId = `tmp-${tmp++}`;
        const createPayload = {
          description: r.description || r.itemNo,
          itemNo: r.itemNo || "",
          // a new line born on the invoice belongs to the first bid (or none)
          bidId: (relatedBidIds && relatedBidIds[0]) || relatedBidId || null,
          projectId,
          quantity: n(r.estimateQty) ?? toDate ?? 0,
          unit: r.unit || "LBS",
          unitPrice: n(r.unitPrice) ?? 0,
          furnInst: null,
          lineType: "Standard",
          status: "Active",
          qtyToDate: 0,
        };
        plan.push({
          kind: "new", tempId, createPayload,
          line: { id: tempId, itemNo: createPayload.itemNo, description: createPayload.description, quantity: createPayload.quantity, unit: createPayload.unit, unitPrice: createPayload.unitPrice, furnInst: null, qtyToDate: 0 },
          toDateQty: toDate,
        });
      }
    }
    if (!plan.length) throw new Error("No valid rows.");

    // -------------------------------------------------------------------------
    // PHASE B — VALIDATE (still no writes). Compute the invoice; throw if empty.
    // -------------------------------------------------------------------------
    const lines = plan.map((p) => p.line);
    const newQty = {};
    for (const p of plan) if (p.toDateQty != null) newQty[p.line.id] = p.toDateQty;
    const inv = computeInvoice(lines, newQty, pct);
    if (inv.grossThisEstimate <= 0) {
      throw new Error("Nothing to bill — no quantities advanced this period. Nothing was saved.");
    }

    // -------------------------------------------------------------------------
    // PHASE C — COMMIT (writes happen only now, after validation passed).
    // 1) create the new lines, 2) remap temp ids -> real ids in the invoice,
    // 3) create the invoice event, 4) advance/patch lines.
    // -------------------------------------------------------------------------
    const idMap = {};      // temp id -> real Notion page id
    const appIdMap = {};    // temp id -> application-owned Line ID
    for (const p of plan) {
      if (p.kind === "new") {
        const created = await createLineItem(p.createPayload);
        idMap[p.tempId] = created.id;
        appIdMap[p.tempId] = created.lineId || null;
      }
    }
    const realId = (id) => idMap[id] || id;
    const appIdOf = (id) => {
      if (appIdMap[id]) return appIdMap[id];
      const existing = all.find((l) => l.id === id);
      return existing?.lineId || null;
    };

    // The snapshot references the APPLICATION-OWNED Line ID. The Notion page id
    // rides along only as a bridge for records written before IDs existed; it can
    // be dropped once the backfill has swept through.
    // ref: the customer's job reference AS BILLED, frozen with the invoice — a
    // reprint matches the paper they have even if the project's changes later.
    const snap = {
      r: pct,
      ...(billingJobReference ? { ref: String(billingJobReference).trim() } : {}),
      lines: inv.rows.filter((x) => x.thisQty !== 0).map((x) => ({
        lid: appIdOf(x.id),
        id: realId(x.id),
        u: x.unitPrice,
        q: x.thisQty,
      })),
    };
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

    for (const x of inv.rows) {
      const p = plan.find((k) => k.line.id === x.id);
      if (!p) continue;
      const id = realId(x.id);
      const wasNew = p.kind === "new";
      if (x.toDateQty !== x.prevQty || wasNew || p.edited) {
        const patch = { qtyToDate: x.toDateQty, status: "Active", projectId };
        if (p.edited) {
          patch.itemNo = p.line.itemNo;
          patch.description = p.line.description;
          patch.quantity = p.line.quantity;
          patch.unit = p.line.unit;
          patch.unitPrice = p.line.unitPrice;
        }
        await updateLineItem(id, patch);
      }
    }

    await audit({
      actor: currentActor(),
      action: "Create",
      entity: "Invoice",
      entityName: invoiceNumber || "invoice",
      entityId: event.id,
      changes: `billed $${inv.grossThisEstimate.toFixed(2)}${inv.retention ? `, retention $${inv.retention.toFixed(2)}` : ""}, ${inv.rows.filter((r) => r.thisQty !== 0).length} line(s)`,
    });
    return NextResponse.json({ ok: true, eventId: event.id, totalDue: inv.totalDue });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
