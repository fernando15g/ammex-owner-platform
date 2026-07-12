// POST /api/billing/delete-event — delete a billing event, reversing EVERYTHING
// it caused. Body: { eventId }.
//
// Invoice: roll back the line quantities it billed (from its [snap]).
// Payment:  if it was a short pay, undo the whole short pay — restore the line
//           quantities it rolled back AND strip the [adjust] stamp from the
//           invoice. (This was previously missed, which left invoices marked
//           short-paid with no payment to justify it.)
// Change order: no side effects; its value was the amount itself.
//
// Records are ARCHIVED (Notion trash / a deleted_at column later), never purged.
import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { getPage, archivePage } from "@/lib/notion/client";
import { mapBillingEvent, updateBillingEvent, getAllBillingEvents } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { readTag, planShortPayUnwind } from "@/lib/rules/mutations";
import { resolveLine } from "@/lib/rules/appIds";
import { findInvoiceFor } from "@/lib/rules/shortPayApply";
import { withTransaction } from "@/lib/data/tx";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { eventId } = await req.json();
    if (!eventId) throw new Error("eventId required");
    const ev = mapBillingEvent(await getPage(eventId));

    const result = await withTransaction(async (tx) => {
      // --- INVOICE: reverse the quantities it billed ---------------------------
      if (ev.type === "Bill") {
        const snap = readTag(ev.notes, "snap");
        if (snap) {
          const all = await getAllLineItems();
          for (const l of snap.lines || []) {
            const line = resolveLine(l, all);
            if (!line) continue;
            const before = line.qtyToDate || 0;
            const after = Math.max(before - (l.q || 0), 0);
            await updateLineItem(line.id, { qtyToDate: after });
            tx.onRollback(`line ${line.lineId || line.id} qty`, () => updateLineItem(line.id, { qtyToDate: before }));
          }
        }
      }

      // --- PAYMENT: if it was a short pay, unwind the whole thing --------------
      if (ev.type === "Payment" && readTag(ev.notes, "carry")) {
        const [allEvents, allLines] = await Promise.all([getAllBillingEvents(), getAllLineItems()]);
        const invoice = findInvoiceFor(ev, allEvents);
        const unwind = planShortPayUnwind(ev, invoice);
        if (unwind) {
          for (const r of unwind.lineRestores) {
            const line = resolveLine(r.ref, allLines);
            if (!line) continue;
            const before = line.qtyToDate || 0;
            await updateLineItem(line.id, { qtyToDate: before + r.addQty });
            tx.onRollback(`line ${line.lineId || line.id} qty`, () => updateLineItem(line.id, { qtyToDate: before }));
          }
          if (unwind.invoiceId) {
            const beforeNotes = invoice.notes;
            await updateBillingEvent(unwind.invoiceId, { notes: unwind.invoiceNotes });
            tx.onRollback("invoice adjust stamp", () => updateBillingEvent(unwind.invoiceId, { notes: beforeNotes }));
          }
        }
      }

      await archivePage(eventId);
      return { deleted: true, type: ev.type };
    });

    await audit({
      actor: currentActor(),
      action: "Delete",
      entity: ev.type === "Bill" ? "Invoice" : ev.type,
      entityName: ev.invoiceNumber || ev.name || "",
      entityId: ev.eventId || eventId,
      changes: `deleted ($${(ev.amount || 0).toFixed(2)}), effects reversed`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e), rollbackFailed: !!e.rollbackFailed }, { status: 400 });
  }
}
