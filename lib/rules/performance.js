// =============================================================================
// PERFORMANCE RULES — realized vs. bid productivity (the strategic feedback
// loop). If crews really place 250 lbs/MH when bids price 300, every future
// bid is underwater. This zone answers: what do crews ACTUALLY produce, and
// what does the gap cost?
//
// TRUST STATES — baked in from day one, not a later refinement. The data isn't
// 100% yet, and a confidently wrong number is worse than no number (you'd bid
// tighter off 806 lbs/MH and lose money). So every job is classified:
//
//   • trusted      — done, and hours + weight hang together. ONLY these feed
//                    the fleet averages and the sensitivity numbers.
//   • needs-review — done, but the numbers contradict each other (implied
//                    lbs/MH outside the sane band, hours missing, tonnage
//                    missing, all timecards voided). Shown WITH the
//                    discrepancy spelled out so the timesheet/tonnage can be
//                    fixed — excluded from every average until it is.
//   • in-progress  — crews still on it. Gets a PROJECTION (pace so far),
//                    never a verdict; partial jobs judged early look better
//                    or worse than they'll finish.
//
// Honest by construction: it gets better as the data gets cleaned, rather
// than lying until someone happens to fix it.
//
// All math in code (migration-safe), riding on the guards that already exist:
// hours.js (voided/under-review excluded, era detection), phase.js (lifecycle).
// =============================================================================

import { PHASE } from "@/lib/rules/phase";

export const PERF = {
  // Sane band for a realized lbs/MH on a COMPLETED rebar job. Outside this,
  // the hours and the tonnage are contradicting each other (e.g. the 806
  // lbs/MH artifacts where timecards are missing). Tunable dials.
  SANE_MIN: 40,
  SANE_MAX: 500,
  // Below this many counted hours the sample is too small to call a verdict.
  MIN_HOURS: 8,
  // An in-progress job needs ~10% placed before its pace means anything
  // (same instinct as burn.js MIN_PLACED_TO_FORECAST).
  MIN_PLACED_TO_PROJECT: 0.1,
  // What the calculator assumes when a bid never stored productivity.
  DEFAULT_BID_PRODUCTIVITY: 140,
  // Fallbacks for the $ translation when a bid is missing wage.
  DEFAULT_BASE_WAGE: 32,
  BURDEN: 0.2,
};

// ---------------------------------------------------------------------------
// classifyJob(project) → one performance row, or null when the job simply has
// nothing to say yet (bidding/backlog, or complete with zero of anything —
// pre-timesheet-era rows that never carried data).
// ---------------------------------------------------------------------------
export function classifyJob(p) {
  const done = p.phase === PHASE.COMPLETE || p.phase === PHASE.BILLING;
  const running = p.phase === PHASE.RUNNING;
  if (!done && !running) return null;

  const placed = typeof p.placedLbs === "number" && p.placedLbs > 0 ? p.placedLbs : null;
  const hours = typeof p.hours?.hours === "number" && p.hours.hours > 0 ? p.hours.hours : null;
  const realized = placed && hours ? placed / hours : null;

  const base = {
    id: p.id,
    projectId: p.projectId,
    name: p.name,
    status: p.status,
    phase: p.phase,
    placedLbs: placed,
    awardedLbs: p.awardedLbs ?? null,
    placedFraction: p.placedFraction ?? null,
    hours,
    hoursEra: p.hours?.era ?? null,
    realized, // lbs/MH, null when it can't be computed
    bidProductivity: p.bid?.productivity ?? null,
    baseWage: p.bid?.baseWage ?? null,
    hasBid: !!p.bid,
    foreman: p.foreman || [],
  };

  // ---- running: projection, never a verdict --------------------------------
  if (running) {
    const projectable =
      realized != null &&
      typeof p.placedFraction === "number" &&
      p.placedFraction >= PERF.MIN_PLACED_TO_PROJECT;
    return {
      ...base,
      state: "in-progress",
      projectable,
      // pace so far — explicitly a projection; mobilizing hours drag it early
      paceLbsPerMH: projectable ? realized : null,
      isMobilizing: !!p.isMobilizing,
      ...varianceBits(base),
    };
  }

  // ---- done: verdict, but only when the numbers hang together --------------
  // A complete job with literally nothing recorded predates the data era —
  // there's nothing to review, so it stays off the page entirely.
  if (placed == null && hours == null) return null;

  const problems = [];
  if (placed == null) problems.push("job is complete but no placed pounds are recorded");
  if (hours == null) {
    problems.push(
      p.hours?.pendingCorrection
        ? "every timecard on this job is voided — hours pending correction"
        : "no labor hours recorded"
    );
  }
  if (hours != null && hours < PERF.MIN_HOURS) {
    problems.push(`only ${Math.round(hours)} hours recorded — sample too small to trust`);
  }
  if (realized != null && (realized < PERF.SANE_MIN || realized > PERF.SANE_MAX)) {
    problems.push(
      realized > PERF.SANE_MAX
        ? `implies ${Math.round(realized)} lbs/MH — hours look too low for the tonnage (missing timecards?)`
        : `implies ${Math.round(realized)} lbs/MH — hours look too high for the tonnage (stale placed lbs?)`
    );
  }

  if (problems.length) {
    return { ...base, state: "needs-review", problems, ...varianceBits(base) };
  }

  return { ...base, state: "trusted", ...varianceBits(base) };
}

// Variance vs. what the bid assumed, and what the slip cost in real dollars.
// Positive deltaHours = the job took MORE hours than the bid priced for the
// steel actually placed; costSlip translates that into burdened labor $.
function varianceBits({ realized, bidProductivity, placedLbs, hours, baseWage }) {
  if (realized == null || typeof bidProductivity !== "number" || bidProductivity <= 0) {
    return { variancePct: null, deltaHours: null, costSlip: null };
  }
  const variancePct = (realized - bidProductivity) / bidProductivity;
  const bidHoursForPlaced = placedLbs / bidProductivity;
  const deltaHours = hours - bidHoursForPlaced;
  const burdened = (typeof baseWage === "number" && baseWage > 0 ? baseWage : PERF.DEFAULT_BASE_WAGE) * (1 + PERF.BURDEN);
  return { variancePct, deltaHours, costSlip: deltaHours * burdened };
}

// ---------------------------------------------------------------------------
// computePerformance(projects) — the whole zone's numbers in one pass.
// ---------------------------------------------------------------------------
export function computePerformance(projects) {
  const rows = projects.map(classifyJob).filter(Boolean);

  const trusted = rows.filter((r) => r.state === "trusted");
  const needsReview = rows.filter((r) => r.state === "needs-review");
  const inProgress = rows.filter((r) => r.state === "in-progress");

  // Fleet realized: pounds-weighted blend (Σ lbs ÷ Σ hours) over TRUSTED jobs
  // only — a big job counts more than a small one, which is what "what do my
  // crews produce" actually means. Never an average of ratios.
  const totLbs = trusted.reduce((a, r) => a + r.placedLbs, 0);
  const totHours = trusted.reduce((a, r) => a + r.hours, 0);
  const blendedRealized = totHours > 0 ? totLbs / totHours : null;

  // What bids assume: average stored productivity across the same trusted
  // jobs (their own bids), falling back to the calculator default when a job
  // has no bid productivity. Comparing the SAME jobs keeps it apples-to-apples.
  const prods = trusted
    .map((r) => (typeof r.bidProductivity === "number" && r.bidProductivity > 0 ? r.bidProductivity : null))
    .filter(Boolean);
  const bidAssumed = prods.length
    ? prods.reduce((a, b) => a + b, 0) / prods.length
    : trusted.length
    ? PERF.DEFAULT_BID_PRODUCTIVITY
    : null;

  // The gap, and what it means in hours and burdened dollars per 100k lbs —
  // the number that should eventually tune the calculator.
  let gap = null;
  if (blendedRealized != null && bidAssumed != null) {
    const wages = trusted.map((r) => r.baseWage).filter((w) => typeof w === "number" && w > 0);
    const avgWage = wages.length ? wages.reduce((a, b) => a + b, 0) / wages.length : PERF.DEFAULT_BASE_WAGE;
    const burdened = avgWage * (1 + PERF.BURDEN);
    const hoursAtBid = 100000 / bidAssumed;
    const hoursAtRealized = 100000 / blendedRealized;
    const deltaHoursPer100k = hoursAtRealized - hoursAtBid; // + = bids underprice hours
    gap = {
      pct: (blendedRealized - bidAssumed) / bidAssumed, // − = crews slower than bids assume
      deltaHoursPer100k,
      costPer100k: deltaHoursPer100k * burdened,
      burdenedWage: burdened,
    };
  }

  // The cumulative receipts: across trusted jobs, what productivity slip has
  // already cost (or saved) vs. what the bids priced.
  const totalCostSlip = trusted.reduce((a, r) => a + (typeof r.costSlip === "number" ? r.costSlip : 0), 0);

  // sort: trusted worst-variance first (the bids most underwater at the top);
  // needs-review and in-progress by name.
  trusted.sort((a, b) => (a.variancePct ?? 0) - (b.variancePct ?? 0));
  needsReview.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  inProgress.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  return {
    trusted,
    needsReview,
    inProgress,
    fleet: {
      blendedRealized,
      bidAssumed,
      gap,
      totalCostSlip,
      trustedJobs: trusted.length,
      trustedLbs: totLbs,
      trustedHours: totHours,
      needsReviewCount: needsReview.length,
    },
  };
}
