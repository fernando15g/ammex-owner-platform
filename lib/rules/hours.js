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
export function actualHoursForProject(summaryEntry, payrollHours, manualOverride = false) {
  const rowsEver = summaryEntry?.rowsEver || 0;
  const timesheetHours = summaryEntry?.countedHours ?? null;
  const payroll = typeof payrollHours === "number" ? payrollHours : null;

  // Manual override (historical jobs): the owner has said "trust the payroll
  // number on this job" — pre-timesheet hours live in Labor Hours To-Date, and
  // a few stray timecards shouldn't flip the whole job to an undercounted
  // timesheet total. Only honored when a payroll number actually exists.
  if (manualOverride && payroll != null && payroll > 0) {
    return {
      era: "payroll",
      hours: payroll,
      pendingCorrection: false,
      underReviewHours: summaryEntry?.underReviewHours || 0,
      voidedHours: summaryEntry?.voidedHours || 0,
      overridden: true,
      timesheetHours,   // what timecards say (for the popup's "these differ" line)
      payrollHours: payroll,
    };
  }

  if (rowsEver > 0) {
    // Timesheet-era. Even if every row is currently voided, we do NOT fall
    // back to payroll — we report zero valid hours, pending correction.
    return {
      era: "timesheet",
      hours: summaryEntry.countedHours,
      pendingCorrection: summaryEntry.countedHours === 0,
      underReviewHours: summaryEntry.underReviewHours,
      voidedHours: summaryEntry.voidedHours,
      overridden: false,
      timesheetHours,
      payrollHours: payroll,   // surfaced so the popup can offer "use payroll" when they differ
    };
  }

  return {
    era: "payroll",
    hours: payroll,
    pendingCorrection: false,
    underReviewHours: 0,
    voidedHours: 0,
    overridden: false,
    timesheetHours: null,
    payrollHours: payroll,
  };
}
