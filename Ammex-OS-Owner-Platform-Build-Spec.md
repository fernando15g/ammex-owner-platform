
---

## 12. Live state vs. audit history (added post-launch check)

**Principle:** live/current state ALWAYS comes from the entity's own fields — the checkbox or value on the Timecard, Bid Tracker row, Project, etc. The **Reconciliation Log is an event/audit history** ("what happened over time": holds, no-shows, dismissals) and its `Status` can lag reality. Never read Rec Log `Status` to answer "what's true right now."

- **Currently-held timecards** = Timecards DB filter `Under Review = true AND Voided = false` (read the timecard's own checkbox). NOT Rec Log Status = "Under Review."
- Use the Rec Log only to **display history**, never to compute a live count.
- (This corrected the launch check page, where a Rec-Log-Status count showed 5 stale "Under Review" rows while the authoritative timecard state was 0 — a known upstream bug where releasing a hold didn't write back to the Rec Log row.)
