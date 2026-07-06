
---

## 12. Live state vs. audit history (added post-launch check)

**Principle:** live/current state ALWAYS comes from the entity's own fields — the checkbox or value on the Timecard, Bid Tracker row, Project, etc. The **Reconciliation Log is an event/audit history** ("what happened over time": holds, no-shows, dismissals) and its `Status` can lag reality. Never read Rec Log `Status` to answer "what's true right now."

- **Currently-held timecards** = Timecards DB filter `Under Review = true AND Voided = false` (read the timecard's own checkbox). NOT Rec Log Status = "Under Review."
- Use the Rec Log only to **display history**, never to compute a live count.
- (This corrected the launch check page, where a Rec-Log-Status count showed 5 stale "Under Review" rows while the authoritative timecard state was 0 — a known upstream bug where releasing a hold didn't write back to the Rec Log row.)

---

## 13. Capacity REPLACED by "Runway" model (supersedes §5.5)

The §5.5 reservoir (single "headroom in tons" over a fixed 13-week horizon) is REPLACED. In practice it read badly oversold (−2,818 tons committed) while the owner felt there was room to take work. Root cause: it crammed ALL committed work (running + full backlog) into one fixed window and compared to crew-hours in that same window — but backlog START TIMING is genuinely fluid/unknowable (crews flow running→running smoothly, but new/awarded work starts unpredictably and crews sometimes sit idle between jobs). A single number that pretends to know backlog timing is dishonest.

**New model — show the honest pieces, let the owner's judgment supply the timing the data can't.**

Two quantities, shown SEPARATELY (never combined into one number):

1. **Running work in front of crews** (solid — no timing guesswork):
   - LBS = Σ remaining LBS on RUNNING projects (awarded LBS − placed LBS, guarded ≥ 0)
   - Weeks = that LBS ÷ crew placement rate (LBS/week, from history — see below)
   - Reads: "~340k LBS running · ~6 weeks in front of crews"

2. **Backlog waiting** (real, committed, timing-fluid):
   - LBS = Σ awarded-not-started LBS (phase = backlog: Awarded + Mobilizing)
   - Weeks = same rate, LABELED "whenever it starts"
   - Reads: "~1.2M LBS awarded queued · ~20 more weeks, start dates TBD"

3. **Bid signal** (informs the gut, does NOT override it):
   - Compare RUNNING weeks (the solid number) to a comfort line (owner's threshold).
   - Below line → "bid aggressive, keep crews fed"; above → "full, hold / bid selective."
   - Backlog shown as context, not folded into the trigger.

**Crew placement rate (LBS/week)** — derive from timesheet history, not a guess:
   realized LBS/week ≈ (placed LBS across timesheet-era jobs) ÷ (weeks those hours span)
   OR blended realized productivity (LBS/MH) × realized hours/day × field headcount × days/week.
   Pick whichever is more stable on real data; expose an override.

**Comfort line** = owner's "weeks of running work booked = comfortably full" threshold. NOT set yet — calibrate against the real running-weeks number once it's on screen (owner will know it by feel when they see the true figure). Only affects the signal's wording, not the two quantities.

**Why this is honest:** no start dates needed (throughput replaces calendar), no fixed-horizon guess (weeks-booked IS the horizon), outputs exactly what the owner asked for — "LBS I can still take" + a bid-aggressive/hold call — and stops the dashboard pretending to know backlog timing.

---

## 14. Open calibration items (next session)

1. **Confidence % alignment.** Live check: in-flight contract value MATCHES Notion ($6.41M ≈ $6.4M) — scope/read logic confirmed correct. But weighted differs (code $3.20M vs Notion $2.68M) → the six confidence percentages in code (§6) are more generous than Notion's formula. Reconcile: confirm the owner's TRUE per-status confidence (owner's dial, not necessarily Notion's) and update CONFIDENCE_BY_STATUS. Owner's stated set was Reviewing 10 / Estimating 20 / Contingent 40 / Submitted 50 / Follow Up 55 / Negotiating 75 — verify against Notion's actual formula, then pick the trusted set.
2. **Pipeline scope confirmed:** in-flight only (exclude Awarded/Lost/No Bid) is correct — awarded work is counted in The Book / Active Work, not pipeline, to avoid double-counting. (Owner OK with this; revisit only if a combined "total exposure" view is wanted.)
3. **Placement freshness (§5.3):** running-work LBS depends on Rebar Placed To-Date being current; stale/blank placed → inflated remaining. Surface the as-of stamp; blank placed on an active job counts full tonnage as remaining (flag it).
4. **Build Runway model (§13)** — this is the priority build next session; validate the two quantities against real data before wiring the signal.
