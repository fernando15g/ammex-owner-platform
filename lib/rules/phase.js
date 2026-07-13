// =============================================================================
// JOB PHASE — build spec §5.4. "Project Status" on Projects is the SOURCE OF
// TRUTH for what phase a job is in. Every metric keys off this mapping instead
// of inferring phase from dates or guesswork.
// =============================================================================

export const PHASE = {
  BIDDING: "bidding",
  BACKLOG: "backlog",     // awarded but not running yet
  RUNNING: "running",     // crews on it now
  BILLING: "billing",     // work done, money not
  COMPLETE: "complete",
  UNKNOWN: "unknown",
};

const STATUS_TO_PHASE = {
  "Bidding": PHASE.BIDDING,
  "Awarded": PHASE.BACKLOG,
  // Mobilizing counts as RUNNING: staging/prep hours already burn against the
  // job and count toward LBS/MH, so the job is consuming crew capacity. (§5.4)
  "Mobilizing": PHASE.RUNNING,
  "Active": PHASE.RUNNING,
  "Punchlist": PHASE.RUNNING,
  "Waiting on billing": PHASE.BILLING,
  "Closed": PHASE.COMPLETE,
  "Paid": PHASE.COMPLETE,
};

// Distinguishes mobilizing (running, but staging — expect low placed %) from
// jobs actively placing, so the UI can label it and not false-alarm on burn.
export function isMobilizing(projectStatus) {
  return projectStatus === "Mobilizing";
}

export function phaseOf(projectStatus) {
  return STATUS_TO_PHASE[projectStatus] || PHASE.UNKNOWN;
}

// -----------------------------------------------------------------------------
// STATUS FROM EVIDENCE — don't rely on someone remembering to flip a dropdown.
//
// A job in "Awarded" that crews are actually working is a lie the system is
// telling itself, and nobody notices until a report looks wrong. So instead of
// trusting discipline, read the facts:
//
//   - Timesheet hours charged to the project  -> work has begun. Nobody logs
//     hours against a job that hasn't started.
//   - An invoice exists                        -> work has begun. You can't bill
//     work that hasn't been performed.
//
// Both are facts about the world, not intentions. The same instinct as
// auto-awarding a bid when a project is created from it.
//
// This only ever moves a project FORWARD out of Awarded. It will not touch a job
// someone has deliberately parked, and it never moves anything backwards.
// -----------------------------------------------------------------------------
export function inferredStatus(project, { payrollHours = 0, invoiceCount = 0 } = {}) {
  if (project.status !== "Awarded") return null;      // only rescues the backlog

  const working = payrollHours > 0;
  const billing = invoiceCount > 0;
  if (!working && !billing) return null;

  return {
    status: "Active",
    because: working
      ? `${Math.round(payrollHours).toLocaleString()} hours charged to this job`
      : "an invoice has been issued",
  };
}

// A contradiction worth surfacing rather than silently correcting: the project
// says one thing, the evidence says another. Report it; let a human decide.
export function statusContradiction(project, { payrollHours = 0, invoiceCount = 0 } = {}) {
  if (project.status === "Awarded" && (payrollHours > 0 || invoiceCount > 0)) {
    return `Marked Awarded, but ${payrollHours > 0 ? `${Math.round(payrollHours).toLocaleString()} hours have been charged` : "an invoice has been issued"}.`;
  }
  if ((project.status === "Closed" || project.status === "Paid") && invoiceCount === 0) {
    return "Marked closed, but nothing was ever invoiced.";
  }
  return null;
}
