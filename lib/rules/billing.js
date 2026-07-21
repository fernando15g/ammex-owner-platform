// =============================================================================
// BILLING RULES — ALL billing math lives here, in code (never Notion formulas),
// so it's one auditable source of truth and it survives the Postgres migration.
//
// Notion stores raw facts (contract value, each bill/payment/change-order event,
// retention settings). This engine computes everything derived:
//   revised contract, billed/paid to date, outstanding, remaining to bill,
//   retention held (percent or flat), aging buckets, unbilled-in-field.
// =============================================================================

// --- event helpers -----------------------------------------------------------
export const EVENT_TYPES = { BILL: "Bill", PAYMENT: "Payment", CHANGE_ORDER: "Change Order", RETENTION_BILL: "Retention Bill", RETENTION_PAYMENT: "Retention Payment" };

function sumBy(events, type) {
  return events.filter((e) => e.type === type).reduce((a, e) => a + (e.amount || 0), 0);
}

// Days between a due date and "now" (positive = overdue by N days).
function daysOverdue(dueDate, asOf = new Date()) {
  if (!dueDate) return null;
  return Math.floor((asOf - new Date(dueDate)) / 86400000);
}

// --- retention ---------------------------------------------------------------
// Held = money withheld until closeout. Percent or flat, only when enabled.
// If bills carry explicit "retentionWithheld", we trust that sum; otherwise we
// derive it from the setting (percent of billed, or the flat amount).
export function retentionHeld(project, billedToDate, explicitWithheldSum) {
  if (!project.retentionEnabled) return 0;
  if (explicitWithheldSum && explicitWithheldSum > 0) return explicitWithheldSum;
  if (typeof project.retentionPercent === "number" && project.retentionPercent > 0) {
    return billedToDate * (project.retentionPercent / 100);
  }
  if (typeof project.retentionFlatAmount === "number" && project.retentionFlatAmount > 0) {
    return project.retentionFlatAmount;
  }
  return 0;
}

// --- the full per-project billing picture ------------------------------------
// project: mapped project (retention settings + optional contract override).
// events: that project's Billing Events. lines: the project's line items — the
// contract value is DERIVED from these (sum of qty x unit price), unless an
// explicit override is set on the project.
export function computeBilling(project, events, lines = [], asOf = new Date()) {
  const bills = events.filter((e) => e.type === EVENT_TYPES.BILL);
  const changeOrders = sumBy(events, EVENT_TYPES.CHANGE_ORDER);

  // Contract value: derived live from the line items (the bid sheet / billing
  // schedule). Manual override wins only if explicitly set (with a reason).
  const linesContract = lines.reduce((a, li) => a + (li.quantity || 0) * (li.unitPrice || 0), 0);
  const coLinesValue = lines.filter((li) => li.lineType === "CO").reduce((a, li) => a + (li.quantity || 0) * (li.unitPrice || 0), 0);
  const hasOverride = typeof project.billingContractValue === "number" && project.billingContractValue > 0;
  const baseContract = hasOverride ? project.billingContractValue : linesContract;
  const contractSource = hasOverride ? "override" : "lines";
  const revisedContract = baseContract + changeOrders;

  const grossBilled = sumBy(events, EVENT_TYPES.BILL);   // the face value of every invoice sent
  const paidToDate = sumBy(events, EVENT_TYPES.PAYMENT);
  const explicitWithheld = bills.reduce((a, e) => a + (e.retentionWithheld || 0), 0);

  // Short-pay rollforwards: billed on an invoice, not collected, and NOT owed on
  // that invoice anymore (it re-bills on the next one). Subtract from A/R so it
  // isn't double-counted against the re-bill.
  const rolledForward = bills.reduce((a, e) => {
    const m = (e.notes || "").match(/\[adjust\](\{.*?\})\s*$/s);
    if (!m) return a;
    try { return a + (JSON.parse(m[1]).rolledForward || 0); } catch { return a; }
  }, 0);

  // BILLED must NET OUT the rollforward, or the same work is counted twice.
  //
  // Short pay: invoice #1 bills $450, $50 isn't paid and rolls back onto the
  // lines, invoice #2 re-bills that $50 inside its own total. The invoices now
  // SUM to $950 — but only $900 of work exists. Summing invoice faces therefore
  // over-states what's been billed, pushes "billed" past the contract, and
  // wrongly reads as fully billed.
  //
  // (Outstanding already did this; billed didn't. Same money, two different
  // answers — which is exactly the kind of thing reconciliation exists to catch,
  // and did.)
  const billedToDate = grossBilled - rolledForward;
  const outstanding = billedToDate - paidToDate;                      // truly owed now
  const remainingToBill = Math.max(revisedContract - billedToDate, 0);

  // retention is held against what was actually billed, so it comes after
  const retention = retentionHeld(project, billedToDate, explicitWithheld);

  // --- retention BILLING ledger (its own track) ----------------------------
  // Retention isn't new money — it was already counted as billed on the
  // progress invoices and held back. These events live on their OWN types, so
  // they never touch grossBilled / billedToDate / remainingToBill above. This
  // just reports the drawdown: what's been billed to collect the held retention,
  // what's been received, what's still owed, and what's left to bill.
  const retentionBilled = sumBy(events, EVENT_TYPES.RETENTION_BILL);
  const retentionReceived = sumBy(events, EVENT_TYPES.RETENTION_PAYMENT);
  const retentionDue = Math.max(retentionBilled - retentionReceived, 0);   // billed, awaiting the check
  const retentionToBill = Math.max(retention - retentionBilled, 0);        // held, not yet billed

  // --- aging: bucket each UNPAID bill's outstanding by how overdue it is ---
  // We approximate per-bill outstanding by applying payments oldest-first (FIFO).
  const sortedBills = [...bills].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  // rolled-forward amounts settle their invoice (they re-bill later), so treat
  // them like payments when aging: the invoice is closed, not overdue.
  let paymentPool = paidToDate + rolledForward;
  const aging = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  for (const b of sortedBills) {
    const amt = b.amount || 0;
    const applied = Math.min(paymentPool, amt);
    paymentPool -= applied;
    const stillOwed = amt - applied;
    if (stillOwed <= 0) continue;
    const od = daysOverdue(b.dueDate, asOf);
    if (od == null || od <= 0) aging.current += stillOwed;
    else if (od <= 30) aging.d1_30 += stillOwed;
    else if (od <= 60) aging.d31_60 += stillOwed;
    else if (od <= 90) aging.d61_90 += stillOwed;
    else aging.d90_plus += stillOwed;
  }
  const overdueTotal = aging.d1_30 + aging.d31_60 + aging.d61_90 + aging.d90_plus;

  // Billing status (computed) — respects contract vs billed vs paid. A blank
  // contract (no lines, no override) can't be "fully billed" — say so honestly.
  const hasContract = revisedContract > 0;
  let status;
  if (!hasContract) status = billedToDate > 0 ? "Billing in progress" : "No contract set";
  else if (billedToDate === 0) status = "Not billed";
  else if (billedToDate < revisedContract - 0.005) {
    status = overdueTotal > 0 ? "Overdue" : "Billing in progress";
  } else {
    if (outstanding <= 0.005) status = "Paid in full";
    else if (overdueTotal > 0) status = "Overdue";
    else status = "Fully billed";
  }

  return {
    baseContract, changeOrders, revisedContract, contractSource, linesContract, coLinesValue,
    billedToDate, grossBilled, paidToDate, outstanding, remainingToBill, rolledForward,
    retention, retentionEnabled: !!project.retentionEnabled,
    retentionBilled, retentionReceived, retentionDue, retentionToBill,
    hasContract,
    aging, overdueTotal, status,
    eventCount: events.length,
  };
}

// Roll a set of projects' billing into portfolio totals (the A/R summary).
export function portfolioBilling(perProject) {
  const t = {
    revisedContract: 0, billedToDate: 0, paidToDate: 0, outstanding: 0,
    remainingToBill: 0, retention: 0,
    aging: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 }, overdueTotal: 0,
  };
  for (const b of perProject) {
    t.revisedContract += b.revisedContract || 0;
    t.billedToDate += b.billedToDate || 0;
    t.paidToDate += b.paidToDate || 0;
    t.outstanding += b.outstanding || 0;
    t.remainingToBill += b.remainingToBill || 0;
    t.retention += b.retention || 0;
    t.overdueTotal += b.overdueTotal || 0;
    for (const k of Object.keys(t.aging)) t.aging[k] += b.aging?.[k] || 0;
  }
  return t;
}

// -----------------------------------------------------------------------------
// SHORT-PAY CARRYOVER — a short pay reduces line qty-to-date so the unpaid work
// re-bills next cycle. The carryover is "recovered" once that work has been
// BILLED again AND that later invoice has been PAID. Until then it's an open
// balance we surface (card + reminder). Once recovered, both go quiet.
//
// Mechanics: each short pay records the gross dollars it rolled back. Bills
// created AFTER that short pay re-capture it. We net the rolled-back gross
// against the paid portion of subsequent bills, oldest-first.
// -----------------------------------------------------------------------------
export function shortPayCarryover(events) {
  const parseTag = (notes, tag) => {
    const m = (notes || "").match(new RegExp(`\\[${tag}\\](\\{.*?\\})\\s*$`, "s"));
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  };

  // Short pays now live on the INVOICE as an [adjust] stamp (invoice keeps its
  // original amount). The [carry] tag on the payment holds the line detail.
  const bills = events.filter((e) => e.type === EVENT_TYPES.BILL && (e.amount || 0) > 0)
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  const shortPays = bills
    .map((b) => {
      const adj = parseTag(b.notes, "adjust");
      if (!adj) return null;
      // line detail lives on the matching payment's [carry] tag
      const pay = events.find((e) => e.type === EVENT_TYPES.PAYMENT && e.invoiceNumber && e.invoiceNumber === b.invoiceNumber && parseTag(e.notes, "carry"));
      const carry = pay ? parseTag(pay.notes, "carry") : null;
      return {
        invoiceId: b.id,
        fromInvoice: b.invoiceNumber || "",
        date: b.date,
        netShort: adj.rolledForward || 0,
        billedOriginal: adj.billedOriginal || 0,
        received: adj.received || 0,
        lines: carry?.lines || [],
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  if (shortPays.length === 0) return { open: 0, items: [], hasOpen: false };

  // Payments are tied to their invoice (invoiceNumber), so credit each bill by
  // the payments that name it. Untied payments fall back to FIFO.
  const billPaid = new Map();
  for (const b of bills) {
    const direct = events
      .filter((e) => e.type === EVENT_TYPES.PAYMENT && e.invoiceNumber && b.invoiceNumber && e.invoiceNumber === b.invoiceNumber)
      .reduce((a, e) => a + (e.amount || 0), 0);
    billPaid.set(b.id, direct);
  }
  let untied = events
    .filter((e) => e.type === EVENT_TYPES.PAYMENT && !e.invoiceNumber)
    .reduce((a, e) => a + (e.amount || 0), 0);
  for (const b of bills) {
    if (untied <= 0) break;
    const owed = Math.max((b.amount || 0) - (billPaid.get(b.id) || 0), 0);
    const applied = Math.min(untied, owed);
    untied -= applied;
    billPaid.set(b.id, (billPaid.get(b.id) || 0) + applied);
  }

  const items = [];
  let open = 0;
  for (const sp of shortPays) {
    const spDate = new Date(sp.date || 0);
    // work rolled forward is recovered by PAID bills issued after the short pay
    // ">= spDate", not "> spDate". The re-bill usually happens the SAME DAY as
    // the short pay is recorded — Fern short-pays INV-1 and raises INV-2 in the
    // same sitting. A strict "after" comparison never saw it, so the carryover
    // stayed open forever and the banner nagged about money that had already
    // been recovered. The invoice itself is excluded by id, so same-day is safe.
    const laterBills = bills.filter((b) => b.id !== sp.invoiceId && new Date(b.date || 0) >= spDate);
    const recoveredPaid = laterBills.reduce((a, b) => a + (billPaid.get(b.id) || 0), 0);
    const remaining = Math.max((sp.netShort || 0) - recoveredPaid, 0);
    if (remaining > 0.005) {
      open += remaining;
      items.push({
        fromInvoice: sp.fromInvoice,
        netShort: sp.netShort,
        billedOriginal: sp.billedOriginal,
        received: sp.received,
        remaining,
        date: sp.date,
        lines: sp.lines,
      });
    }
  }
  return { open, items, hasOpen: open > 0.005 };
}
