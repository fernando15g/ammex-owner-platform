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
  outputLbPerMH: 140,
};

// Full cost stack → raw recommended bid.
export function computeEstimate(i) {
  const weightTons = safeDiv(i.weightLb, 2000);
  const fieldMH = safeDiv(i.weightLb, i.outputLbPerMH);
  const totalMH = fieldMH + i.mobilizationHrs;
  const crewDays = safeDiv(totalMH, i.crewSize * i.hoursPerDay);
  const loadedRate = i.wageRate * (1 + i.burdenPct);

  const directLabor = totalMH * loadedRate;          // Burdened Labor Cost
  const tools = directLabor * i.toolsPct;
  const subtotal = directLabor + tools;
  const contingency = subtotal * i.contingencyPct;
  const totalCost = subtotal + contingency;          // Fully-Loaded Cost

  const bid = safeDiv(totalCost, 1 - i.targetMarginPct);
  const bidPerLb = safeDiv(bid, i.weightLb);
  const bidCentsPerLb = bidPerLb * 100;
  const bidPerTon = safeDiv(bid, weightTons);
  const breakevenPerTon = safeDiv(totalCost, weightTons);
  const grossProfit = bid - totalCost;               // = Operating Profit
  const grossMargin = safeDiv(grossProfit, bid);
  const revenuePerMH = bidPerLb * i.outputLbPerMH;
  const profitPerMH = revenuePerMH - loadedRate;

  return { weightTons, fieldMH, totalMH, crewDays, loadedRate, directLabor, tools, subtotal, contingency, totalCost, bid, bidPerLb, bidCentsPerLb, bidPerTon, breakevenPerTon, grossProfit, grossMargin, revenuePerMH, profitPerMH };
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

  const pt = Number(rawInputs.ptSpecialty) || 0;
  const contractValue = d.bid + pt;
  const operatingProfit = contractValue - e.totalCost;
  const operatingMargin = safeDiv(operatingProfit, contractValue);

  return {
    recommendedCents,
    roundedCents,
    activeCents,
    bidRatePerLb: Number(d.perLb.toFixed(4)),
    contractValue: Number(contractValue.toFixed(2)),
    operatingProfit: Number(operatingProfit.toFixed(2)),
    operatingMargin: Number(operatingMargin.toFixed(4)),
    fullyLoadedCost: Number(e.totalCost.toFixed(2)),
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
