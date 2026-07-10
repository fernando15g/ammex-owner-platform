// POST /api/billing/create-bill — the itemized bill. Body: { projectId,
// invoiceNumber, date, dueDate, notes, retentionPct, newQty: {lineId: qty} }.
// Computes the invoice (template math), creates ONE Billing Event carrying a
// snapshot (for viewing + short-pay back-solve), and advances each line's
// qty-to-date. Lines activate (status Active + project link) on first billing.
import { NextResponse } from "next/server";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { createBillingEvent } from "@/lib/notion/billingRepository";
import { computeInvoice } from "@/lib/rules/invoicing";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { projectId, relatedBidId, invoiceNumber, date, dueDate, notes, retentionPct = 10, newQty = {} } = await req.json();
    if (!projectId) throw new Error("projectId required");

    const all = await getAllLineItems();
    const lines = all.filter((li) => (li.projectId === projectId || (relatedBidId && li.bidId === relatedBidId)) && li.status !== "Closed");
    if (lines.length === 0) throw new Error("No line items for this project — create the bid sheet first.");

    const inv = computeInvoice(lines, newQty, retentionPct);
    if (inv.grossThisEstimate <= 0) throw new Error("Nothing to bill — no quantities advanced this period.");

    // snapshot: what this invoice billed per line (compact, for short-pay later)
    const snap = { r: retentionPct, lines: inv.rows.filter((r) => r.thisQty !== 0).map((r) => ({ id: r.id, u: r.unitPrice, q: r.thisQty })) };
    const noteText = `${notes || ""}\n[snap]${JSON.stringify(snap)}`;

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
      notes: noteText,
    });

    // advance each line's qty-to-date; activate on the project
    for (const r of inv.rows) {
      const changed = r.toDateQty !== r.prevQty;
      const line = lines.find((l) => l.id === r.id);
      const needsActivation = line && (line.status !== "Active" || !line.projectId);
      if (changed || needsActivation) {
        await updateLineItem(r.id, {
          qtyToDate: r.toDateQty,
          status: "Active",
          projectId,
        });
      }
    }

    return NextResponse.json({ ok: true, eventId: event.id, totalDue: inv.totalDue, gross: inv.grossThisEstimate, retention: inv.retention });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
