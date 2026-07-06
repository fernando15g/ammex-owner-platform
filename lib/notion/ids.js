// =============================================================================
// The six Notion databases (build spec §3). IDs are stable identifiers, not
// secrets — the NOTION_TOKEN is what grants access, and that lives in .env.local.
// When the backend migrates to Postgres, this file retires with client.js.
// =============================================================================
export const DB = {
  BID_TRACKER: "35a9aeba538380ae9815c580b99a14a7",
  PROJECTS: "35a9aeba5383801990dac4cb0de148e8",
  CREW_ROSTER: "35a9aeba5383806caf00f3635e89b12a",
  SCHEDULE: "38e9aeba5383807c8ff0e767ab894d17",
  TIMESHEET: "3879aeba5383807ca40af61a89f21a40",
  REC_LOG: "3919aeba538380cbab67c636dcdb5b32",
};

export const DB_LABELS = {
  BID_TRACKER: "Bid Tracker",
  PROJECTS: "Projects",
  CREW_ROSTER: "Crew Roster",
  SCHEDULE: "Schedule",
  TIMESHEET: "Timesheet",
  REC_LOG: "Reconciliation Log",
};
