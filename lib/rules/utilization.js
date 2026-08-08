// =============================================================================
// CREW UTILIZATION — the honest capacity model (replaces the reservoir's
// "cram every job into one quarter" math that produced impossible negatives).
//
// The insight: job STATUS lies (19 "active" jobs), TIMESHEETS tell the truth
// (5-6 actually crewed in a given week). So current demand is measured from
// hours actually logged in a trailing window, never from job status or from
// dumping every job's full remaining tonnage onto one horizon.
//
//   SUPPLY  = field crew (live roster) × realized hrs/day × 5 days × weeks
//   DEMAND  = counted timesheet hours actually logged in the window
//   UTIL    = demand / supply
//   HEADROOM= supply − demand, expressed as crew-equivalents ("room for ~N")
//
// Everything is SHOWN on screen (crew × hrs × days × weeks = available; logged;
// % used) so the number is auditable, never a black box.
// =============================================================================

// Count field crew from the LIVE roster. Field labor only — owners/PMs
// (President, Project Manager, office roles) are excluded by role.
export function fieldCrew(crew) {
  return (crew || []).filter((m) => {
    if (!m.active) return false;
    const role = String(m.role || "").toLowerCase();
    return role.includes("rodbuster") || role.includes("foreman");
  });
}

export function crewBreakdown(crew) {
  const field = fieldCrew(crew);
  let rodbusters = 0, foremen = 0;
  for (const m of field) {
    const role = String(m.role || "").toLowerCase();
    if (role.includes("foreman")) foremen += 1;
    else rodbusters += 1;
  }
  return { total: field.length, rodbusters, foremen };
}

// Sum counted timesheet hours in a trailing window, and count distinct jobs
// actually worked. "Counted" = not voided, not under review (real, settled work).
export function loggedHoursInWindow(timecards, sinceDate) {
  let hours = 0;
  const jobs = new Set();
  let workers = new Set();
  for (const c of timecards || []) {
    if (c.voided || c.underReview) continue;
    if (!c.date) continue;
    if (sinceDate && new Date(c.date) < sinceDate) continue;
    if (!(Number(c.hours) > 0)) continue;
    hours += Number(c.hours);
    if (c.projectId) jobs.add(c.projectId);
    if (c.worker) workers.add(c.worker);
  }
  return { hours, jobsWorked: jobs.size, workersLogged: workers.size };
}

// The whole computation for one window.
export function computeUtilization({ crew, timecards, realizedHoursPerDay, windowWeeks, daysPerWeek = 5 }) {
  const bd = crewBreakdown(crew);
  const hrsPerDay = realizedHoursPerDay && realizedHoursPerDay > 0 ? realizedHoursPerDay : 6.5;

  // available crew-hours over the window (the honest denominator)
  const supplyHours = bd.total * hrsPerDay * daysPerWeek * windowWeeks;

  const since = new Date();
  since.setDate(since.getDate() - windowWeeks * 7);
  const logged = loggedHoursInWindow(timecards, since);

  const utilization = supplyHours > 0 ? logged.hours / supplyHours : null;
  // crew-equivalents: translate hours back into "how many people's worth"
  const perCrewHours = hrsPerDay * daysPerWeek * windowWeeks;
  const crewDeployed = perCrewHours > 0 ? logged.hours / perCrewHours : null;
  const crewFree = crewDeployed != null ? bd.total - crewDeployed : null;

  return {
    windowWeeks,
    daysPerWeek,
    realizedHoursPerDay: hrsPerDay,
    headcount: bd.total,
    breakdown: bd,
    supplyHours,
    loggedHours: logged.hours,
    jobsWorked: logged.jobsWorked,
    workersLogged: logged.workersLogged,
    utilization,                         // 0..1 (can exceed 1 if overtime/over-deployed)
    crewDeployed,                        // e.g. 30.2
    crewFree,                            // e.g. 6.8  (negative = overcommitted)
  };
}

// Forward-looking pressure: backlog + confidence-weighted pipeline, spread over
// rough bid-duration, expressed as crew-equivalents that WILL be needed. Rough
// by design (assumes steady burn) — labeled as an estimate, not a promise.
export function incomingPressure({ backlogInputs, weightedPipelineHours, realizedHoursPerDay, windowWeeks, headcount, daysPerWeek = 5 }) {
  const hrsPerDay = realizedHoursPerDay && realizedHoursPerDay > 0 ? realizedHoursPerDay : 6.5;
  const perCrewHours = hrsPerDay * daysPerWeek * windowWeeks;
  // backlogInputs: [{ hoursNeeded, durationWeeks }] — hours that land in THIS window
  let windowHours = 0;
  for (const b of backlogInputs || []) {
    if (!(b.hoursNeeded > 0)) continue;
    const dur = b.durationWeeks && b.durationWeeks > 0 ? b.durationWeeks : windowWeeks;
    const fraction = Math.min(windowWeeks / dur, 1); // slice that lands in-window
    windowHours += b.hoursNeeded * fraction;
  }
  windowHours += weightedPipelineHours || 0;
  const crewNeeded = perCrewHours > 0 ? windowHours / perCrewHours : null;
  return { windowHours, crewNeeded };
}
