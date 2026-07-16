// =============================================================================
// LINE ITEM RULES — all line-item math in code (never Notion). The line item is
// the shared unit: bid sheet (propose) -> billing schedule (progress).
// =============================================================================

// An hourly line (billing basis = Hours) prices as hoursWorked x rate — used by
// hourly change orders. Everything else (blank basis included) is qty x price.
export function isHoursBasis(li) {
  return li.billingBasis === "Hours";
}

// Extended = a line's full value. Hours basis -> hoursWorked x rate.
// Quantity basis (default) -> quantity x unit price.
export function extended(li) {
  if (isHoursBasis(li)) return (li.hoursWorked || 0) * (li.rate || 0);
  return (li.quantity || 0) * (li.unitPrice || 0);
}

// Billed-to-date dollars for a line. Hourly lines bill their full hours x rate
// once entered (no qty-to-date progression); quantity lines bill qtyToDate x price.
export function billedToDate(li) {
  if (isHoursBasis(li)) return (li.hoursWorked || 0) * (li.rate || 0);
  return (li.qtyToDate || 0) * (li.unitPrice || 0);
}

// ---------------------------------------------------------------------------
// WEIGHT — the pounds a line represents, for productivity. ONLY lines priced in
// pounds (Unit = LBS) and billed by quantity count. Hours-basis lines, and SF/
// LF/EA/LS lines, contribute ZERO weight — a change order billed by the hour or
// a lump-sum line isn't installed steel and must never inflate lbs/MH.
//   estimated  -> full quantity in LBS
//   toDate     -> qtyToDate in LBS (what's been billed so far = installed)
// ---------------------------------------------------------------------------
export function isWeightLine(li) {
  return !isHoursBasis(li) && (li.unit || "").toUpperCase() === "LBS";
}
export function lineWeightLbs(li) {
  return isWeightLine(li) ? (li.quantity || 0) : 0;
}
export function lineWeightToDateLbs(li) {
  return isWeightLine(li) ? (li.qtyToDate || 0) : 0;
}

// A project's installed pounds so far = Σ qtyToDate on its LBS quantity lines.
// This is the billing-derived weight that (later) feeds productivity, produced
// as a byproduct of progress billing — no separate data entry.
export function billedWeightToDate(lines) {
  return lines.reduce((a, li) => a + lineWeightToDateLbs(li), 0);
}
export function estimatedWeight(lines) {
  return lines.reduce((a, li) => a + lineWeightLbs(li), 0);
}

// Sheet totals for a set of line items (a bid's sheet, or a project's schedule).
export function sheetTotals(lines) {
  let proposal = 0, billed = 0, estimateQty = 0, qtyToDate = 0;
  for (const li of lines) {
    proposal += extended(li);
    billed += billedToDate(li);
    estimateQty += li.quantity || 0;
    qtyToDate += li.qtyToDate || 0;
  }
  const pctCompleteByQty = estimateQty > 0 ? qtyToDate / estimateQty : 0;
  return { proposal, billed, estimateQty, qtyToDate, pctCompleteByQty, count: lines.length };
}

// Group all line items by bid / by project for the hub join.
export function groupLineItems(lines) {
  const byBid = new Map(), byProject = new Map();
  for (const li of lines) {
    if (li.bidId) {
      if (!byBid.has(li.bidId)) byBid.set(li.bidId, []);
      byBid.get(li.bidId).push(li);
    }
    if (li.projectId) {
      if (!byProject.has(li.projectId)) byProject.set(li.projectId, []);
      byProject.get(li.projectId).push(li);
    }
  }
  return { byBid, byProject };
}

// -----------------------------------------------------------------------------
// A PROJECT'S LINE ITEMS — across every bid attached to it.
//
// A project can carry more than one bid. Phase 2 of a job gets bid separately
// (its own weights, its own margin — you want to know whether THAT bid made
// money), but it's the same contract, the same GC, and it bills on the same
// invoice. So: estimating is per-bid, billing is per-project.
//
// This is the ONE place that answers "which lines belong to this project". Every
// money path goes through it, so a second bid can't be silently ignored — which
// would show up as a contract value that's quietly too low, the worst kind of bug.
// -----------------------------------------------------------------------------
export function projectLineItems(project, allLines, { includeClosed = false } = {}) {
  if (!project) return [];
  const bidIds = new Set(
    (project.relatedBidIds?.length ? project.relatedBidIds : project.relatedBidId ? [project.relatedBidId] : [])
  );

  return allLines.filter((li) => {
    if (!includeClosed && li.status === "Closed") return false;
    if (li.projectId === project.id) return true;      // attached directly
    return li.bidId && bidIds.has(li.bidId);           // or via ANY of its bids
  });
}

// Group a project's lines by the bid they came from, so a multi-phase job reads
// as phases rather than one undifferentiated list. Two lines called "28410" from
// different phases sitting next to each other is a weight entered against the
// wrong one waiting to happen.
export function groupLinesByBid(lines, bids = [], labels = {}) {
  const groups = new Map();
  for (const li of lines) {
    const key = li.bidId || "__none__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(li);
  }

  return [...groups.entries()].map(([bidId, items]) => {
    const bid = bids.find((b) => b.id === bidId);
    return {
      bidId: bidId === "__none__" ? null : bidId,
      // the label is the bid's name unless it's been renamed on this project —
      // "Phase 2" isn't always what they'd call it ("Bldg B", "Sundt CO #3").
      label: labels[bidId] || bid?.name || (bidId === "__none__" ? "Added directly" : "Bid"),
      items,
      value: items.reduce((a, l) => a + (l.quantity || 0) * (l.unitPrice || 0), 0),
    };
  });
}
