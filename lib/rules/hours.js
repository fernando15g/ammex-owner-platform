// =============================================================================
// HOURS RULES — build spec §5.2. The guards that keep burn numbers honest.
//
//  • Join timecards to projects on the "Project Helper" RELATION only.
//    Never the free-text "Job" field (foreman typos: "i10 kino" vs "i10kino").
//  • Actual hours count ONLY rows where Voided != true AND Under Review != true.
//    Voided rows stay in Notion for audit; under-review rows are held until
//    released (owner decision). Summing blindly over-counts.
//  • ERA DETECTION uses "any rows EVER" (voided included): a project whose only
//    timecard was just voided is still timesheet-era — it must NOT silently
//    fall back to old payroll hours. Payroll-era = zero rows ever → use the
//    manual "Labor Hours To-Date" number on the project.
//  • Never silently drop real hours: unassigned (no Project Helper yet) and
//    under-review hours are excluded from totals but SURFACED as their own
//    buckets so the owner can see work sitting outside the count.
//
// This is computed in code, never via a Notion rollup — rollups can't filter
// voided/under-review rows and would silently over-count.
// =============================================================================

import {
  getTitle,
  getText,
  getNumber,
  getDate,
  getCheckbox,
  getRelationIds,
  pageId,
} from "@/lib/notion/client";

export function mapTimecard(page) {
  const projectIds = getRelationIds(page, "Project Helper");
  return {
    id: pageId(page),
    worker: getTitle(page, "Worker"),
    date: getDate(page, "Date"),
    hours: getNumber(page, "Hours") || 0,
    jobText: getText(page, "Job"), // display only — NEVER a join key
    foreman: getText(page, "Foreman"),
    projectId: projectIds[0] || null,
    voided: getCheckbox(page, "Voided"),
    underReview: getCheckbox(page, "Under Review"),
  };
}

// A row that counts toward actual hours.
export function isCountable(card) {
  return !card.voided && !card.underReview;
}

// Summarize ALL timecards once; every consumer reads from this summary.
// Returns:
//   perProject: Map(projectId → { countedHours, rowsEver, countedRows,
//                                 underReviewHours, voidedHours })
//   unassigned: { hours, rows }          — real hours with no project set yet
//   underReviewTotal, voidedTotal        — global buckets
//   realizedHoursPerDay                  — avg counted hours per worker-day,
//                                          feeds the capacity engine (§5.5)
export function summarizeTimesheet(cards) {
  const perProject = new Map();
  const unassigned = { hours: 0, rows: 0 };
  let underReviewTotal = 0;
  let underReviewRows = 0; // authoritative "currently held" count (Under Review AND not voided)
  let voidedTotal = 0;
  let countedHoursAll = 0;
  let countedRowsAll = 0;

  // Live hold state comes from the timecard's own Under Review checkbox — NEVER
  // from the Rec Log (that's an audit history and can lag reality). Counted
  // across ALL timecards, assigned or not, since a held card is held either way.
  for (const c of cards) {
    if (!c.voided && c.underReview) underReviewRows += 1;
  }

  for (const c of cards) {
    if (!c.projectId) {
      // Sitting in the reconcile queue — real hours, not yet joined to a job.
      if (isCountable(c)) {
        unassigned.hours += c.hours;
        unassigned.rows += 1;
      }
      continue;
    }

    let p = perProject.get(c.projectId);
    if (!p) {
      p = { countedHours: 0, rowsEver: 0, countedRows: 0, underReviewHours: 0, voidedHours: 0 };
      perProject.set(c.projectId, p);
    }

    p.rowsEver += 1; // era detection input — voided rows count here on purpose

    if (c.voided) {
      p.voidedHours += c.hours;
      voidedTotal += c.hours;
    } else if (c.underReview) {
      p.underReviewHours += c.hours;
      underReviewTotal += c.hours;
    } else {
      p.countedHours += c.hours;
      p.countedRows += 1;
      countedHoursAll += c.hours;
      countedRowsAll += 1;
    }
  }

  // Realized hours/day: each row is one worker-day, so the average counted
  // hours per row IS the real average workday (~6h in practice, not a nominal 8).
  const realizedHoursPerDay = countedRowsAll > 0 ? countedHoursAll / countedRowsAll : null;

  return { perProject, unassigned, underReviewTotal, underReviewRows, voidedTotal, realizedHoursPerDay };
}

// Resolve one project's actual hours + which era it's in.
//   summaryEntry: the perProject entry (or undefined if no rows ever)
//   payrollHours: the manual "Labor Hours To-Date" field on the project
export function actualHoursForProject(summaryEntry, payrollHours, opts = {}) {
  // Back-compat: an old boolean third arg meant manualOverride.
  const { mode, baseline, manualOverride } = typeof opts === "boolean" ? { manualOverride: opts } : opts;
  const rowsEver = summaryEntry?.rowsEver || 0;
  const timesheetHours = summaryEntry?.countedHours ?? null;
  const payroll = typeof payrollHours === "number" ? payrollHours : null;
  const underReviewHours = summaryEntry?.underReviewHours || 0;
  const voidedHours = summaryEntry?.voidedHours || 0;
  const base = { pendingCorrection: false, underReviewHours, voidedHours, timesheetHours, payrollHours: payroll };

  // An explicit Hours Mode wins; otherwise the legacy "Manual Hours Override"
  // checkbox still means payroll. (Matched loosely so the exact Notion label —
  // "Auto", "Payroll", "Combined", or any casing — resolves correctly.)
  const ms = String(mode || "").toLowerCase();
  const resolved = ms.includes("payroll") ? "payroll"
    : ms.includes("combin") ? "combined"
    : ms.includes("auto") ? "auto"
    : (manualOverride ? "payroll" : "auto");

  // PAYROLL: use the payroll number as-is. Also the close-out "final" — set the
  // payroll field to accounting's number and this reports it verbatim.
  if (resolved === "payroll") {
    return { ...base, era: "payroll", hours: payroll || 0, overridden: true, mode: "payroll" };
  }

  // COMBINED: frozen payroll baseline + ONLY the timesheet hours logged after the
  // combine anchor (Combine Baseline, frozen when Combined was selected). Payroll
  // is never touched; the existing timesheet total is treated as already covered.
  if (resolved === "combined") {
    const anchor = typeof baseline === "number" ? baseline : 0;
    const since = Math.max(0, (timesheetHours || 0) - anchor);
    return { ...base, era: "combined", hours: (payroll || 0) + since, overridden: true, mode: "combined", combineBaseline: anchor, sinceHours: since };
  }

  // AUTO (default): timecards if any rows exist, else the payroll baseline.
  if (rowsEver > 0) {
    return { ...base, era: "timesheet", hours: summaryEntry.countedHours, pendingCorrection: summaryEntry.countedHours === 0, overridden: false, mode: "auto" };
  }
  return { ...base, era: "payroll", hours: payroll, overridden: false, mode: "auto" };
}
