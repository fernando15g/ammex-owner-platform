// POST /api/billing/edit-rollback — re-place a short pay's rolled-back weight
// onto different lines, WITHOUT changing any dollar amount. Body:
// { invoiceId, paymentId, allocation }. allocation = null → Auto (proportional),
// array of { key, qty } → Manual.
//
// Locked once the rolled weight has re-billed: if any invoice on the project is
// newer than this one, the rolled pounds may already have flowed into it, so the
// allocation is frozen (edit before you bill again, or not at all).
import { NextResponse } from "next/server";
import { audit } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { getPage } from "@/lib/notion/client";
import { mapBillingEvent, updateBillingEvent, getAllBillingEvents } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { editRollback } from "@/lib/rules/shortPayApply";
import { withTransaction } from "@/lib/data/tx";

export const dynamic = "force-dynamic";

// Sort key so "newer" is unambiguous even for same-day invoices.
function invoiceOrder(e) {
  return `${e.date || ""}|${e.invoiceNumber || ""}`;
}

export async function POST(req) {
  try {
    const { invoiceId, paymentId, allocation } = await req.json();
    if (!invoiceId || !paymentId) throw new Error("invoiceId and paymentId are required.");

    const invoice = mapBillingEvent(await getPage(invoiceId));
    const payment = mapBillingEvent(await getPage(paymentId));
    if (invoice.type !== "Bill") throw new Error("That isn't an invoice.");
    if (payment.type !== "Payment") throw new Error("That isn't a payment.");

    // LOCK: refuse if a newer invoice exists on the project (rolled weight may
    // already have re-billed into it).
    const allEvents = await getAllBillingEvents();
    const laterInvoice = allEvents.some(
      (e) => e.type === "Bill" && e.projectId === invoice.projectId && e.id !== invoice.id && invoiceOrder(e) > invoiceOrder(invoice)
    );
    if (laterInvoice) {
      throw new Error("A newer invoice exists on this job, so the rolled weight has already re-billed — the rollback is locked. Edits are only possible before the next invoice.");
    }

    const lines = await getAllLineItems();
    const result = await withTransaction(async (tx) =>
      editRollback({ invoice, payment, lines, allocation: allocation || null, tx, updateLineItem, updateBillingEvent })
    );

    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Payment",
      entityName: invoice.invoiceNumber || "invoice",
      entityId: invoiceId,
      changes: `rollback re-placed (${result.mode}) — $${(result.grossCut || 0).toFixed(2)} across lines`,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e), rollbackFailed: !!e.rollbackFailed }, { status: 400 });
  }
}
