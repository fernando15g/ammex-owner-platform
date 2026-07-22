// POST /api/billing/short-pay — the standalone Short pay button on an unpaid
// invoice. Body: { eventId, paidAmount, paymentDate }.
// Thin wrapper: it creates the payment and defers to the SAME shared logic as
// "Log a payment", so the two paths can never drift apart.
import { NextResponse } from "next/server";
import { getPage } from "@/lib/notion/client";
import { mapBillingEvent, updateBillingEvent, createBillingEvent } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { applyShortPay, isShort } from "@/lib/rules/shortPayApply";
import { withTransaction } from "@/lib/data/tx";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { eventId, paidAmount, paymentDate, allocation } = await req.json();
    if (!eventId || paidAmount == null) throw new Error("eventId and paidAmount are required.");
    const paid = Number(paidAmount);

    const invoice = mapBillingEvent(await getPage(eventId));
    if (invoice.type !== "Bill") throw new Error("Short pay applies to invoices only.");
    if (!isShort(invoice, paid)) {
      const net = (invoice.amount || 0) - (invoice.retentionWithheld || 0);
      throw new Error(`$${paid.toFixed(2)} covers the expected net of $${net.toFixed(2)} — log it as a normal payment instead.`);
    }

    const date = paymentDate || todayLocal();
    const lines = await getAllLineItems();

    const result = await withTransaction(async (tx) => {
      const payment = await createBillingEvent({
        projectId: invoice.projectId, type: "Payment",
        name: `Payment — ${invoice.invoiceNumber || "short pay"}`,
        invoiceNumber: invoice.invoiceNumber || "",
        amount: paid, date,
        notes: `Short pay against ${invoice.invoiceNumber || "invoice"}`,
      });
      tx.onRollback("payment", async () => {
        const { archivePage } = await import("@/lib/notion/client");
        return archivePage(payment.id);
      });

      const applied = await applyShortPay({
        invoice, lines, paidAmount: paid, paymentId: payment.id, allocation,
        tx, updateLineItem, updateBillingEvent,
      });
      return { rolledForward: applied?.rolledForward || 0 };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e), rollbackFailed: !!e.rollbackFailed }, { status: 400 });
  }
}

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
