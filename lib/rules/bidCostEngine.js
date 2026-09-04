// =============================================================================
// BID COST ENGINE — the secret sauce. Copied VERBATIM from the calculator's
// lib/calc.js so the OS and the phone calculator compute IDENTICAL numbers.
// DO NOT refactor or "improve" this math — it must stay equivalent.
// Used for: amend-in-place on the bid detail page (change LBS/rate/productivity
// → economics recompute with the same math → save to the SAME bid).
// =============================================================================

export const safeDiv = (n, d) => (d ? n / d : 0);

// Defaults (seed values — editable per bid; store what was actually used).
export const CALC_DEFAULTS = {
  mobilizationHrs: 8,
  burdenPct: 0.2,
  toolsPct: 0.03,
  contingencyPct: 0.03,
  targetMarginPct: 0.25,
  hoursPerDay: 8,
  wageRate: 32,
  outputLbPerMH: 200,
  // Overtime: when otOn, a share of FIELD hours are worked at time-and-a-half.
  // Only the PREMIUM (the extra half over straight time) is a cost — it is not
  // a markup on the bid. otPct is the source of truth; hours/week is a
  // convenience input the UI converts from.
  otOn: false,
  otPct: 0.10,
  otHoursPerWeek: 44,
};

// Full cost stack → raw recommended bid.
export function computeEstimate(i) {
  const weightTons = safeDiv(i.weightLb, 2000);
  const fieldMH = safeDiv(i.weightLb, i.outputLbPerMH);
  const totalMH = fieldMH + i.mobilizationHrs;
  const crewDays = safeDiv(totalMH, i.crewSize * i.hoursPerDay);
  const loadedRate = i.wageRate * (1 + i.burdenPct);

  // OT premium: fieldMH x OT% x 0.5 x loadedRate (the extra half over straight
  // time). Only PLACEMENT hours can be OT — mobilization is not.
  const otPremium = i.otOn ? fieldMH * (i.otPct || 0) * 0.5 * loadedRate : 0;
  const directLabor = totalMH * loadedRate + otPremium;  // Burdened Labor Cost
  const tools = directLabor * i.toolsPct;
  const subtotal = directLabor + tools;
  const contingency = subtotal * i.contingencyPct;
  const totalCost = subtotal + contingency;          // Fully-Loaded Cost

  const bid = safeDiv(totalCost, 1 - i.targetMarginPct);
  const bidPerLb = safeDiv(bid, i.weightLb);
  const bidCentsPerLb = bidPerLb * 100;
  const bidPerTon = safeDiv(bid, weightTons);
  const breakevenPerTon = safeDiv(totalCost, weightTons);
  // OT's share of the bid in c/lb: gross the premium up through the same
  // tools/contingency/margin path the bid itself uses, then express per lb.
  const otGrossedToCost = otPremium * (1 + i.toolsPct) * (1 + i.contingencyPct);
  const otBidPortion = safeDiv(otGrossedToCost, 1 - i.targetMarginPct);
  const otCentsPerLb = Math.round(safeDiv(otBidPortion, i.weightLb) * 100 * 100) / 100;
  const otHours = i.otOn ? fieldMH * (i.otPct || 0) : 0;

  const grossProfit = bid - totalCost;               // = Operating Profit
  const grossMargin = safeDiv(grossProfit, bid);
  const revenuePerMH = bidPerLb * i.outputLbPerMH;
  const profitPerMH = revenuePerMH - loadedRate;

  return { weightTons, fieldMH, totalMH, crewDays, loadedRate, directLabor, tools, subtotal, contingency, totalCost, bid, bidPerLb, bidCentsPerLb, bidPerTon, breakevenPerTon, grossProfit, grossMargin, revenuePerMH, profitPerMH, otPremium, otCentsPerLb, otHours };
}

export const roundToQuarterCent = (cents) => Math.round(Number(cents) / 0.25) * 0.25;

// Recompute price-derived outputs at the ACTIVE bid rate (cost stays fixed).
export function applyBid(i, e, activeCentsPerLb) {
  const perLb = safeDiv(activeCentsPerLb, 100);
  const bid = perLb * i.weightLb;
  const perTon = perLb * 2000;
  const grossProfit = bid - e.totalCost;
  const grossMargin = safeDiv(grossProfit, bid);
  const revenuePerMH = perLb * i.outputLbPerMH;
  const profitPerMH = revenuePerMH - e.loadedRate;
  return { centsPerLb: activeCentsPerLb, perLb, bid, perTon, grossProfit, grossMargin, revenuePerMH, profitPerMH };
}

// -----------------------------------------------------------------------------
// priceBid — the full flow the OS uses. rawInputs use calculator names; blanks
// coerce to defaults then 0 (same as the calculator). activeRatePerLb: the bid
// rate in $/lb actually in effect (existing/amended). If null → use the
// recommended (rounded) rate.
// -----------------------------------------------------------------------------
export function priceBid(rawInputs, activeRatePerLb = null) {
  const merged = { ...CALC_DEFAULTS, ...rawInputs };
  const i = {};
  for (const k in merged) i[k] = merged[k] === "" || merged[k] == null ? 0 : Number(merged[k]);

  const e = computeEstimate(i);
  const recommendedCents = e.bidCentsPerLb;
  const roundedCents = roundToQuarterCent(recommendedCents);
  const activeCents = activeRatePerLb != null && !isNaN(Number(activeRatePerLb)) && Number(activeRatePerLb) > 0
    ? Number(activeRatePerLb) * 100
    : roundedCents;

  const d = applyBid(i, e, activeCents);

  // SPECIALTY (PT + mesh) — labor-only scope priced alongside the rebar.
  //
  // These figures are saved back to the bid, so they MUST be the combined
  // rebar+specialty totals. Counting specialty revenue without its cost is what
  // inflated stored margins before (Ridgehouse read 46% when it was really 30%).
  // specialtyRevenue/-Cost are resolved by the caller from the bid's line items
  // or the calculator's (calc) columns; ptSpecialty is the OLD manual column,
  // used only when a legacy bid has nothing newer.
  const specRevenue = Number(rawInputs.specialtyRevenue) || 0;
  const specCost = Number(rawInputs.specialtyCost) || 0;
  const specHours = Number(rawInputs.specialtyHours) || 0;
  const legacyPt = Number(rawInputs.ptSpecialty) || 0;
  const specialtyRevenue = specRevenue || legacyPt;   // never both
  const specialtyCost = specRevenue ? specCost : 0;   // the legacy column carried no cost

  const contractValue = d.bid + specialtyRevenue;
  const totalCost = e.totalCost + specialtyCost;
  const operatingProfit = contractValue - totalCost;
  const operatingMargin = safeDiv(operatingProfit, contractValue);

  return {
    recommendedCents,
    roundedCents,
    activeCents,
    bidRatePerLb: Number(d.perLb.toFixed(4)),
    contractValue: Number(contractValue.toFixed(2)),
    operatingProfit: Number(operatingProfit.toFixed(2)),
    operatingMargin: Number(operatingMargin.toFixed(4)),
    fullyLoadedCost: Number(totalCost.toFixed(2)),
    rebarCost: Number(e.totalCost.toFixed(2)),
    specialtyRevenue: Number(specialtyRevenue.toFixed(2)),
    specialtyCost: Number(specialtyCost.toFixed(2)),
    specialtyHours: Number(specHours.toFixed(2)),
    rebarRevenue: Number(d.bid.toFixed(2)),
    totalMHCombined: Number((e.totalMH + specHours).toFixed(1)), // rebar + specialty man-hours
    burdenedLaborCost: Number(e.directLabor.toFixed(2)),
    totalMH: e.totalMH,
    fieldMH: e.fieldMH,
    crewDays: e.crewDays,
    assumptions: {
      burdenPct: i.burdenPct, toolsPct: i.toolsPct, contingencyPct: i.contingencyPct,
      mobilizationHrs: i.mobilizationHrs, targetMarginPct: i.targetMarginPct,
      hoursPerDay: i.hoursPerDay,
    },
  };
}
