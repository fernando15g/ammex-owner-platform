// =============================================================================
// CREW UTILIZATION — one honest question: how much of my crew is being used
// right now, and how much more can I comfortably take on?
//
// Two numbers, measured (not predicted):
//   USED       = crew-hours logged in the last 30 days / available crew-hours
//   HEADROOM   = comfortable capacity (85% of crew) − crew currently used
//
// Nobody predicts future crew demand accurately without dated schedules, and
// we don't have those. So we DON'T guess what work you'll win. We measure how
// busy you are now (certain) and show comfortable room to take on more. The
// decision — hire or stay put — falls out of that.
// =============================================================================

// 85% is "comfortably full" — you need slack for bursty jobs, callouts, and the
// job that suddenly needs a bigger crew. Running at 100% on paper means zero
// buffer, which in the field means you're actually over.
export const COMFORT_CEILING = 0.85;
const WINDOW_DAYS = 30;
const DAYS_PER_WEEK = 5;

// Field crew from the live roster — active rodbusters + foremen. Owners/PMs
// (President, Project Manager) are excluded by role.
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
    if (role.includes("foreman")) foremen += 1; else rodbusters += 1;
  }
  return { total: field.length, rodbusters, foremen };
}

// Counted timesheet hours in the last N days + distinct jobs worked.
export function loggedHoursInWindow(timecards, sinceDate) {
  let hours = 0;
  const jobs = new Set();
  for (const c of timecards || []) {
    if (c.voided || c.underReview) continue;
    if (!c.date || !(Number(c.hours) > 0)) continue;
    if (sinceDate && new Date(c.date) < sinceDate) continue;
    hours += Number(c.hours);
    if (c.projectId) jobs.add(c.projectId);
  }
  return { hours, jobsWorked: jobs.size };
}

// The whole thing — one 30-day read.
export function computeUtilization({ crew, timecards, realizedHoursPerDay }) {
  const bd = crewBreakdown(crew);
  const hrsPerDay = realizedHoursPerDay && realizedHoursPerDay > 0 ? realizedHoursPerDay : 6.5;
  const windowWeeks = WINDOW_DAYS / 7;

  // available crew-hours over the last 30 days
  const supplyHours = bd.total * hrsPerDay * DAYS_PER_WEEK * windowWeeks;

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);
  const logged = loggedHoursInWindow(timecards, since);

  const perCrewHours = hrsPerDay * DAYS_PER_WEEK * windowWeeks;
  const crewUsed = perCrewHours > 0 ? logged.hours / perCrewHours : null;   // e.g. 24.1
  const utilization = supplyHours > 0 ? logged.hours / supplyHours : null;  // 0..1

  // comfortable capacity and the headroom that matters for the decision
  const comfortableCrew = bd.total * COMFORT_CEILING;
  const comfortableHeadroom = crewUsed != null ? comfortableCrew - crewUsed : null; // crew you can add before "uncomfortable"

  // decision state
  let state = "ok";
  if (utilization != null) {
    if (utilization >= COMFORT_CEILING) state = "full";       // at/over comfortable — hire or turn work away
    else if (utilization >= 0.70) state = "tight";            // getting full — be selective
    else state = "room";                                      // comfortable room
  }

  return {
    windowDays: WINDOW_DAYS,
    daysPerWeek: DAYS_PER_WEEK,
    realizedHoursPerDay: hrsPerDay,
    headcount: bd.total,
    breakdown: bd,
    supplyHours,
    loggedHours: logged.hours,
    jobsWorked: logged.jobsWorked,
    utilization,
    crewUsed,
    comfortableCrew,
    comfortableHeadroom,
    comfortCeiling: COMFORT_CEILING,
    state,
  };
}

// Committed (won, not speculative) future work still to place, as crew-weeks —
// a small honest "what's already on the books" note, NOT a prediction of new work.
export function committedRemaining({ runningProjects, backlogProjects, realizedHoursPerDay }) {
  const hrsPerDay = realizedHoursPerDay && realizedHoursPerDay > 0 ? realizedHoursPerDay : 6.5;
  let remainingHours = 0;
  let runningRemainingHours = 0;
  const add = (lbs, prod, isRunning) => {
    if (!(lbs > 0) || !(prod > 0)) return;
    const h = lbs / prod;
    remainingHours += h;
    if (isRunning) runningRemainingHours += h;
  };
  for (const p of runningProjects || []) {
    const awarded = typeof p.awardedLbs === "number" ? p.awardedLbs : 0;
    const placed = typeof p.placedLbs === "number" ? p.placedLbs : 0;
    const remaining = Math.max(awarded - placed, 0);       // contract minus done — REAL
    add(remaining, p.bid?.productivity, true);
  }
  for (const p of backlogProjects || []) {
    const awarded = typeof p.awardedLbs === "number" ? p.awardedLbs : 0;
    add(awarded, p.bid?.productivity, false);              // not started — full tonnage
  }
  return { remainingHours, runningRemainingHours };
}
