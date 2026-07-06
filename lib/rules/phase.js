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
