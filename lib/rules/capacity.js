// =============================================================================
// CAPACITY ENGINE — build spec §5.5. The reservoir model:
//
//   DEMAND (hours)  = tons of committed work ÷ productivity
//                     committed = running work REMAINING (awarded − placed)
//                               + awarded-not-started (backlog)
//                     expected  = committed + confidence-weighted pipeline tons
//   SUPPLY (hours)  = field headcount × realized hours/day × days/week × weeks
//   HEADROOM        = supply − demand → converted back to TONS = the bid signal
//
// Deliberately a reservoir (totals over a rolling horizon), NOT a calendar —
// start dates are unreliable (jobs slip 6–12 months) and the reservoir doesn't
// care when inside the window the work lands.
//
// Supply honesty: realized hours/day comes from timesheet history (~6h real
// days — drive distance eats the nominal 8). Hardcoding 8 would overstate
// supply and falsely whisper "bid aggressive." Owner can override the computed
// value; overtime is an off-by-default lever, never baseline.
// =============================================================================

export const CAPACITY_DEFAULTS = {
  daysPerWeek: 5,
  horizonWeeks: 13, // ~one quarter
  fallbackHoursPerDay: 6.5, // used only until timesheet history exists
  overtimeHoursPerDay: 0, // off by default; a lever, not capacity
};

// demandInputs: [{ tons, productivity }] — one entry per piece of committed work
// (running jobs pass REMAINING tons; backlog jobs pass full tons).
export function demandHours(demandInputs) {
  let hours = 0;
  let missingProductivity = 0;
  for (const d of demandInputs) {
    if (typeof d.tons === "number" && typeof d.productivity === "number" && d.productivity > 0) {
      hours += (d.tons * 2000) / d.productivity;
    } else if (typeof d.tons === "number" && d.tons > 0) {
      missingProductivity += 1; // real work we couldn't convert — surface, don't hide
    }
  }
  return { hours, missingProductivity };
}

export function supplyHours({ headcount, realizedHoursPerDay, daysPerWeek, horizonWeeks, overtimeHoursPerDay }) {
  const perDay = (realizedHoursPerDay || CAPACITY_DEFAULTS.fallbackHoursPerDay) + (overtimeHoursPerDay || 0);
  return headcount * perDay * daysPerWeek * horizonWeeks;
}

// Headroom back into tons using a blended productivity so the signal speaks
// the language bids are made in ("room for ~180 more tons this quarter").
export function computeCapacity({ committedDemand, expectedDemand, supply, blendedProductivity }) {
  const committedHeadroomHours = supply - committedDemand.hours;
  const expectedHeadroomHours = supply - expectedDemand.hours;
  const toTons = (h) =>
    typeof blendedProductivity === "number" && blendedProductivity > 0
      ? (h * blendedProductivity) / 2000
      : null;
  return {
    supplyHours: supply,
    committedDemandHours: committedDemand.hours,
    expectedDemandHours: expectedDemand.hours,
    committedHeadroomHours,
    expectedHeadroomHours,
    committedHeadroomTons: toTons(committedHeadroomHours),
    expectedHeadroomTons: toTons(expectedHeadroomHours),
    missingProductivity: committedDemand.missingProductivity + expectedDemand.missingProductivity,
  };
}
