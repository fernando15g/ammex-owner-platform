// =============================================================================
// MONEY RULES — build spec §4. THE #1 DATA RULE lives here.
//
// The Bid Tracker has TWO sets of money columns:
//   • nine "(calc)" number columns — written by the calculator going forward,
//     BLANK on the ~70 historical rows (and on any bid not saved via the app).
//   • old formula columns — correct for historical rows, now hidden in Notion.
//
// Every money metric MUST coalesce: (calc) if present, else the old formula.
// Reading just one side gives blanks. This rule is load-bearing — live samples
// showed even recent bids running entirely on the formula side.
// =============================================================================

import {
  getNumber,
  getFormulaNumber,
  getTitle,
  getText,
  getDate,
  getStatus,
  getMultiSelect,
  getRelationIds,
  pageId,
} from "@/lib/notion/client";

// The coalesce itself. calc wins when it's a real number; otherwise formula.
export function coalesce(calcValue, formulaValue) {
  return typeof calcValue === "number" ? calcValue : formulaValue;
}

// Cost-stack constants (spec §4). One place to change them, ever.
export const MOBILIZATION_HRS = 8;
export const BURDEN = 0.2; // combined labor burden + field OH + G&A slice (on wage)
export const TOOLS = 0.03;
export const CONTINGENCY = 0.03;

// Contract Value has NO (calc) column — compute from raw inputs, fall back to
// the old "Estimated Contract Value" formula when inputs are incomplete.
export function contractValue(bid) {
  if (typeof bid.bidRate === "number" && typeof bid.estimatedLbs === "number") {
    return bid.bidRate * bid.estimatedLbs + (bid.ptSpecialtyRevenue || 0);
  }
  return bid.estContractValueFormula; // may be null — caller must handle
}

// Projected labor hours, recomputed in code (don't trust the Notion formula):
// (LBS ÷ productivity) + mobilization. Null when inputs are missing/zero —
// callers must guard (a 0/blank here is the divide-by-zero trap in burn math).
export function projectedHours(bid) {
  if (
    typeof bid.estimatedLbs === "number" &&
    typeof bid.productivity === "number" &&
    bid.productivity > 0
  ) {
    return bid.estimatedLbs / bid.productivity + MOBILIZATION_HRS;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Bid mapper — turns a raw Notion Bid Tracker page into a clean domain object.
// Property names must match the live schema EXACTLY (verified July 2026).
// -----------------------------------------------------------------------------
export function mapBid(page) {
  const bid = {
    id: pageId(page),
    name: getTitle(page, "Project Name"),
    status: getStatus(page, "Bid Status"),
    // raw inputs
    estimatedLbs: getNumber(page, "Estimated LBS"),
    productivity: getNumber(page, "Estimated LBS/MH"),
    crewSize: getNumber(page, "Estimated Crew Size"),
    baseWage: getNumber(page, "Base Wage Rate"),
    bidRate: getNumber(page, "Bid Rate ($/LB)"),
    ptSpecialtyRevenue: getNumber(page, "PT/Specialty Revenue"),
    gc: getMultiSelect(page, "GC"),
    fabricator: getMultiSelect(page, "Fabricator"),
    projectType: getMultiSelect(page, "Project Type"),
    cityCounty: getText(page, "City/County"),
    scope: getText(page, "Scope"),
    notes: getText(page, "Notes"),
    bidDueDate: getDate(page, "Bid Due Date"),
    submissionDate: getDate(page, "Submission Date"),
    projectIds: getRelationIds(page, "Projects"),
    // old formula side (fallbacks)
    estContractValueFormula: getFormulaNumber(page, "Estimated Contract Value"),
  };

  // THE COALESCE — every money figure resolved here, once, for the whole app.
  bid.operatingProfit = coalesce(
    getNumber(page, "Operating Profit (calc)"),
    getFormulaNumber(page, "Operating Profit (pre-tax)")
  );
  bid.operatingMargin = coalesce(
    getNumber(page, "Operating Margin (calc)"), // stored as ratio (0.17 = 17%)
    getFormulaNumber(page, "Operating Margin %")
  );
  bid.fullyLoadedCost = coalesce(
    getNumber(page, "Fully-Loaded Cost (calc)"),
    getFormulaNumber(page, "Fully-Loaded Cost")
  );
  bid.burdenedLaborCost = coalesce(
    getNumber(page, "Burdened Labor Cost (calc)"),
    getFormulaNumber(page, "Burdened Labor Cost")
  );

  // stored assumptions from the calc columns (null on bids never priced via app)
  bid.burdenPct = getNumber(page, "Burden/OH % (calc)");
  bid.toolsPct = getNumber(page, "Tools % (calc)");
  bid.contingencyPct = getNumber(page, "Contingency % (calc)");
  bid.mobilizationHrs = getNumber(page, "Mobilization Hrs (calc)");
  bid.targetMarginPct = getNumber(page, "Target Margin % (calc)");

  bid.contractValue = contractValue(bid);
  bid.projectedHours = projectedHours(bid);
  bid.tons = typeof bid.estimatedLbs === "number" ? bid.estimatedLbs / 2000 : null;

  return bid;
}
