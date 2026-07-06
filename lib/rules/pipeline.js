// =============================================================================
// WEIGHTED PIPELINE — build spec §6. Confidence comes from Bid Status and is
// computed HERE, in code — never read from Notion's Confidence % formula.
// (Notion formulas don't survive the Postgres migration; this file does.)
// These percentages are the owner's own numbers — a tunable dial. Future
// refinement: replace with actual historical close-rates by stage.
// =============================================================================

export const CONFIDENCE_BY_STATUS = {
  "Reviewing": 0.10,
  "Estimating": 0.20,
  "Contingent": 0.40,
  "Submitted": 0.50,
  "Follow Up": 0.55,
  "Negotiating": 0.75,
};

// Stages that count as "in flight". Need Weights is in the funnel but carries
// 0 confidence (it can't be priced yet); terminal outcomes are excluded.
export const IN_FLIGHT_STATUSES = [
  "Need Weights", "Reviewing", "Estimating", "Contingent",
  "Submitted", "Follow Up", "Negotiating",
];

export const TERMINAL_STATUSES = ["Awarded", "Lost", "No Bid"];

export function confidenceOf(bidStatus) {
  return CONFIDENCE_BY_STATUS[bidStatus] ?? 0;
}

export function isInFlight(bid) {
  return IN_FLIGHT_STATUSES.includes(bid.status);
}

// Raw + weighted totals across the in-flight pipeline.
// Bids with unknown contract value are counted but flagged, never invented.
export function pipelineTotals(bids) {
  const inFlight = bids.filter(isInFlight);
  let raw = 0, weighted = 0, rawTons = 0, weightedTons = 0, missingValue = 0;

  for (const b of inFlight) {
    const conf = confidenceOf(b.status);
    if (typeof b.contractValue === "number") {
      raw += b.contractValue;
      weighted += b.contractValue * conf;
    } else {
      missingValue += 1;
    }
    if (typeof b.tons === "number") {
      rawTons += b.tons;
      weightedTons += b.tons * conf;
    }
  }

  return { count: inFlight.length, raw, weighted, rawTons, weightedTons, missingValue };
}
