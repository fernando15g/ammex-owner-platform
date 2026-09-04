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
  getSelect,
  getRelationIds,
  pageId,
  getCheckbox,
} from "@/lib/notion/client";
import { specialtyRevenueForBid } from "@/lib/rules/specialty";

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
// The PLACEMENT rate — the rebar $/lb with no travel in it.
//
// When a bid was quoted with travel folded in, "Bid Rate ($/LB)" holds the
// COMBINED placement+travel rate (that's what the GC was quoted, and it's what
// the calculator stores). Contract value, and everything measured off it, must
// stay travel-free: revenue would otherwise pick up the travel dollars while
// cost never does — travel spend isn't in fully-loaded cost — which inflates
// realized margin on exactly the jobs that cost the most to run.
//
// Rebar Revenue (calc) is stored pure placement, so revenue / lbs gives the
// placement rate exactly. Subtracting the add-on can't: the quarter-cent
// rounding was applied to the sum, so 30.75 - 2.14 = 28.61, not 28.50.
export function placementRate(bid) {
  const stored = typeof bid.bidRate === "number" ? bid.bidRate : null;
  if (!bid.travelAddToBid) return stored;
  const lbs = Number(bid.estimatedLbs) || 0;
  const rev = Number(bid.rebarRevenue) || 0;
  if (lbs > 0 && rev > 0) return rev / lbs;
  if (stored != null) {
    const cents = stored * 100 - (Number(bid.travelAddOnCents) || 0);
    if (cents > 0) return cents / 100;
  }
  return stored;
}

export function contractValue(bid) {
  const rate = placementRate(bid);
  if (typeof rate === "number" && typeof bid.estimatedLbs === "number") {
    // Specialty is added ONCE. specialtyRevenueForBid picks a single source —
    // the (calc) column when the calculator priced it, else the old manual
    // PT/Specialty Revenue column — so a bid carrying both can't double-count.
    return rate * bid.estimatedLbs + specialtyRevenueForBid(bid, null);
  }
  // No rebar inputs. The legacy formula still wins when it exists (unchanged).
  const formula = bid.estContractValueFormula;
  if (typeof formula === "number") return formula;
  // A SPECIALTY-ONLY bid (all PT or all mesh, no rebar) is still worth real
  // money — reporting it as nothing hid it from the pipeline and the book.
  const spec = specialtyRevenueForBid(bid, null);
  return spec > 0 ? spec : formula; // null only when there's genuinely nothing
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
    lastFollowUp: getDate(page, "Last Follow-Up"),
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
  bid.hoursPerDay = getNumber(page, "Hours Per Day (calc)");
  bid.targetMarginPct = getNumber(page, "Target Margin % (calc)");

  // Specialty scope (PT + mesh) — labor-only, priced by the bid calculator.
  bid.rebarRevenue = getNumber(page, "Rebar Revenue (calc)");
  bid.specialtyRevenue = getNumber(page, "Specialty Revenue (calc)");
  bid.specialtyCost = getNumber(page, "Specialty Cost (calc)");
  bid.specialtyHours = getNumber(page, "Specialty Hours (calc)");

  // --- Out-of-town (travel) add-on, written by the calculator (and by the OS
  // when travel is edited here). Inputs are read back so the OS can re-price
  // travel with the same numbers rather than guessing from the totals.
  bid.travelOn = getCheckbox(page, "Travel On (calc)");
  bid.hotelRooms = getNumber(page, "Hotel Rooms (calc)");
  bid.hotelNightlyRate = getNumber(page, "Hotel Nightly Rate (calc)");
  bid.hotelNights = getNumber(page, "Hotel Nights (calc)");
  bid.hotelTaxPct = getNumber(page, "Hotel Tax % (calc)");
  bid.hotelNightsBasis = getNumber(page, "Hotel Nights Basis (calc)");
  bid.fuelMiles = getNumber(page, "Fuel Miles (calc)");
  bid.fuelTrips = getNumber(page, "Fuel Trips (calc)");
  bid.fuelMPG = getNumber(page, "Fuel MPG (calc)");
  bid.fuelPerGal = getNumber(page, "Fuel Per Gal (calc)");
  bid.subsistenceRate = getNumber(page, "Subsistence Rate (calc)");
  bid.subsistenceInLabor = getCheckbox(page, "Subsistence In Labor (calc)");
  bid.travelMarkupOn = getCheckbox(page, "Travel Markup On (calc)");
  bid.travelMarkupPct = getNumber(page, "Travel Markup % (calc)");
  // Absent column reads false — safe before the calculator starts writing it.
  bid.travelAddToBid = getCheckbox(page, "Travel Add To Bid (calc)");

  // --- Overtime. otPct is the source of truth (a ratio); the other three are
  // display totals across rebar + specialty. The premium is ALREADY inside
  // Fully-Loaded Cost — never add these to cost again.
  bid.otPct = getNumber(page, "OT %");
  bid.otCentsPerLb = getNumber(page, "OT \u00a2/lb (calc)");
  bid.otHours = getNumber(page, "OT Hours (calc)");
  bid.otPremium = getNumber(page, "OT Premium (calc)");
  bid.hotelCost = getNumber(page, "Hotel Cost (calc)");
  bid.fuelCost = getNumber(page, "Fuel Cost (calc)");
  bid.subsistenceCost = getNumber(page, "Subsistence Cost (calc)");
  bid.travelTotal = getNumber(page, "Travel Total (calc)");
  bid.travelAddOnCents = getNumber(page, "Travel Add-On Cents (calc)");
  bid.specialtyTypes = getMultiSelect(page, "Specialty Type");
  bid.detailer = getSelect(page, "Detailer");

  bid.contractValue = contractValue(bid);
  bid.projectedHours = projectedHours(bid);
  bid.tons = typeof bid.estimatedLbs === "number" ? bid.estimatedLbs / 2000 : null;

  return bid;
}
