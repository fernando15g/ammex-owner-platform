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
