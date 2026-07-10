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
export const EVENT_TYPES = { BILL: "Bill", PAYMENT: "Payment", CHANGE_ORDER: "Change Order" };

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
  const hasOverride = typeof project.billingContractValue === "number" && project.billingContractValue > 0;
  const baseContract = hasOverride ? project.billingContractValue : linesContract;
  const contractSource = hasOverride ? "override" : "lines";
  const revisedContract = baseContract + changeOrders;

  const billedToDate = sumBy(events, EVENT_TYPES.BILL);
  const paidToDate = sumBy(events, EVENT_TYPES.PAYMENT);
  const explicitWithheld = bills.reduce((a, e) => a + (e.retentionWithheld || 0), 0);

  const retention = retentionHeld(project, billedToDate, explicitWithheld);

  const outstanding = billedToDate - paidToDate;          // billed but not paid
  const remainingToBill = Math.max(revisedContract - billedToDate, 0);

  // --- aging: bucket each UNPAID bill's outstanding by how overdue it is ---
  // We approximate per-bill outstanding by applying payments oldest-first (FIFO).
  const sortedBills = [...bills].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  let paymentPool = paidToDate;
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
    baseContract, changeOrders, revisedContract, contractSource, linesContract,
    billedToDate, paidToDate, outstanding, remainingToBill,
    retention, retentionEnabled: !!project.retentionEnabled,
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
