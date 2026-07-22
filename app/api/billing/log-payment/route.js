// POST /api/billing/log-payment — log a payment against a specific invoice.
// Body: { projectId, billEventId, paidAmount, paymentDate }.
// Full payment -> logged and tied to the invoice. Short payment -> the shared
// short-pay logic runs (lib/rules/shortPayApply): the invoice KEEPS its amount,
// gets an [adjust] stamp, the unpaid quantity rolls back onto its lines to
// re-bill next cycle, and the payment carries the line-level audit trail.
import { NextResponse } from "next/server";
import { audit, describeChanges } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";
import { getPage } from "@/lib/notion/client";
import { mapBillingEvent, updateBillingEvent, createBillingEvent } from "@/lib/notion/billingRepository";
import { getAllLineItems, updateLineItem } from "@/lib/notion/lineItemRepository";
import { applyShortPay, isShort } from "@/lib/rules/shortPayApply";
import { withTransaction } from "@/lib/data/tx";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { projectId, billEventId, paidAmount, paymentDate, allocation } = await req.json();
    if (paidAmount == null || isNaN(Number(paidAmount))) throw new Error("A valid payment amount is required.");
    const paid = Number(paidAmount);
    const date = paymentDate || todayLocal();

    // No invoice selected -> a plain payment on the project.
    if (!billEventId) {
      if (!projectId) throw new Error("Select an invoice, or provide a project.");
      await createBillingEvent({ projectId, type: "Payment", name: "Payment", amount: paid, date, notes: "Payment (no invoice specified)" });
      return NextResponse.json({ ok: true, mode: "generic" });
    }

    const invoice = mapBillingEvent(await getPage(billEventId));
    if (invoice.type !== "Bill") throw new Error("Payments must be applied to an invoice.");

    // FULL payment — nothing to reconcile.
    if (!isShort(invoice, paid)) {
      await createBillingEvent({
        projectId: invoice.projectId, type: "Payment",
        name: `Payment — ${invoice.invoiceNumber || "invoice"}`,
        invoiceNumber: invoice.invoiceNumber || "",
        amount: paid, date,
        notes: `Payment against ${invoice.invoiceNumber || "invoice"}`,
      });
      await audit({
        actor: currentActor(),
        action: "Create",
        entity: "Payment",
        entityName: invoice.invoiceNumber || "payment",
        entityId: billEventId,
        changes: `payment $${paid.toFixed(2)} (full)`,
      });
      return NextResponse.json({ ok: true, mode: "full" });
    }

    // SHORT payment — invoice stamp + line rollback + payment, all or nothing.
    const lines = await getAllLineItems();
    const result = await withTransaction(async (tx) => {
      const payment = await createBillingEvent({
        projectId: invoice.projectId, type: "Payment",
        name: `Payment — ${invoice.invoiceNumber || "short pay"}`,
        invoiceNumber: invoice.invoiceNumber || "",
        amount: paid, date,
        notes: `Short pay against ${invoice.invoiceNumber || "invoice"}`,
      });
      tx.onRollback("payment", () => archiveSafely(payment.id));

      const applied = await applyShortPay({
        invoice, lines, paidAmount: paid, paymentId: payment.id, allocation,
        tx, updateLineItem, updateBillingEvent,
      });
      return { mode: "short", rolledForward: applied?.rolledForward || 0 };
    });

    await audit({
      actor: currentActor(),
      action: "Create",
      entity: "Payment",
      entityName: invoice.invoiceNumber || "payment",
      entityId: billEventId,
      changes: `SHORT PAY — received $${paid.toFixed(2)}, $${(result.rolledForward || 0).toFixed(2)} rolled to the next invoice`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e), rollbackFailed: !!e.rollbackFailed }, { status: 400 });
  }
}

async function archiveSafely(id) {
  const { archivePage } = await import("@/lib/notion/client");
  return archivePage(id);
}

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
