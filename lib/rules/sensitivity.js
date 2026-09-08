// =============================================================================
// BID SENSITIVITY — how much does the margin move if the crews don't hit the
// productivity the bid assumed?
//
// The rate is held FIXED at whatever the bid is carrying. Once a bid is
// submitted the rate is locked regardless of how it was arrived at (typed or
// recommended), so the only open question is what the margin does if
// production slips. Nothing here writes anything; it is a what-if view.
//
// Everything is recomputed through the real engine rather than approximated,
// so these numbers agree with the economics box exactly at the bid row.
// =============================================================================
import { priceBid } from "@/lib/rules/bidCostEngine";
import { computeSpecialtyRollup } from "@/lib/rules/specialty";

// Fixed 5 lb/MH steps either side of what was bid, so the rows read as round
// numbers a person can reason about (130 -> 135, 140 ...) instead of arbitrary
// percentages. Six each way; rows at or below zero are dropped.
const STEP = 5;
const STEPS_EACH_WAY = 6;

function marginAt(inputs, assumptions, lines, specialtyOn, overrides) {
  const lns = specialtyOn
    ? (lines || []).map((l) => (overrides.lineFor ? overrides.lineFor(l) : l))
    : [];
  const roll = computeSpecialtyRollup(lns, assumptions, { revenue: 0, cost: 0, hours: 0 });
  const e = priceBid(
    {
      ...inputs,
      outputLbPerMH: overrides.outputLbPerMH ?? inputs.outputLbPerMH,
      specialtyRevenue: overrides.storedSpec ? overrides.storedSpec.revenue : roll.specRevenue,
      specialtyCost: overrides.storedSpec ? overrides.storedSpec.cost : roll.specCost,
      specialtyHours: overrides.storedSpec ? overrides.storedSpec.hours : roll.specHours,
    },
    inputs.activeRate,
  );
  const rebarMargin = e.rebarRevenue ? (e.rebarRevenue - e.rebarCost) / e.rebarRevenue : null;
  return { combined: e.operatingMargin, rebar: rebarMargin, profit: e.operatingProfit, roll };
}

// Rebar ladder: vary placement productivity, hold everything else.
export function rebarLadder({ inputs, assumptions, lines, specialtyOn, storedSpec, floor }) {
  const bid = Number(inputs.outputLbPerMH) || 0;
  if (!bid || !(Number(inputs.weightLb) > 0)) return null;
  const rows = [];
  for (let i = STEPS_EACH_WAY; i >= -STEPS_EACH_WAY; i--) {
    const value = Math.round(bid + i * STEP);
    if (value <= 0) continue; // a small bid can step below zero — skip those
    const m = marginAt(inputs, assumptions, lines, specialtyOn, { outputLbPerMH: value, storedSpec });
    rows.push({ value, isBid: i === 0, ...m });
  }
  // How far can productivity slip before combined margin reaches the floor?
  let cushion = null;
  for (let v = bid; v > bid * 0.4; v -= 1) {
    const m = marginAt(inputs, assumptions, lines, specialtyOn, { outputLbPerMH: v, storedSpec });
    if (m.combined < floor) { cushion = { at: v + 1, pct: (bid - (v + 1)) / bid }; break; }
  }
  return { unit: "lb/MH", bid, rows, cushion };
}

// Why a ladder can't be shown, in plain words, so the panel says what's missing
// instead of leaving a silent gap.
export function sensitivityBlocker({ inputs }) {
  if (!(Number(inputs.weightLb) > 0)) return "Add estimated LBS to see how the margin moves.";
  if (!(Number(inputs.outputLbPerMH) > 0)) return "Add productivity to see how the margin moves.";
  return null;
}
