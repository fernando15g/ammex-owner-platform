// =============================================================================
// RECONCILIATION — does the system still agree with itself?
//
// Every other safeguard we built catches a bug we ALREADY KNEW ABOUT. This one
// exists to catch the bugs nobody thought of: it doesn't check the code, it
// checks the DATA, and asks whether the numbers still add up.
//
// The first check below is the exact drift that caused the whole mutation audit:
// an invoice's line quantities and the line items themselves quietly disagreeing.
// Had this existed, it would have found that bug before Fern did.
//
// Pure functions. No Notion, no fetch — everything is passed in, so this is
// testable and survives the database changing underneath it.
// =============================================================================

import { readTag } from "@/lib/rules/mutations";
import { resolveLine } from "@/lib/rules/appIds";

const SEVERITY = { ERROR: "error", WARNING: "warning" };
const cents = (n) => Math.round((n || 0) * 100) / 100;
const near = (a, b, tol = 0.02) => Math.abs((a || 0) - (b || 0)) <= tol;

// -----------------------------------------------------------------------------
// reconcile({ projects, events, lines }) -> { ok, checked, issues[] }
// -----------------------------------------------------------------------------
export function reconcile({ projects = [], events = [], lines = [] }) {
  const issues = [];
  const add = (severity, check, message, context = {}) =>
    issues.push({ severity, check, message, ...context });

  const bills = events.filter((e) => e.type === "Bill" && (e.amount || 0) > 0);
  const payments = events.filter((e) => e.type === "Payment");

  // --- 1. LINE QTY DRIFT ------------------------------------------------------
  // A line's qty-to-date should equal the total quantity billed against it across
  // every invoice, minus anything rolled back by a short pay. If these disagree,
  // an invoice and its line items are telling different stories about the work.
  const billedByLine = new Map();   // key -> qty
  for (const b of bills) {
    const snap = readTag(b.notes, "snap");
    if (!snap?.lines) continue;
    for (const sl of snap.lines) {
      const line = resolveLine(sl, lines);
      if (!line) {
        add(SEVERITY.ERROR, "orphan-snapshot",
          `Invoice ${b.invoiceNumber || b.id} bills a line item that no longer exists.`,
          { invoice: b.invoiceNumber, lineRef: sl.lid || sl.id });
        continue;
      }
      billedByLine.set(line.id, (billedByLine.get(line.id) || 0) + (sl.q || 0));
    }
  }
  // short pays roll quantity BACK off the lines, so subtract what they rolled
  for (const p of payments) {
    const carry = readTag(p.notes, "carry");
    if (!carry?.lines) continue;
    for (const cl of carry.lines) {
      const line = resolveLine(cl, lines);
      if (!line) continue;
      billedByLine.set(line.id, (billedByLine.get(line.id) || 0) - (cl.qty || 0));
    }
  }
  for (const line of lines) {
    const expected = billedByLine.get(line.id) || 0;
    const actual = line.qtyToDate || 0;
    if (!near(expected, actual, 1)) {   // whole-unit tolerance: short pays round
      add(SEVERITY.ERROR, "line-qty-drift",
        `"${line.description || line.itemNo}" says ${actual.toLocaleString()} billed, but the invoices only account for ${expected.toLocaleString()}.`,
        { lineId: line.lineId || line.id, expected, actual, diff: cents(actual - expected) });
    }
  }

  // --- 2. INVOICE vs ITS OWN SNAPSHOT ----------------------------------------
  // An invoice's amount is derived from the lines it billed. If someone forced
  // the total to something else, the invoice no longer describes real work.
  for (const b of bills) {
    const snap = readTag(b.notes, "snap");
    if (!snap?.lines) continue;
    const fromLines = snap.lines.reduce((a, l) => a + (l.q || 0) * (l.u || 0), 0);
    if (!near(fromLines, b.amount, 0.05)) {
      add(SEVERITY.ERROR, "invoice-amount-mismatch",
        `Invoice ${b.invoiceNumber || b.id} is recorded as $${cents(b.amount).toLocaleString()}, but its line items add up to $${cents(fromLines).toLocaleString()}.`,
        { invoice: b.invoiceNumber, recorded: cents(b.amount), fromLines: cents(fromLines) });
    }
  }

  // --- 3. PAYMENTS POINT AT REAL INVOICES ------------------------------------
  const invoiceNumbers = new Set(bills.map((b) => b.invoiceNumber).filter(Boolean));
  for (const p of payments) {
    if (!p.invoiceNumber) {
      add(SEVERITY.WARNING, "untied-payment",
        `A payment of $${cents(p.amount).toLocaleString()} isn't tied to any invoice, so it can't be aged or chased.`,
        { amount: cents(p.amount), date: p.date });
      continue;
    }
    if (!invoiceNumbers.has(p.invoiceNumber)) {
      add(SEVERITY.ERROR, "payment-orphan",
        `A payment references invoice ${p.invoiceNumber}, which doesn't exist.`,
        { invoice: p.invoiceNumber, amount: cents(p.amount) });
    }
  }

  // --- 4. SHORT PAYS ARE WHOLE -----------------------------------------------
  // A short pay stamps [adjust] on the invoice AND leaves a [carry] on the
  // payment. One without the other is the orphan state that editing and deleting
  // used to leave behind.
  for (const b of bills) {
    const adjust = readTag(b.notes, "adjust");
    if (!adjust) continue;
    const hasCarry = payments.some(
      (p) => p.invoiceNumber === b.invoiceNumber && readTag(p.notes, "carry")
    );
    if (!hasCarry) {
      add(SEVERITY.ERROR, "short-pay-orphan",
        `Invoice ${b.invoiceNumber || b.id} is marked short-paid ($${cents(adjust.rolledForward).toLocaleString()} rolled forward), but there's no short payment behind it.`,
        { invoice: b.invoiceNumber, rolledForward: cents(adjust.rolledForward) });
    }
  }
  for (const p of payments) {
    const carry = readTag(p.notes, "carry");
    if (!carry) continue;
    const invoice = bills.find((b) => b.invoiceNumber === p.invoiceNumber);
    if (!invoice || !readTag(invoice.notes, "adjust")) {
      add(SEVERITY.ERROR, "short-pay-orphan",
        `A short payment rolled $${cents(carry.netShort).toLocaleString()} forward from ${p.invoiceNumber || "an invoice"}, but that invoice isn't marked short-paid.`,
        { invoice: p.invoiceNumber, rolledForward: cents(carry.netShort) });
    }
  }

  // --- 5/6. PER-PROJECT MONEY -------------------------------------------------
  for (const proj of projects) {
    const evts = events.filter((e) => e.projectId === proj.id);
    if (!evts.length) continue;

    const bidIds = new Set(proj.relatedBidIds?.length ? proj.relatedBidIds : proj.relatedBidId ? [proj.relatedBidId] : []);
    const projLines = lines.filter((l) => l.projectId === proj.id || (l.bidId && bidIds.has(l.bidId)));
    // NET OUT the rollforward, exactly as computeBilling does. A short-paid $50
    // that gets re-billed on the next invoice appears in BOTH invoice faces —
    // summing them counts the same work twice, which is what made this check fire
    // "billed over contract" on a project that was billed exactly to contract.
    const grossBilled = evts.filter((e) => e.type === "Bill").reduce((a, e) => a + (e.amount || 0), 0);
    const paid = evts.filter((e) => e.type === "Payment").reduce((a, e) => a + (e.amount || 0), 0);
    const rolled = evts
      .filter((e) => e.type === "Bill")
      .reduce((a, e) => a + (readTag(e.notes, "adjust")?.rolledForward || 0), 0);
    const billed = grossBilled - rolled;
    const outstanding = billed - paid;

    // 5. never collected more than was billed
    if (outstanding < -0.05) {
      add(SEVERITY.ERROR, "overpaid",
        `"${proj.name}" has been paid $${cents(-outstanding).toLocaleString()} more than it was billed.`,
        { project: proj.name, billed: cents(billed), paid: cents(paid) });
    }

    // 6. billed beyond the contract
    const contract = projLines.reduce((a, l) => a + (l.quantity || 0) * (l.unitPrice || 0), 0);
    const override = proj.billingContractValue > 0 ? proj.billingContractValue : null;
    const effective = override ?? contract;
    if (effective > 0 && billed > effective + 0.05) {
      add(SEVERITY.WARNING, "billed-over-contract",
        `"${proj.name}" has billed $${cents(billed).toLocaleString()} against a contract of $${cents(effective).toLocaleString()}. Either weights came in heavy, or a change order is missing.`,
        { project: proj.name, billed: cents(billed), contract: cents(effective) });
    }

    // 8. billing with no contract at all
    if (effective <= 0) {
      add(SEVERITY.WARNING, "no-contract",
        `"${proj.name}" has billing but no contract value — it has no line items, and no bid is attached.`,
        { project: proj.name });
    }

    // --- CONTRADICTIONS: the project says one thing, the money says another ---
    const closed = proj.status === "Closed" || proj.status === "Paid";
    const invoices = evts.filter((e) => e.type === "Bill").length;

    if (closed && outstanding > 0.05) {
      add(SEVERITY.WARNING, "closed-with-outstanding",
        `"${proj.name}" is marked ${proj.status}, but $${cents(outstanding).toLocaleString()} is still owed. Closed jobs are where receivables go to be forgotten.`,
        { project: proj.name, outstanding: cents(outstanding) });
    }

    const remaining = Math.max(effective - billed, 0);
    if (closed && remaining > 0.05) {
      add(SEVERITY.WARNING, "closed-underbilled",
        `"${proj.name}" is marked ${proj.status}, but $${cents(remaining).toLocaleString()} of the contract was never invoiced.`,
        { project: proj.name, remaining: cents(remaining) });
    }

    if (closed && invoices === 0) {
      add(SEVERITY.WARNING, "closed-never-invoiced",
        `"${proj.name}" is marked ${proj.status}, but nothing was ever invoiced against it.`,
        { project: proj.name });
    }

    if (closed && (proj.payrollHours || 0) > 0 && proj.status === "Closed") {
      // hours still landing on a finished job means either the hours are wrong,
      // or the job isn't actually finished
      const recentHours = proj.payrollHours;
      if (recentHours > 0 && invoices === 0) {
        add(SEVERITY.WARNING, "hours-on-closed",
          `"${proj.name}" is Closed, but ${Math.round(recentHours).toLocaleString()} hours are charged to it and it was never billed.`,
          { project: proj.name });
      }
    }

    // Two lines sharing an item number on one project is a weight typed against
    // the wrong line waiting to happen — and the money would look plausible, so
    // nobody would catch it. Most likely on a multi-phase job, where Phase 1 and
    // Phase 2 both carry an item "28410".
    const byItemNo = new Map();
    for (const l of projLines) {
      const key = String(l.itemNo || "").trim();
      if (!key) continue;
      if (!byItemNo.has(key)) byItemNo.set(key, []);
      byItemNo.get(key).push(l);
    }
    for (const [itemNo, dupes] of byItemNo) {
      if (dupes.length < 2) continue;
      const phases = [...new Set(dupes.map((d) => d.bidId).filter(Boolean))];
      add(SEVERITY.WARNING, "duplicate-item-no",
        `"${proj.name}" has ${dupes.length} line items numbered ${itemNo}` +
        `${phases.length > 1 ? " across different bids" : ""}. It's easy to enter a weight against the wrong one.`,
        { project: proj.name, itemNo, count: dupes.length });
    }

    if (invoices > 0 && !bidIds.size && projLines.length === 0) {
      add(SEVERITY.WARNING, "detached-from-bid",
        `"${proj.name}" has invoices but no bid attached — its contract value is gone, so its remaining-to-bill is meaningless.`,
        { project: proj.name });
    }
  }

  // --- 7. LINES BELONG TO SOMETHING ------------------------------------------
  const projectIds = new Set(projects.map((p) => p.id));
  for (const l of lines) {
    if (!l.projectId && !l.bidId) {
      add(SEVERITY.WARNING, "orphan-line",
        `Line item "${l.description || l.itemNo}" isn't attached to a bid or a project.`,
        { lineId: l.lineId || l.id });
    } else if (l.projectId && !projectIds.has(l.projectId)) {
      add(SEVERITY.ERROR, "orphan-line",
        `Line item "${l.description || l.itemNo}" points at a project that no longer exists.`,
        { lineId: l.lineId || l.id });
    }
  }

  const errors = issues.filter((i) => i.severity === SEVERITY.ERROR);
  const warnings = issues.filter((i) => i.severity === SEVERITY.WARNING);

  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    counts: {
      projects: projects.length,
      invoices: bills.length,
      payments: payments.length,
      lineItems: lines.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    errors,
    warnings,
    issues,
  };
}
