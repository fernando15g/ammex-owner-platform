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
import { computeBurn } from "@/lib/rules/burn";

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
  // MATCHED→TOTAL SWITCH: matched pace (billed lbs ÷ hours through the last
  // invoice date) is the honest mid-job number — but once a job is ≥85% billed
  // BY POUNDS (or closed), billing has caught up to the field and the remaining
  // hours are punchlist/cleanup logged after the last invoice. Matching would
  // exclude those and flatter the number, so the pace switches to billed lbs ÷
  // ALL hours. 85% per owner decision (was 98%-by-dollars).
  MATCHED_MAX_BILLED_PCT: 0.85,
  // ---- closed-job verdict + margin banding ---------------------------------
  // Productivity verdict on CLOSED trusted jobs: realized within ±10% of the
  // bid productivity reads "met" (estimating noise on a metric with real
  // job-to-job spread), beyond that "beat"/"missed". Derived in code, never
  // stored — a corrected timesheet or invoice re-derives it automatically.
  VERDICT_BAND: 0.1,
  // Margin floor: a finished job whose achieved margin lands below this is a
  // problem regardless of productivity. Money leads; productivity explains.
  MARGIN_FLOOR: 0.12,
  // Achieved margin within this many points of the bid margin reads "on plan"
  // — a job that bid 30% and landed 29% is fine, not a red flag.
  MARGIN_NEUTRAL_PTS: 2,
};

// ---------------------------------------------------------------------------
// weightSourceForProject(project, billingCtx) — pick the pounds source.
//   billingCtx (optional): { lines, events, billing } for this project.
// Returns { source: "billed"|"placed", lbs, lastBilledDate, billedLbs,
//           billedPct } — billedLbs/billedPct always computed when ctx exists
// (for the preview display), even when the source stays "placed".
// ---------------------------------------------------------------------------
export function weightSourceForProject(p, ctx) {
  // Central resolver (data.js) already decided: billed lbs the moment a job has
  // OS billing, hand-entered placed-to-date only when it doesn't. This just
  // reads those fields — no zone recomputes the decision. (ctx retained for
  // callers that still pass it; it's no longer consulted.)
  const placed = typeof p.placedLbs === "number" && p.placedLbs > 0 ? p.placedLbs : null;
  const billedLbs = typeof p.billedLbs === "number" && p.billedLbs > 0 ? p.billedLbs : null;

  if (p.installedSource === "billed" && billedLbs) {
    return { source: "billed", lbs: billedLbs, lastBilledDate: p.lastBilledDate || null, billedLbs, billedPct: p.billedPctLbs ?? null };
  }
  return { source: "placed", lbs: typeof p.installedLbs === "number" ? p.installedLbs : placed, lastBilledDate: p.lastBilledDate || null, billedLbs, billedPct: p.billedPctLbs ?? null };
}

// ---------------------------------------------------------------------------
// paceForProject(p) — THE live lbs/MH for a job, shared by every zone (Active
// Work and Performance read this same function, so they cannot disagree).
//   • no billing            → installed (placed-to-date) ÷ ALL hours
//   • billed, <85% by lbs   → MATCHED: billed lbs ÷ hours through last invoice
//                             (timesheet-era only — payroll/combined hours carry
//                             no dates to bound, so they use all hours)
//   • billed, ≥85% or done  → TOTAL: billed lbs ÷ ALL hours (punchlist hours
//                             after the last invoice must count)
// Returns { lbsPerMH, source: "matched"|"total"|"placed", throughDate } | null.
// ---------------------------------------------------------------------------
export function paceForProject(p, { done = false } = {}) {
  const hours = typeof p.hours?.hours === "number" && p.hours.hours > 0 ? p.hours.hours : null;
  const installed = typeof p.installedLbs === "number" && p.installedLbs > 0 ? p.installedLbs : null;
  if (!installed || !hours) return null;

  if (p.installedSource !== "billed") {
    return { lbsPerMH: installed / hours, source: "placed", throughDate: null };
  }

  const nearComplete = done || (typeof p.billedPctLbs === "number" && p.billedPctLbs >= PERF.MATCHED_MAX_BILLED_PCT);
  if (!nearComplete && p.lastBilledDate && p.hours?.era === "timesheet") {
    const hrsThrough = hoursThroughDate(p.timecards, p.lastBilledDate);
    if (hrsThrough && hrsThrough > 0) {
      const lbsPerMH = installed / hrsThrough;
      const hoursSince = Math.max(0, hours - hrsThrough);
      return {
        lbsPerMH, source: "matched", throughDate: p.lastBilledDate,
        hoursThrough: hrsThrough, billedLbs: installed,
        hoursSince,
        unbilledEstLbs: hoursSince > 0 ? Math.round(hoursSince * lbsPerMH) : 0,
      };
    }
  }
  return { lbsPerMH: installed / hours, source: "total", throughDate: null };
}

// Hours counted only through a cutoff date (matched productivity: the billed
// weight is current AS OF the last invoice, so the hours must stop there too —
// top and bottom of the fraction cover the same window). Timesheet-era only;
// payroll-era manual hours carry no dates to bound.
export function hoursThroughDate(timecards, cutoffDate) {
  if (!cutoffDate || !timecards?.length) return null;
  let sum = 0, any = false;
  for (const c of timecards) {
    if (c.voided || c.underReview) continue;
    if (!c.date || c.date > cutoffDate) continue;
    sum += c.hours || 0;
    any = true;
  }
  return any ? sum : null;
}

// ---------------------------------------------------------------------------
// classifyJob(project) → one performance row, or null when the job simply has
// nothing to say yet (bidding/backlog, or complete with zero of anything —
// pre-timesheet-era rows that never carried data).
// ---------------------------------------------------------------------------
export function classifyJob(p, ctx) {
  const done = p.phase === PHASE.COMPLETE || p.phase === PHASE.BILLING;
  const running = p.phase === PHASE.RUNNING;
  if (!done && !running) return null;

  // "Closed" is the owner's signal that the placed weight is FINAL — stop
  // projecting to awarded scope and lock the economics to what actually happened.
  // A job still in BILLING may keep placing/billing, so it keeps projecting.
  const closed = p.phase === PHASE.COMPLETE;

  // ---- weight source: auto-flip to billed at ≥98% billed --------------------
  const ws = weightSourceForProject(p, ctx);
  const placed = ws.lbs;
  const hours = typeof p.hours?.hours === "number" && p.hours.hours > 0 ? p.hours.hours : null;

  // ---- pace: the shared resolver (same one Active Work reads) --------------
  // matched mid-job (<85% billed by lbs, dated hours), total at ≥85%/done,
  // placed-based only when the job has no billing at all.
  const pace = paceForProject(p, { done });
  const matched =
    pace?.source === "matched"
      ? { lbsPerMH: pace.lbsPerMH, hours: pace.hoursThrough, throughDate: pace.throughDate }
      : null;

  const allHoursRealized = placed && hours ? placed / hours : null;
  const realized = pace ? pace.lbsPerMH : allHoursRealized;

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
    hoursMode: p.hours?.mode ?? "auto",
    hoursOverridden: p.hours?.overridden ?? false,
    timesheetHours: p.hours?.timesheetHours ?? null,
    payrollHours: p.hours?.payrollHours ?? null,
    combineBaseline: p.combineBaseline ?? null,
    realized, // lbs/MH — matched when available, else all-hours
    // ---- weight source + the two productivity lenses ----
    weightSource: ws.source,               // "billed" | "placed"
    billedLbs: ws.billedLbs,               // preview even when source=placed
    billedPct: ws.billedPct,               // how fully billed (0..1+)
    lastBilledDate: ws.lastBilledDate,
    matched,                                // { lbsPerMH, hours, throughDate } | null
    allHoursRealized,                       // lbs ÷ ALL hours (the quieter number)
    // billing pace: matched vs all-hours far apart = billing lags the field
    billingLags:
      matched != null && allHoursRealized != null && allHoursRealized > 0
        ? matched.lbsPerMH / allHoursRealized - 1 > 0.1
        : false,
    bidProductivity: p.bid?.productivity ?? null,
    baseWage: p.bid?.baseWage ?? null,
    hasBid: !!p.bid,
    foreman: p.foreman || [],
    // ---- popup enrichment (Project Performance modal reads the row) --------
    burn: computeBurn(p), // hoursPct, placedFraction, forecastPct, severity
    contractValue: p.bid?.contractValue ?? null,
    operatingProfit: p.bid?.operatingProfit ?? null,
    operatingMargin: p.bid?.operatingMargin ?? null,
    projectedHours: p.bid?.projectedHours ?? null,
    // Once closed, the placed weight is final — there's no runway (nothing left
    // to place). Only a still-open job has "steel left ÷ pace = hours to go".
    remainingLbs:
      closed
        ? null
        : typeof p.awardedLbs === "number"
        ? Math.max(p.awardedLbs - (placed || 0), 0)
        : null,
    closed,
    // No OS invoices on this job — placed weight was hand-entered, so realized
    // revenue is derived from placed × bid rate rather than actual invoices.
    noOsBilling: p.installedSource !== "billed",
  };

  // status indicator for the popup header — the prior-chat view's four states:
  // missing (can't judge) / below target / watch / on target. Burn severity is
  // the base; needs-review overrides to missing.
  base.indicator =
    base.burn.severity === "no-bid" || base.burn.pendingCorrection
      ? "missing"
      : base.burn.severity === "danger"
      ? "below-target"
      : base.burn.severity === "warn"
      ? "watch"
      : base.burn.severity === "mobilizing"
      ? "mobilizing"
      : "on-target";

  // ---- profit / margin sensitivity at today's (or final) pace -------------
  // Recompute operating profit + margin as if the current pace holds to the end:
  // labor cost moves with the hours the job will take at this pace vs the hours
  // the bid budgeted. Gated by readablePace so early-job noise (the 446 artifact)
  // never drives a money verdict.
  const readablePace =
    typeof base.realized === "number" && base.realized > 0 &&
    (!running ||
      (typeof p.placedFraction === "number" && p.placedFraction >= PERF.MIN_PLACED_TO_PROJECT));
  base.readablePace = readablePace;
  base.sensitivity = computeSensitivity(base, readablePace);

  // On a CLOSED job the placed weight is final, so we don't project to awarded
  // scope — we compute the economics that actually happened: revenue = placed ×
  // bid rate, cost adjusted for actual labor vs. what the bid budgeted for those
  // placed pounds. This is what replaces the (awarded-scope) projection in the UI.
  base.realizedEcon = closed ? realizedEconomics(base) : null;

  // ---- running: projection, never a verdict --------------------------------
  if (running) {
    // Pace comes from the shared resolver. Billed-driven pace (matched or
    // total) is evidence-backed and shows immediately; placed-based pace still
    // waits for ~10% placed so early-job noise never reads as a trend.
    const placedPaceOk =
      typeof p.placedFraction === "number" && p.placedFraction >= PERF.MIN_PLACED_TO_PROJECT;
    const paceLbsPerMH = pace ? (pace.source === "placed" && !placedPaceOk ? null : pace.lbsPerMH) : null;
    return {
      ...base,
      state: "in-progress",
      projectable: paceLbsPerMH != null,
      paceLbsPerMH,
      paceSource: paceLbsPerMH == null ? null : pace.source === "placed" ? "placed" : "billed",
      isMobilizing: !!p.isMobilizing,
      ...varianceBits({ ...base, realized: paceLbsPerMH }),
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
    return { ...base, indicator: "missing", state: "needs-review", problems, ...varianceBits(base) };
  }

  const trustedRow = { ...base, state: "trusted", ...varianceBits(base) };
  return { ...trustedRow, ...closedSignals(trustedRow) };
}

// ---------------------------------------------------------------------------
// closedSignals(row) — the two derived reads a FINISHED trusted job gets:
//   • verdict       — beat / met / missed the productivity estimate (±VERDICT_BAND
//                     vs the bid lbs/MH). The crew answer.
//   • marginState   — achieved margin vs the MARGIN_FLOOR and vs the bid margin:
//                     below-floor (< 12%, the hard red signal, always leads) /
//                     eroded (above floor but > 2 pts under the bid) /
//                     on-plan (within ±2 pts of bid) / above-plan. The money answer.
// Only trusted rows get these — needs-review numbers contradict each other, and
// a verdict off bad data is a lie. Everything derives from figures the row
// already carries (sensitivity.projMargin at the realized pace IS the achieved
// margin on a done job), nothing is stored in Notion, and it all survives the
// Postgres swap untouched.
// ---------------------------------------------------------------------------
function closedSignals(row) {
  const verdict =
    typeof row.variancePct !== "number"
      ? null
      : row.variancePct > PERF.VERDICT_BAND
      ? "beat"
      : row.variancePct < -PERF.VERDICT_BAND
      ? "missed"
      : "met";

  const s = row.sensitivity;
  const econ = row.realizedEcon;
  // A closed job's achieved margin is the REALIZED one (placed scope, actual
  // labor). Fall back to the pace-projection only for the rare closed job with
  // no realized economics (missing bid figures).
  const achievedMargin = econ && typeof econ.realizedMargin === "number"
    ? econ.realizedMargin
    : (s && typeof s.projMargin === "number" ? s.projMargin : null);
  const bidMargin = econ && typeof econ.bidMargin === "number"
    ? econ.bidMargin
    : (s && typeof s.bidMargin === "number" ? s.bidMargin : null);

  let marginState = null;
  if (achievedMargin != null) {
    if (achievedMargin < PERF.MARGIN_FLOOR) {
      marginState = "below-floor";
    } else if (bidMargin != null) {
      const deltaPts = (achievedMargin - bidMargin) * 100;
      marginState =
        deltaPts < -PERF.MARGIN_NEUTRAL_PTS ? "eroded" : deltaPts > PERF.MARGIN_NEUTRAL_PTS ? "above-plan" : "on-plan";
    } else {
      marginState = "on-plan"; // clears the floor; no bid margin to compare against
    }
  }

  return { verdict, achievedMargin, bidMargin, marginState };
}

// realizedEconomics(row) — the ACTUAL result of a closed job, at the scope that
// actually happened (placed pounds), not the awarded scope.
//
//   revenue   = placed × bid $/lb rate  (= contractValue × placed/awarded, since
//               you're paid by placed weight at the bid rate)
//   profit    = the bid's profit for the portion done, adjusted for how actual
//               labor compared to what the bid budgeted for those placed pounds.
//               Labor is the tracked variable; material/contingency ride inside
//               the bid economics (baked into the price, per the owner's model).
//   margin    = profit ÷ revenue  — comparable to the bid margin (scope cancels).
//
// This is what a job-cost-to-actual gives you: measured on what was placed and
// paid, not the estimate. Nothing stored; re-derives if hours/weight are fixed.
function realizedEconomics(row) {
  const { contractValue, operatingProfit, operatingMargin, awardedLbs, placedLbs, bidProductivity, hours, baseWage } = row;
  if (
    typeof contractValue !== "number" || contractValue <= 0 ||
    typeof operatingProfit !== "number" ||
    typeof awardedLbs !== "number" || awardedLbs <= 0 ||
    typeof placedLbs !== "number" || placedLbs <= 0 ||
    typeof bidProductivity !== "number" || bidProductivity <= 0 ||
    typeof hours !== "number" || hours <= 0
  ) {
    return null;
  }
  const burdened = (typeof baseWage === "number" && baseWage > 0 ? baseWage : PERF.DEFAULT_BASE_WAGE) * (1 + PERF.BURDEN);
  const scopeFraction = placedLbs / awardedLbs;           // portion of awarded actually placed
  const rate = contractValue / awardedLbs;                // bid $/lb
  const revenue = placedLbs * rate;                       // = contractValue × scopeFraction
  const bidProfitAtScope = operatingProfit * scopeFraction;   // bid's expected profit for the placed portion
  const bidHoursForPlaced = placedLbs / bidProductivity;      // hours the bid budgeted for the placed pounds
  const laborDelta = (hours - bidHoursForPlaced) * burdened;  // + = more labor $ than bid; − = came in under
  const realizedProfit = bidProfitAtScope - laborDelta;
  const realizedMargin = revenue > 0 ? realizedProfit / revenue : null;
  const bidMargin = typeof operatingMargin === "number" ? operatingMargin : operatingProfit / contractValue;
  return {
    scopeFraction,
    rate,
    revenue,
    bidProfitAtScope,
    laborDelta,
    realizedProfit,
    realizedMargin,
    bidMargin,
    marginDeltaPts: realizedMargin != null ? (realizedMargin - bidMargin) * 100 : null,
    fullScope: Math.abs(scopeFraction - 1) < 0.005,
  };
}

// Operating profit + margin if the current pace holds. Bid profit/margin come
// from the bid economics; labor swings by the hours the job takes at `realized`
// vs the hours the bid budgeted (awarded lbs ÷ bid productivity).
function computeSensitivity(row, readablePace) {
  if (
    !readablePace ||
    typeof row.realized !== "number" || row.realized <= 0 ||
    typeof row.awardedLbs !== "number" || row.awardedLbs <= 0 ||
    typeof row.bidProductivity !== "number" || row.bidProductivity <= 0 ||
    typeof row.operatingProfit !== "number" ||
    typeof row.contractValue !== "number" || row.contractValue <= 0
  ) {
    return null;
  }
  const burdened = (typeof row.baseWage === "number" && row.baseWage > 0 ? row.baseWage : PERF.DEFAULT_BASE_WAGE) * (1 + PERF.BURDEN);
  const hoursAtPace = row.awardedLbs / row.realized;
  const hoursAtBid = row.awardedLbs / row.bidProductivity;
  const laborDelta = (hoursAtPace - hoursAtBid) * burdened; // + = costs more than bid
  const projProfit = row.operatingProfit - laborDelta;
  const bidMargin = typeof row.operatingMargin === "number" ? row.operatingMargin : row.operatingProfit / row.contractValue;
  const projMargin = projProfit / row.contractValue;
  return {
    pace: row.realized,
    bidProductivity: row.bidProductivity,
    bidProfit: row.operatingProfit,
    projProfit,
    profitDelta: projProfit - row.operatingProfit,
    bidMargin,
    projMargin,
    marginDeltaPts: (projMargin - bidMargin) * 100,
  };
}

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
// computePerformance(projects, billingByProject?) — the whole zone in one pass.
//   billingByProject: Map(projectId → { lines, events, billing }) — optional;
//   without it, everything runs on placed-to-date exactly as before.
// ---------------------------------------------------------------------------
export function computePerformance(projects, billingByProject = null) {
  const rows = projects
    .map((p) => classifyJob(p, billingByProject?.get(p.id) || null))
    .filter(Boolean);

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
