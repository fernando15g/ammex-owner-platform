// The Notion databases. IDs are stable identifiers, not secrets.
// When the backend migrates to Postgres, this file retires with client.js.
export const DB = {
  BID_TRACKER: "35a9aeba538380ae9815c580b99a14a7",
  PROJECTS: "35a9aeba5383801990dac4cb0de148e8",
  CREW_ROSTER: "35a9aeba5383806caf00f3635e89b12a",
  SCHEDULE: "38e9aeba5383807c8ff0e767ab894d17",
  TIMESHEET: "3879aeba5383807ca40af61a89f21a40",
  REC_LOG: "3919aeba538380cbab67c636dcdb5b32",
  BILLING_EVENTS: "3989aeba538380cd93d1e53d71c3c459",
  LINE_ITEMS: "3999aeba538380ae90b7f9f5da7365b9",
};

export const DB_LABELS = {
  BID_TRACKER: "Bid Tracker",
  PROJECTS: "Projects",
  CREW_ROSTER: "Crew Roster",
  SCHEDULE: "Schedule",
  TIMESHEET: "Timesheet",
  REC_LOG: "Reconciliation Log",
  BILLING_EVENTS: "Billing Events",
  LINE_ITEMS: "Line Items",
};
