// =============================================================================
// BURN RULES — build spec §7.4 (live forecast). Reads a Project (the hub) and
// returns the honest burn picture. The star metric: forecast finish %.
//
// Honesty guards baked in:
//  • actual hours already exclude voided + under-review (hours.js)
//  • placement paired with hours so early jobs don't look falsely great
//  • no bid hours → can't forecast (return flagged, never fake a number)
//  • zero/blank projected → guarded (no divide-by-zero)
//  • forecast only when enough is placed to extrapolate honestly
// =============================================================================

const MIN_PLACED_TO_FORECAST = 0.1; // need ~10% placed before extrapolating

export function computeBurn(project) {
  const bid = project.bid;
  const projectedHours = bid?.projectedHours ?? null;
  const actualHours = project.hours?.hours ?? null;
  const placedFraction = project.placedFraction ?? null;

  // % of budgeted hours consumed so far
  const hoursPct =
    typeof actualHours === "number" && typeof projectedHours === "number" && projectedHours > 0
      ? actualHours / projectedHours
      : null;

  // Forecast finish: hours-spent% ÷ placed-fraction. Extrapolates current pace
  // to completion. Only meaningful once enough steel is placed.
  let forecastPct = null;
  let forecastable = false;
  if (
    typeof hoursPct === "number" &&
    typeof placedFraction === "number" &&
    placedFraction >= MIN_PLACED_TO_FORECAST
  ) {
    forecastPct = hoursPct / placedFraction;
    forecastable = true;
  }

  // Status for the pill/severity — mobilizing jobs are exempt from burn alarms
  // (staging hours with little placement is normal, not bleeding).
  let severity = "ok";
  if (project.isMobilizing) severity = "mobilizing";
  else if (projectedHours == null) severity = "no-bid";
  else if (typeof forecastPct === "number") {
    if (forecastPct >= 1.05) severity = "danger";
    else if (forecastPct >= 0.95) severity = "warn";
    else severity = "ok";
  } else if (typeof hoursPct === "number" && hoursPct > 1) {
    severity = "warn"; // over budget but not enough placement to forecast
  }

  return {
    projectedHours,
    actualHours,
    hoursPct,
    placedFraction,
    forecastPct,
    forecastable,
    severity,
    hoursEra: project.hours?.era ?? null,
    pendingCorrection: project.hours?.pendingCorrection ?? false,
  };
}

// Sort helper: worst-first, but mobilizing and no-bid sink below real running jobs.
export function burnSortValue(burn) {
  if (burn.severity === "mobilizing") return -1;
  if (burn.severity === "no-bid") return -2;
  return typeof burn.forecastPct === "number"
    ? burn.forecastPct
    : typeof burn.hoursPct === "number"
    ? burn.hoursPct
    : 0;
}
