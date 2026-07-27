// =============================================================================
// SPECIALTY SCOPE — PT and mesh work priced alongside rebar, LABOR ONLY.
//
// This file is a VERBATIM PORT of the specialty math in the Ammex Bid Calculator
// (github.com/fernando15g/ammex-bid-calculator → lib/calc.js). The two apps must
// never disagree about what a bid is worth, so the arithmetic below is copied,
// not reimplemented. If the calculator's math changes, re-copy it here.
//
// Material is intentionally excluded — it rides inside the bid price, exactly as
// it does for rebar. Labor (hours) is the only tracked variable cost.
//
// Why specialty is kept separate from rebar rather than lumped in:
//   • PT Bridge is priced in HOURS (the fabricator supplies them) — no weight.
//   • Mesh is priced in SQUARE FEET.
//   • PT Building is priced by weight, but runs ~98 lb/MH against rebar's
//     180–330 — averaging them together would slander the rebar crews.
// The OS keeps specialty out of lbs/MH by unit: only lines whose Unit is exactly
// "LBS" count as weight, so "PT LBS" and "SF" are excluded automatically.
// =============================================================================

export const SPECIALTY_TYPES = ["PT Bridge", "PT Building", "Mesh"];

// Working productivity figures from real jobs. PT Building is Fern's measured
// average; mesh came from a job's sqft ÷ hours. These are DEFAULTS — a line that
// carries its own productivity uses that instead.
export const SPECIALTY_DEFAULT_PRODUCTIVITY = {
  "PT Building": 98,    // lb/MH
  Mesh: 1400,           // sqft/MH
};

let __sid = 0;
// A blank specialty line for the OS pricing panel (mirrors the calculator).
export const newSpecialtyLine = (type = "PT Building") => ({
  id: `s${Date.now()}_${__sid++}`,
  type,
  tons: "", lbs: "", prodLbPerMH: type === "PT Building" ? SPECIALTY_DEFAULT_PRODUCTIVITY["PT Building"] : "",
  hours: "", ratePerHour: "",
  sqft: "", prodSqftPerMH: type === "Mesh" ? "" : "", rateCentsPerSqft: "",
  rateCentsPerLb: "",
});

const safeDiv = (n, d) => (d ? n / d : 0); // mirrors the workbook's IFERROR(...,0)
const n = (x) => (x === "" || x == null || isNaN(Number(x)) ? 0 : Number(x));
const blank = (x) => x === "" || x == null || isNaN(Number(x)) || Number(x) <= 0;

// Fully-loaded cost per total man-hour (same multipliers as the Estimator).
export const costPerMH = (i) =>
  n(i.wageRate) * (1 + n(i.burdenPct)) * (1 + n(i.toolsPct)) * (1 + n(i.contingencyPct));

/**
 * Compute one specialty line. Returns quantity label, hours, cost, revenue,
 * the recommended rate (priced to target margin) and whether a cost basis exists.
 */
export function computeSpecialtyLine(line, i) {
  const M = costPerMH(i);
  const target = n(i.targetMarginPct);
  const out = {
    id: line.id, type: line.type, hours: 0, cost: 0, revenue: 0,
    hasCostBasis: false, recommendedRate: null, rateUnit: "", qtyLabel: "",
  };

  if (line.type === "PT Building") {
    const lbs = n(line.lbs);
    out.lbs = lbs; out.prodLbPerMH = blank(line.prodLbPerMH) ? null : n(line.prodLbPerMH); out.rateCentsPerLb = n(line.rateCentsPerLb);
    out.qtyLabel = `${lbs.toLocaleString()} lb`;
    out.rateUnit = "¢/lb";
    if (!blank(line.prodLbPerMH) && lbs > 0) {
      out.hours = lbs / n(line.prodLbPerMH);
      out.cost = out.hours * M;
      out.hasCostBasis = true;
      out.recommendedRate = safeDiv(safeDiv(out.cost, 1 - target), lbs) * 100; // ¢/lb
    }
    out.revenue = (n(line.rateCentsPerLb) / 100) * lbs;
  } else if (line.type === "PT Bridge") {
    const hrs = n(line.hours);
    out.ratePerHour = n(line.ratePerHour);
    out.qtyLabel = `${hrs.toLocaleString()} hrs`;
    out.rateUnit = "$/hr";
    if (hrs > 0) {
      out.hours = hrs;                 // fabricator-provided hours
      out.cost = hrs * M;
      out.hasCostBasis = true;
      out.recommendedRate = safeDiv(M, 1 - target); // $/hr to hit target
    }
    out.revenue = hrs * n(line.ratePerHour);
  } else if (line.type === "Mesh") {
    const sqft = n(line.sqft);
    out.sqft = sqft; out.prodSqftPerMH = blank(line.prodSqftPerMH) ? null : n(line.prodSqftPerMH); out.rateCentsPerSqft = n(line.rateCentsPerSqft);
    out.qtyLabel = `${sqft.toLocaleString()} sqft`;
    out.rateUnit = "¢/sqft";
    if (!blank(line.prodSqftPerMH) && sqft > 0) {
      out.hours = sqft / n(line.prodSqftPerMH);
      out.cost = out.hours * M;
      out.hasCostBasis = true;
      out.recommendedRate = safeDiv(safeDiv(out.cost, 1 - target), sqft) * 100; // ¢/sqft
    }
    out.revenue = (n(line.rateCentsPerSqft) / 100) * sqft;
  }

  out.profit = out.hasCostBasis ? out.revenue - out.cost : null;
  out.margin = out.hasCostBasis ? safeDiv(out.profit, out.revenue) : null;
  return out;
}

/**
 * Roll specialty lines up and combine with the rebar side.
 * rebar: { revenue, cost, hours } from the active bid + estimate.
 */
export function computeSpecialtyRollup(lines, i, rebar) {
  const rows = (lines || []).map((l) => computeSpecialtyLine(l, i));
  const specRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const specCost = rows.reduce((s, r) => s + r.cost, 0);
  const specHours = rows.reduce((s, r) => s + r.hours, 0);
  const missingBasis = rows.filter((r) => !r.hasCostBasis && r.revenue > 0).length;

  const totalRevenue = rebar.revenue + specRevenue;
  const totalCost = rebar.cost + specCost;
  const totalHours = rebar.hours + specHours;
  const totalProfit = totalRevenue - totalCost;
  const totalMargin = safeDiv(totalProfit, totalRevenue);

  return {
    rows, specRevenue, specCost, specHours, missingBasis,
    specProfit: specRevenue - specCost,
    specMargin: safeDiv(specRevenue - specCost, specRevenue),
    totalRevenue, totalCost, totalHours, totalProfit, totalMargin,
  };
}

// -----------------------------------------------------------------------------
// OS-SIDE BRIDGE — turn the bid sheet's LINE ITEMS into specialty lines.
//
// The calculator is a pricing tool; the OS owns what actually gets billed. So a
// specialty scope lives on the bid sheet as an ordinary line item, and this
// translates it into the shape the ported math expects:
//
//   Unit "PT LBS"          → PT Building  (qty = lbs,   price = $/lb)
//   Unit "SF"              → Mesh         (qty = sqft,  price = $/sqft)
//   Unit "HRS"             → PT Bridge    (qty = hours, price = $/hr)
//   Billing Basis "Hours"  → PT Bridge    (an hourly change order, same thing
//                                          priced after the fact)
//
// Revenue therefore comes from the same quantity × price the invoice bills, so
// what's quoted and what's billed can't drift apart. Productivity isn't stored
// per line yet, so the type defaults above supply it; a line can override by
// putting a number in its Productivity field once that exists.
// -----------------------------------------------------------------------------
export function specialtyTypeOfLine(li) {
  if (!li) return null;
  if (li.billingBasis === "Hours") return "PT Bridge";
  const u = String(li.unit || "").toUpperCase();
  if (u === "PT LBS") return "PT Building";
  if (u === "SF" || u === "SQFT") return "Mesh";
  if (u === "HRS" || u === "HR") return "PT Bridge";
  return null;
}

export function isSpecialtyLine(li) {
  return specialtyTypeOfLine(li) != null;
}

// Map a line item onto the calculator's line shape.
export function lineItemToSpecialty(li) {
  const type = specialtyTypeOfLine(li);
  if (!type) return null;
  const qty = n(li.quantity);
  const price = n(li.unitPrice);
  const prod = blank(li.productivity) ? SPECIALTY_DEFAULT_PRODUCTIVITY[type] : n(li.productivity);
  if (type === "PT Building") {
    return { id: li.lineId || li.id, type, lbs: qty, prodLbPerMH: prod, rateCentsPerLb: price * 100 };
  }
  if (type === "Mesh") {
    return { id: li.lineId || li.id, type, sqft: qty, prodSqftPerMH: prod, rateCentsPerSqft: price * 100 };
  }
  // PT Bridge: hours come from the line's own hours/quantity, rate is $/hr
  const hrs = n(li.hoursWorked) || qty;
  return { id: li.lineId || li.id, type, hours: hrs, ratePerHour: n(li.rate) || price };
}

// The bid's cost assumptions, in the shape the ported math expects.
export function assumptionsFromBid(bid) {
  return {
    wageRate: n(bid?.baseWage),
    burdenPct: n(bid?.burdenPct),
    toolsPct: n(bid?.toolsPct),
    contingencyPct: n(bid?.contingencyPct),
    targetMarginPct: n(bid?.targetMarginPct),
  };
}

/**
 * Specialty rollup for a bid, computed from its own line items.
 * Returns null when the bid carries no specialty lines, so callers can fall back
 * to whatever the calculator stored.
 */
export function specialtyFromLineItems(bid, lines) {
  const spec = (lines || []).filter(isSpecialtyLine).map(lineItemToSpecialty).filter(Boolean);
  if (!spec.length) return null;
  const i = assumptionsFromBid(bid);
  const roll = computeSpecialtyRollup(spec, i, { revenue: 0, cost: 0, hours: 0 });
  return {
    revenue: roll.specRevenue,
    cost: roll.specCost,
    hours: roll.specHours,
    missingBasis: roll.missingBasis,
    types: [...new Set(spec.map((s) => s.type))],
    rows: roll.rows,
    source: "lines",
  };
}

/**
 * What a bid's specialty scope is worth, with a single clear precedence so the
 * same dollars can never be counted twice:
 *
 *   1. the bid's OWN line items   (the OS owns what gets billed)
 *   2. the calculator's (calc) columns
 *   3. the old manual PT/Specialty Revenue column  (history)
 *
 * Returns null when a bid has no specialty at all.
 */
export function specialtyForBid(bid, lines) {
  const fromLines = specialtyFromLineItems(bid, lines);
  if (fromLines) return fromLines;

  const rev = Number(bid?.specialtyRevenue) || 0;
  const cost = Number(bid?.specialtyCost) || 0;
  const hours = Number(bid?.specialtyHours) || 0;
  if (rev || cost || hours) {
    return {
      revenue: rev, cost, hours,
      missingBasis: rev > 0 && cost === 0 ? 1 : 0,
      types: bid?.specialtyTypes || [],
      rows: [],
      source: "calc",
    };
  }

  const legacy = Number(bid?.ptSpecialtyRevenue) || 0;
  if (legacy) {
    return {
      revenue: legacy, cost: 0, hours: 0,
      missingBasis: 1,          // the old column never carried a cost
      types: bid?.specialtyTypes || [],
      rows: [],
      source: "legacy",
    };
  }
  return null;
}

// Specialty revenue only — what contract value adds on top of the rebar side.
export function specialtyRevenueForBid(bid, lines) {
  const s = specialtyForBid(bid, lines);
  return s ? s.revenue : 0;
}
