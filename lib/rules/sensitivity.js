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

// Steps as a share of what was bid: a good week above, realistic slippage below.
const STEPS = [1.1, 1.0, 0.92, 0.85, 0.78];

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
  const rows = STEPS.map((f) => {
    const value = Math.round(bid * f);
    const m = marginAt(inputs, assumptions, lines, specialtyOn, { outputLbPerMH: value, storedSpec });
    return { value, isBid: f === 1, ...m };
  });
  // How far can productivity slip before combined margin reaches the floor?
  let cushion = null;
  for (let v = bid; v > bid * 0.4; v -= 1) {
    const m = marginAt(inputs, assumptions, lines, specialtyOn, { outputLbPerMH: v, storedSpec });
    if (m.combined < floor) { cushion = { at: v + 1, pct: (bid - (v + 1)) / bid }; break; }
  }
  return { unit: "lb/MH", bid, rows, cushion };
}

// Specialty ladder: vary the assumption that scope actually rests on —
// productivity for PT Building and Mesh, hours for PT Bridge (which has no
// productivity; the fabricator supplies the hours).
export function specialtyLadder({ inputs, assumptions, lines, storedSpec, floor }) {
  // Calculator bids store totals with no line detail — nothing to vary per line.
  if (storedSpec || !lines || lines.length === 0) return null;
  const priced = computeSpecialtyRollup(lines, assumptions, { revenue: 0, cost: 0, hours: 0 });
  const usable = priced.rows.filter((r) => r.hasCostBasis);
  if (usable.length === 0) return null;

  const scale = (l, f) => {
    if (l.type === "PT Building") return { ...l, prodLbPerMH: (Number(l.prodLbPerMH) || 0) * f };
    if (l.type === "Mesh") return { ...l, prodSqftPerMH: (Number(l.prodSqftPerMH) || 0) * f };
    if (l.type === "PT Bridge") return { ...l, hours: (Number(l.hours) || 0) / f }; // fewer per hour = more hours
    return l;
  };
  const rows = STEPS.map((f) => {
    const m = marginAt(inputs, assumptions, lines, true, { lineFor: (l) => scale(l, f), storedSpec: null });
    return { label: f === 1 ? "as bid" : `${f > 1 ? "+" : ""}${Math.round((f - 1) * 100)}%`, isBid: f === 1,
      specMargin: m.roll.specMargin, combined: m.combined };
  });
  return { rows, floor };
}

// Why a ladder can't be shown, in plain words, so the panel says what's missing
// instead of leaving a silent gap.
export function sensitivityBlocker({ inputs }) {
  if (!(Number(inputs.weightLb) > 0)) return "Add estimated LBS to see how the margin moves.";
  if (!(Number(inputs.outputLbPerMH) > 0)) return "Add productivity to see how the margin moves.";
  return null;
}
