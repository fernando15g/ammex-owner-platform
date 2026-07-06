
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

---

## 15. Recalibration — Project-as-hub + entity spine (DONE, prep for Production/Financials)

Ammex OS = operational source of truth (NOT accounting — QuickBooks stays the accounting endpoint). Production-based: bid lbs, installed lbs, hours, lbs/MH, billed lbs, paid, remaining balance.

**Nine core entities:** Projects, Bids, Production Entries, Time Entries, Invoices, Payments, Employees/Crew, Customers/GCs/Fabricators, Documents.

**THE PROJECT IS THE HUB.** Every project now carries: `.bid`, `.timecards[]`, `.production[]`, `.invoices[]`, `.payments[]`, `.financials`. Every metric reads from the project.

**Four pounds figures, tracked DISTINCTLY (never collapsed):**
- installed = field placed it (Rebar Placed To-Date — live today)
- billable = approved to invoice (no field yet)
- billed = on an invoice (needs Invoices)
- paid = received (needs Payments)
`makeFinancials()` also derives remainingContractLbs, unbilledInstalledLbs ("pounds in the field not yet billed"), outstandingAR.

**Entity shapes defined now, empty until data exists** (lib/rules/entities.js): ProductionEntry, Invoice, Payment. Adding modules later = "fill the mapper," not "restructure."

**Production = separate admin-authored log** (not on timecards). Office admin reconciles fabricator shipments vs. field-reported installs, logs installed lbs. Joined to labor hours at project+date → actual lbs/MH computed in code. Natural home for the "webapp placement input" + "fab-email auto-extract" ideas.

**Build order (revised):** finish Owner Platform zones → Production capture module (the heartbeat; feeds everything) → Project Financials/Receivables (billing by installed/approved pounds) → Job Costing (actual profit; falls out once Production + Financials exist).

**Do NOT overbuild:** no payroll, HR, tax, GL, AP, or accounting replacement. Only Ammex-unique logic (rebar production, installed lbs, lbs/MH, bid-vs-actual, billing by pounds, receivables visibility, job profitability, capacity/runway, historical bid feedback).

---

## 16. Design north star — Procore philosophy, Ammex simplicity

Use **Procore as UI/UX inspiration, NOT its feature set.** Emulate the design philosophy; stay dramatically simpler.

**Borrow from Procore:** clean project-centric navigation, professional dashboards, logical information hierarchy, excellent spacing/readability, minimal clutter, clear status indicators (pills/chips), easy-to-scan project pages, financials presented clearly, modern enterprise-SaaS polish.

**Diverge deliberately (Ammex = ~20-person rebar sub, not a large GC):** far fewer nav items, no role sprawl, no module built just because Procore has one. Design test for every screen: *"If Procore were rebuilt for a rebar placement subcontractor with 20 employees, what would this screen look like?"*

**Governing rule:** every screen answers one question — *"What does the user need to know or do right now?"* Prioritize clarity over feature count. **If copying Procore conflicts with a faster/simpler Ammex workflow, always choose the simpler Ammex workflow.**

**Reconciles with mobile-first (§2):** phone decides WHAT earns space (priority); Procore-inspired styling decides HOW it looks with room (presentation); desktop + wallboard are where the polish shows most (wallboard = clean Procore-style command screen). No conflict.

Applies to the ZONE build (next session) — tonight was the invisible spine.

---

## 17. Surface priority FLIPPED — desktop-first (supersedes §2 mobile-first)

Design source of truth is now **DESKTOP**, not phone. Rationale: Procore (§16) is desktop-first enterprise UX; the owner's serious review happens at a desk; the office wallboard is desktop. Phone = quick "truck check," secondary.

**New order:** Desktop interactive (primary, full Procore polish — left sidebar nav, roomy project pages, financials in real tables, side-by-side panels) → Wallboard (ambient office screen) → iPad (desktop-lite) → Phone (deliberate CONDENSED quick-check, its own intentional layout, not a shrunk spreadsheet).

**Unchanged:** still one responsive codebase; still "what do I need right now" per screen; still prioritized — desktop just has room to answer more richly. Design desktop properly, then shrink gracefully to iPad/phone (each intentional, desktop leading).
