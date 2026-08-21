// =============================================================================
// SUBMITTED-BIDS ACTIVITY — how much did we put out the door this week / month.
// Counts every bid whose Submission Date falls in the window, regardless of
// later outcome (won, lost, still pending — activity is activity), and sums
// their contract values.
//
// Dates: submissionDate is a "YYYY-MM-DD" string. We compare STRINGS against
// Phoenix-local window boundaries — never new Date(submissionDate), which
// parses as UTC midnight and shifts a day in Phoenix (house gotcha).
// =============================================================================

// Today as YYYY-MM-DD in Phoenix, regardless of server timezone (Vercel = UTC).
export function phoenixToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
}

// Monday of the week containing todayStr (company week runs Mon–Fri, so
// "this week" starts Monday). Pure string/UTC math — no local-tz parsing.
export function mondayOf(todayStr) {
  const d = new Date(`${todayStr}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function monthStartOf(todayStr) {
  return `${todayStr.slice(0, 7)}-01`;
}

// -> { week: { count, value }, month: { count, value }, asOf }
export function submittedStats(bids, todayStr = phoenixToday()) {
  const weekStart = mondayOf(todayStr);
  const monthStart = monthStartOf(todayStr);
  const week = { count: 0, value: 0 };
  const month = { count: 0, value: 0 };
  for (const b of bids || []) {
    const d = b.submissionDate;
    if (!d || d > todayStr) continue; // no date, or future-dated typo
    const v = typeof b.contractValue === "number" ? b.contractValue : 0;
    if (d >= monthStart) { month.count++; month.value += v; }
    if (d >= weekStart) { week.count++; week.value += v; }
  }
  return { week, month, asOf: todayStr };
}
