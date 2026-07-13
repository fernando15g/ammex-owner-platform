// =============================================================================
// LINE ITEM RULES — all line-item math in code (never Notion). The line item is
// the shared unit: bid sheet (propose) -> billing schedule (progress).
// =============================================================================

// Extended = quantity x unit price (a line's proposal value).
export function extended(li) {
  return (li.quantity || 0) * (li.unitPrice || 0);
}

// Billed-to-date dollars for a line = qtyToDate x unit price.
export function billedToDate(li) {
  return (li.qtyToDate || 0) * (li.unitPrice || 0);
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
