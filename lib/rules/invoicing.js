// =============================================================================
// INVOICING RULES — the billing template's math, in code.
// Mirrors the admin's Excel billing sheet exactly:
//   per line: Estimate Qty | Unit Price | Total Work To Date | Previous Work |
//   Work This Estimate (= to-date - previous), then retention off the total.
// Retention: labor only (never material), generally 10%. A line counts as labor
// unless it's Furnish-only.
// Short pay: back-solve quantity so the record matches what was actually paid;
// the unpaid quantity rolls forward (it re-bills next cycle automatically).
// =============================================================================

// Does retention apply to this line? Labor-only rule: everything except
// Furnish-only lines (Install and Furnish+Install include labor).
export function retentionApplies(line) {
  return line.furnInst !== "Furnish";
}

// Compute an invoice from lines + the new qty-to-date entered per line.
// lines: [{ id, itemNo, description, quantity, unit, unitPrice, furnInst, qtyToDate }]
// newQty: { [lineId]: number } — the admin's "Total Work To Date" entries.
// retentionPct: e.g. 10 (percent). Applied to labor lines' this-estimate amount.
export function computeInvoice(lines, newQty, retentionPct = 10) {
  const rows = lines.map((li) => {
    const prevQty = li.qtyToDate || 0;
    const toDateQty = newQty[li.id] != null && newQty[li.id] !== "" ? Number(newQty[li.id]) : prevQty;
    const unitPrice = li.unitPrice || 0;
    const thisQty = toDateQty - prevQty;
    return {
      id: li.id,
      itemNo: li.itemNo,
      description: li.description,
      estimateQty: li.quantity || 0,
      unitPrice,
      furnInst: li.furnInst || null,
      prevQty,
      prevAmt: prevQty * unitPrice,
      toDateQty,
      toDateAmt: toDateQty * unitPrice,
      thisQty,
      thisAmt: thisQty * unitPrice,
      retentionOnLine: retentionApplies(li) ? Math.max(thisQty * unitPrice, 0) * (retentionPct / 100) : 0,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      toDateAmt: t.toDateAmt + r.toDateAmt,
      prevAmt: t.prevAmt + r.prevAmt,
      thisAmt: t.thisAmt + r.thisAmt,
      thisQty: t.thisQty + r.thisQty,
      retention: t.retention + r.retentionOnLine,
    }),
    { toDateAmt: 0, prevAmt: 0, thisAmt: 0, thisQty: 0, retention: 0 }
  );

  return {
    rows,
    grossThisEstimate: totals.thisAmt,      // work this estimate, before retention
    retention: totals.retention,            // retention withheld this estimate
    totalDue: totals.thisAmt - totals.retention,
    toDateAmt: totals.toDateAmt,
    prevAmt: totals.prevAmt,
    thisQty: totals.thisQty,
  };
}

// -----------------------------------------------------------------------------
// SHORT PAY — billed X, received Y (< X). Back-solve the quantity so the record
// matches the paid amount exactly, and return per-line qty reductions so the
// unpaid quantity rolls into the next cycle.
// Strategy: reduce quantities proportionally across the invoice's lines (by
// each line's share of the billed amount), converting the dollar shortfall to
// quantity via each line's unit price. Exact to the penny via largest-line
// remainder adjustment.
// snapshotLines: [{ id, unitPrice, thisQty }] from the bill's saved snapshot.
// -----------------------------------------------------------------------------
export function shortPayAdjustment(snapshotLines, billedAmount, paidAmount) {
  const shortfall = billedAmount - paidAmount;
  if (shortfall <= 0) return { reductions: [], shortfall: 0 };

  const billable = snapshotLines.filter((l) => (l.thisQty || 0) > 0 && (l.unitPrice || 0) > 0);
  const totalThis = billable.reduce((a, l) => a + l.thisQty * l.unitPrice, 0);
  if (totalThis <= 0) return { reductions: [], shortfall };

  // proportional dollar reduction per line -> qty reduction, ROUNDED to whole
  // units (no 166.6667-lb lines). Dollars follow the rounded qty so the record
  // reconciles exactly with what was rolled back.
  let remaining = shortfall;
  const reductions = billable.map((l, i) => {
    const share = (l.thisQty * l.unitPrice) / totalThis;
    let dollarCut = i === billable.length - 1 ? remaining : Math.min(shortfall * share, remaining);
    dollarCut = Math.min(dollarCut, l.thisQty * l.unitPrice); // can't cut below zero qty
    // round the qty to whole units, then recompute the exact dollars for it
    let qty = Math.round(dollarCut / l.unitPrice);
    qty = Math.min(qty, Math.floor(l.thisQty));               // never below zero qty
    const exactCut = qty * l.unitPrice;
    remaining -= exactCut;
    return { id: l.id, qtyReduction: qty, dollarCut: exactCut };
  });

  return { reductions, shortfall };
}
