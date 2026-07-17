
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

---

## 18. Session progress + new decisions (Active Work shipped)

**Shipped:** first real zone — Active Work (`/active`), Procore-style table + click-to-open detail panel, desktop-first, on live data. Left-nav AppShell. Root redirects to `/active`; system check moved to `/check`. Mobilizing reclassified as RUNNING (staging hours count toward the job; labeled so it doesn't false-alarm on burn).

**New decisions:**

1. **Light/dark theme toggle (next ship).** Light = DEFAULT (matches Procore, owner preference), dark as toggle, top-right, remembered between visits. Requires converting the hardcoded steel/graphite/concrete palette to theme variables so every current + future zone supports both modes. Do it now (early, cheap) so later zones inherit it free.

2. **OS becomes a system of record — bid WRITE layer.** Business driver: delegation + growth. Currently bids are recorded only by the owner via the separate calculator. Going forward, back-office staff (admin, future estimator) should input, track, and edit BIDS directly in the OS; owner just checks the calculator for the number. Current calculator workflow stays (owner prices → admin builds bid sheet → sends to fab/GC); we ADD in-OS bid input/edit on top. This is the Phase 1.5 write layer, now with a concrete reason. Fits the existing architecture (isolated data layer + Project-as-hub) — a write layer bolts on without re-architecting, and stays backend-agnostic through the Notion→Postgres migration.

**App map (for reference / onboarding the admin):**
- Pipeline = all in-flight BIDS (chasing, not yet won) — not built yet.
- Active Work = running PROJECTS (won, crews on it) — LIVE.
- The Book = money on AWARDED work (contract value, operating profit, margins) — not built yet.
- "See ALL projects" (not just running) = gap — add as a phase filter on Active Work or a dedicated Projects list.
- Admin's first IN-OS input = Production (installed lbs), later phase. Bid input = the new write layer above.

**Open (architect review requested by owner):** how to structure the bid write layer to stay backend-agnostic through migration; validation, edit-conflict/concurrency (multiple users), audit trail; whether OS bid input writes to the same Notion DB the calculator uses; sequencing (bids → projects → production → financials).

---

## 19. Bids WRITE LAYER built (pilot for all future writes)

Built per architect's write-layer contract. This is the reusable write infrastructure; later modules (project promotion, production, financials) inherit the pattern.

**Architecture (domain in / domain out, backend-agnostic):**
- `lib/rules/bidSchema.js` — shared Zod schema (single source of truth, form + write layer import it).
- `lib/rules/writePath.js` — the three things above the DAL: bid_number generation (YYYY-NNNN, resets yearly), version bump (optimistic concurrency), audit + void stamping, soft-duplicate guard. Both entry points (OS form + future calculator) MUST call these.
- `lib/notion/client.js` — added write methods (createPage/updatePage/getPage) + property formatters. The ONLY Notion-specific write code.
- `lib/notion/bidRepository.js` — DAL: createBid / updateBid / voidBid. Maps domain → Notion props. Postgres migration = second file, same 3 methods.
- `app/api/bids` (POST create), `app/api/bids/backfill` (one-time, PIN 5314, `?dry=1` to preview), `app/bids/new` (admin form).

**Six core fields (locked):** bid_number (YYYY-NNNN, immutable), final_bid_price (canonical price), origin (calculator|manual), version (int, optimistic concurrency — NOT Notion last_edited_time), audit set (created/modified by/at), void set (is_voided + at/by, never hard-delete).

**Metadata built:** projectName (title), gc, fabricator, projectType (multi-select), cityCounty, bidDueDate, status (Bid Status), finalBidPrice, notes, scope. Grow freely via the Zod schema.

**⚠️ TWO out-of-chat prerequisites before the form works (in TODO file):**
1. Add the 11 new core-field properties to the Bid Tracker in Notion (names must match `BID_PROPERTY_NAMES`).
2. Run the backfill (`POST /api/bids/backfill?pin=5314`, preview with `&dry=1` first) to stamp the ~70 historical bids.
3. (Separate app) Update the calculator's save path to emit the six core fields via the shared contract — kills the logic fork.

**Sequencing locked (architect):** bids write (done) → bid→project promotion (parked awarded automation) → production input → financials. Simplest entity first = reusable write infra built once.

**Reported for Blueprint:** metadata inventory + Zod schema shape are in `lib/rules/bidSchema.js`.

---

## 20. Bid form made STANDALONE (Version B) + Pipeline list

**Decision:** OS bid form is FULLY functional — optionally price the bid in-OS (not just track metadata). Owner wanted the OPTION to enter numbers and get real money without touching the calculator.

**No logic fork:** the calculator's exact money engine was copied VERBATIM into `lib/rules/bidCostEngine.js` (`safeDiv`, `computeEstimate`, `applyBid`, `roundToQuarterCent` — byte-for-byte from the calculator's lib/calc.js, verified against a live sample: 234,213 lbs @ 160 → 34.13¢ raw → 34.25¢ rounded → 25.25% margin). `priceBid()` wraps the full flow (cost stack → round-to-quarter-cent → override → applyBid → PT/Specialty into contract) and outputs the 9 (calc) columns (percents as RATIOS). DO NOT refactor this math — keep it equivalent to the calculator.

**Form (`/bids/new`):** metadata always; a Pricing section (Estimated LBS, productivity, wage, crew, PT, final-bid override, + advanced assumptions) that's OPTIONAL. Enter LBS → live estimate panel (bid rate, contract, profit, margin, cost) computed client-side with the same engine; save writes raw inputs + (calc) columns. Leave blank → shell bid, price later. Uses existing Bid Tracker fields only — no new Notion properties.

**Pipeline zone (`/pipeline`):** in-flight bids list (Procore table), raw + weighted totals, due-date urgency coloring, sorted soonest-due. Nav tab now LIVE. "+ New Bid" button in header → the form.

**Calculator coordination:** still fine — both now use identical math. The out-of-chat calculator update is only needed IF governance fields (bid_number/version/audit) are added later; not now.

---

## 21. Direction settled: bid form = tracking; Billing tracker = the priority

**Bid form (Pipeline "+ New Bid") — REVERTED to simple tracking.** Removed the estimating engine / reverse-solve tangle. It now stores metadata + raw numbers + money figures (operating profit/margin/fully-loaded) that the user ENTERS (from the phone calculator) — the OS does NOT price or reverse-solve. Kept because owner may want desktop bid input later. A real in-OS estimator, if ever wanted, = a SEPARATE future tab, not this form.
- Margin entered as % in the form, stored as ratio in Notion.
- Uses existing Bid Tracker fields only.

**Billing / Due-Billing tracker = the most important part of the whole build (owner).** Next big build. Full design captured in the TODO file (#4). Key shape: bill by installed pounds (progress billing), admin enters dollars directly, track each bill/payment EVENT over time, per-project workspace that's the admin's ONE place to work (installed-pounds entry lives there too), unbilled-in-field is the star metric, plus aging/retention/outstanding. New billing store to be designed from scratch when built. This is the Project Financials / Receivables module from §15/§10 — finally the priority.

**Sequencing now:** Billing tracker is the next major module (ahead of the remaining read-only zones), because owner says it's the core need. Zones (Performance, The Book, Home) and light/dark theming remain queued.

---

## 22. Bid detail page — amend-in-place with live recompute (SHIPPED)

**The decision (owner's amendment scenario settled it):** a bid must be able to update its own economics when inputs change — the calculator creates a NEW bid on re-price (orphans), and a raw-field edit leaves money stale. So the OS bid detail recomputes.

**No-fork guarantee:** `lib/rules/bidCostEngine.js` recreated VERBATIM from the calculator (verified again: 234,213 lbs @160 → 34.1343¢ → 34.25¢ → 25.25%). The engine is the secret sauce — never refactor it. Division of labor: calculator = original pricing on the phone; OS detail = amendments on the existing record. If the pricing formula ever changes, update BOTH (on the TODO list).

**Built:**
- `/pipeline/[id]` — full-page bid detail (dev-correct: roomy for editing, clean URL that maps to Postgres later). Pipeline rows click through.
- View mode → Edit button → all fields editable (metadata + drivers + assumptions) → Save PATCHes the SAME bid.
- **Live economics panel**: change LBS/productivity/wage/rate/assumptions → contract value, operating profit/margin, fully-loaded, burdened labor recompute live via the shared engine. Bid rate field = the held/active rate (blank → recommended, quarter-cent-rounded). Save writes raw inputs + all 9 calc columns (incl. assumptions actually used).
- mapBid now also reads stored assumptions from the calc columns; blank assumptions fall back to CALC_DEFAULTS (mob 8, burden .20, tools .03, contingency .03, target margin .25, wage 32, productivity 140).
- This detail+edit pattern is the TEMPLATE the Billing workspace reuses.

**Deferred consciously:** version-based concurrency (team of 2, near-zero collision risk — revisit if estimators are added).

---

## 23. Billing / Due-Billing tracker — BUILT (the priority module)

The A/R module the owner said matters most. Grounded in the associate's real paper report (event log: bill date/amount, payment date/amount, total due) plus the upgrades a well-run sub needs.

**Data store (created in Notion):**
- Projects DB — 4 new fields: `Billing Contract Value` ($), `Retention Enabled` (checkbox), `Retention Percent` (number), `Retention Flat Amount` ($).
- New `Billing Events` DB (id `3989aeba538380cd93d1e53d71c3c459`): Event Name (title), Project (relation), Type (select: Bill/Payment/Change Order), Invoice Number, Amount ($), Retention Withheld ($), Date, Due Date, Pounds, Notes. Schema verified via inspector.

**ALL math in code** (`lib/rules/billing.js`) — never Notion formulas (migration-safe). Computes: revised contract (base + change orders), billed/paid to date, outstanding, remaining-to-bill, retention held (percent or flat, only when enabled), unbilled-in-field ($ = (installed − billed) lbs × contract rate), aging buckets (current/30/60/90+ via FIFO payment application to bills by due date), computed billing status. Verified against a hand-checked 6-event scenario (revised 540k, outstanding 140k, retention 33k, unbilled 44,100, aging correct).

**DAL:** `lib/notion/billingRepository.js` (read/create/update events, update project settings). **Data:** `getBillingOverview()` (portfolio A/R + per-project rows) and `getProjectBilling(id)`. **API:** POST/PATCH billing event, PATCH settings.

**UI:**
- `/billing` — A/R overview: portfolio stats (outstanding, overdue, remaining, retention), aging strip, per-project table (contract/billed/outstanding/unbilled-field/status), sorted overdue-first. Nav tab live.
- `/billing/[id]` — the admin's ONE workspace per project: full money picture, aging, collapsible Contract & retention settings (with "use bid" contract assist + ⓘ tooltips explaining retention % vs flat and the bid-vs-contract nuance), installed-pounds shown, and log Bill / Payment / Change Order events with an editable event history. Reuses the detail+edit pattern from the bid page.

**Interconnection:** all computed live from events at the Project hub on each load — log a payment → outstanding/aging update; update installed pounds → unbilled-in-field updates; add change order → revised contract/remaining update. Migration-safe (connections live in code, not Notion relations).

**Deferred (event model supports adding later):** short-pay reasons, lien waivers, pay-when-paid, billing-deadline reminders, cash forecast, retention release events.

---

## 24. Performance zone — BUILT (realized vs. bid productivity, trust states)

The strategic feedback loop (§ dashboard plan "Realized vs. bid productivity"): what crews ACTUALLY produce vs. what bids price. If crews really place at 100 when bids assume 140, every future bid is underwater — this is the number that eventually tunes the calculator.

**Trust states baked in from day one (owner: "data isn't 100% right now" — a confidently wrong number is worse than no number):**
- **Trusted** — completed (phase Billing/Complete), hours + tonnage hang together → ONLY these feed the averages and the $ sensitivity.
- **Needs review** — completed but contradictory (implied lbs/MH outside 40–500 sane band, hours missing, tonnage missing, all timecards voided, or < 8 hrs sample). Shown WITH the discrepancy spelled out (and which side looks wrong — "hours look too low for the tonnage (missing timecards?)"), excluded from every average until fixed. Fix the data → joins the averages automatically.
- **In progress** — running jobs get a pace PROJECTION (needs ≥10% placed, same gate as burn), labeled as such, never a verdict. Mobilizing labeled "staging — too early to read."
- Complete jobs with zero hours AND zero pounds = pre-data-era → off the page entirely. Bidding/backlog skipped.

**Engine (`lib/rules/performance.js`) — all in code, migration-safe:**
- realized lbs/MH = placed lbs ÷ counted hours (rides on hours.js guards: voided/under-review excluded, era detection; payroll-era hours used but labeled).
- Fleet blended realized = Σ placed ÷ Σ hours over trusted jobs (POUNDS-WEIGHTED, never an average of ratios).
- "Bids assume" = avg stored bid productivity across the same trusted jobs (fallback 140) — apples-to-apples.
- Gap → hours and burdened-$ per 100,000 lbs bid (burdened = avg base wage × 1.20, fallback $32).
- Per-job $ impact = (actual hours − placed÷bid-productivity) × burdened wage. Portfolio total shown.
- Tunable dials exported in `PERF` (sane band, min hours, min placed %, defaults).

**UI (`/performance`, nav flipped live):** headline strip (crews produce X vs bids assume Y, gap %, what it means per 100k lbs), trusted table (sortable, worst variance first, $ impact per job), amber needs-review list with per-job discrepancy text, in-progress pace list. Row click → ProjectDetailsModal. Verified against a hand-checked 9-job scenario (blend 145.45, gap −3.0%, +20.8 hrs/$800 per 100k, slip $1,783, 806-lbs/MH row flagged).

**Data:** `getPerformance()` in lib/data.js — rides on getEverything(), zero new Notion reads, no new DB fields.

**Visibility:** parked per owner — everyone with the password sees it; gate when a third person joins.

---

## 25. Line-item units + hourly change orders — BUILT (weight foundation)

Structured line items so billed weight is trustworthy and hourly COs are handled. Prep for billed-weight → productivity.

**Notion (Line Items DB) — added by owner:**
- **Unit** → Select (LBS, SF, LF, EA, LS). Was rich_text. Repo now reads via getSelect (text fallback for legacy) and writes as select.
- **Billing Basis** → Select (Quantity, Hours). Blank == Quantity (normal weight/price path).
- **Hours Worked** (number), **Rate** (number) — hourly-CO inputs.
- Line Type unchanged (Standard/CO/PA/SE/PC); codes still typed in Item No per owner's workflow.

**Engine (lib/rules/lineItems.js):**
- `extended()` / `billedToDate()` now honor Hours basis (hoursWorked × rate) vs Quantity (qty × price).
- `isWeightLine()` = LBS unit AND not hours-basis. `lineWeightLbs` / `lineWeightToDateLbs` / `estimatedWeight` / `billedWeightToDate` — pounds come ONLY from LBS quantity lines. SF/LF/EA/LS/HR contribute zero weight. This is the byproduct-of-billing installed-pounds number (feeds productivity later).

**UI:**
- **Change Order form** (ProjectBillingClient): "By quantity / By hours (T&M)" toggle. Hours path shows Hours Worked + Rate, writes billingBasis=Hours, unit=HR, counts toward contract $ but never weight. Quantity path adds a Unit dropdown.
- **Bid sheet** (BidSheetClient): Unit cell is now a dropdown (LBS/SF/LF/EA/LS), keyboard-nav preserved.

**Verified:** full production build passes; line-item math unit-tested (hours×rate, blank=Quantity, LBS-only weight — SF/HR/LS excluded).

**Parked:** codes-drive-math (SE credit? PA/PC weight?) — deferred, owner said fine for now. Unit dropdown not yet added to the weight-sheet paste grid (pasted rows still default LBS; matched item-numbers inherit the bid line's unit).

---

## 26. Billed weight → productivity (Part A: engine) — BUILT

Productivity's weight source now flips AUTOMATICALLY per job — no switch, no new Notion fields.

**The rule:** billed ≥98% of revised contract (PERF.FULLY_BILLED_PCT) AND billed LBS > 0 → weight source = billed LBS-line weight (Σ qtyToDate on LBS quantity lines; hourly COs and SF/LF/EA/LS carry zero weight). Below 98% → placed-to-date, exactly as before. Projects with no billing context are untouched.

**Matched productivity (the trusted live number):** on billed-source jobs with timesheet-era hours, realized = billed lbs ÷ hours THROUGH the last invoice date (top and bottom of the fraction cover the same window — Fern's cutoff choice). "All hrs" variant (÷ every hour logged) shown quieter; >10% gap sets billingLags ("hours running ahead of billed weight" — billing behind the field). Payroll-era hours carry no dates → no matched; realized = billed ÷ all hours.

**Engine:** performance.js — weightSourceForProject(), hoursThroughDate(), classifyJob(p, ctx), computePerformance(projects, billingByProject). getPerformance() in data.js builds the per-project billing context (events + projectLineItems + computeBilling). Zero behavior change for jobs without billing.

**UI (light touch — Part B does the full popup):** Realized cell shows matched bold, "all hrs" quieter, source tag (billed/placed); in-progress rows note billed weight + billing-lag; footnote explains the flip and the matching.

**Verified:** production build passes; 4-scenario math test exact (auto-flip at 98/100%, matched 250 vs all-hrs 200 with post-invoice hours excluded, HR-line weight exclusion, payroll fallback, half-billed stays placed).

**98% threshold shared:** same "fully billed" definition will drive the auto-close prompt later — one definition of done.

**Part B (next):** Project Performance popup (status indicator on target/watch/below target/missing, three signals, $ sensitivity line, trust state, billing pace, job runway, foreman, "Go to project"), fleet preview labeling, + queued billing UI fixes (Contract & retention header, contract value prominence, sq-ft calc → 2 inputs).

---

## 27. Project Performance popup + billing UI fixes (Part B) — BUILT

**Project Performance modal** (app/performance/ProjectPerformanceModal.js): clicking a row on /performance now opens PERFORMANCE, not project details (admin lives in Active Work / project page — button says "Go to project", not "Edit"). Reads straight off the row (no fetch, can't disagree with the table). Contents:
- Header indicator (prior-chat view's states): on target / watch / below target / missing weight-hours (+ mobilizing). Derived from burn severity; needs-review forces missing.
- The three signals side by side (only honest together): Hours % (actual/projected) · Placed % (lbs) · Productivity (bid → actual, matched-aware).
- The $ line: done jobs = settled costSlip; running jobs = PROJECTION (full-job hours at current pace vs bid hours, burdened) labeled "Projection, not a verdict." Margin shift shown when the bid carries economics (margin from → to).
- Context strip: Trust state (with reasons) · Weight source + % billed · Billing pace (lags flag) · Runway (remaining lbs ≈ man-hours at current pace) · Foreman.
- Rows enriched in performance.js: burn (computeBurn), indicator, contractValue/operatingProfit/operatingMargin/projectedHours, remainingLbs. Hours-composition deliberately excluded (owner's call).

**Billing UI fixes:**
- "Contract & retention settings" → "Contract & retention"; contract value on that line now prominent (base size, semibold) with the chevron-style hide/edit kept.
- Sq-ft calculator: Total sq ft auto-fills from the SF line's quantity; $/sqft auto-fills from the SF line's price, else DERIVED = contract ÷ total sqft. Owner typically types only Lbs completed.

**Verified:** build passes; indicator/burn/runway/projected-$ math test exact (below-target at forecast 1.25, projected +$4,800 on the hand-checked hot job).

---

## 28. Matched pace at all times + in-progress table + popup cleanup — BUILT

**Correction (owner caught it):** matched productivity was wrongly gated behind the 98% flip. Matched is honest at ANY billing level — billed lbs thru the last invoice ÷ hours thru that date is true "as of" that date at 30% billed or 100%. Now: matched computes and displays whenever billed LBS + an invoice date + dated (timesheet-era) hours exist. The 98% threshold governs ONLY (a) which weight source feeds a job's VERDICT realized + the fleet averages and (b) the future auto-close signal. Placed-to-date dies job-by-job as each finishes billing.

**Running jobs — pace is billing-driven:** paceLbsPerMH = matched whenever billing exists (paceSource "billed", shown with its thru-date); placed-based pace survives only on jobs with zero billing (paceSource "placed"). Variance/$ on running rows now computed off the pace number.

**In-progress section → real table** (matches trusted format): Project · Placed (lbs + % of awarded) · Hours (+ % of budget) · Pace (bold, thru-date, source tag) · Bid · Forecast (projected finish % of hour budget, colored ok/warn/danger, sorted worst-first). Mobilizing sinks to bottom; "too early/staging" rows stay in the table greyed. Row click → Project Performance popup.

**Popup cleanup:** four boxes (Hours · Placed · Productivity · Runway — remaining lbs ≈ MH at pace); trust shown ONLY when flagged (needs-review reason / billing-lag warning); weight source + matched thru-date + foreman collapsed to one quiet line; empty rows never shown.

**Verified:** build passes; math test exact (matched 222 thru 6/1 at 40% billed with post-invoice hours excluded; verdict source stays placed until 98%; no-billing job falls back to placed pace).

---

## 29. Profit/margin sensitivity + column tooltips — BUILT

**Popup profit/margin sensitivity (two cards):** recomputes operating profit + margin if the current pace holds. Labor cost swings by hours-at-pace (awarded ÷ realized) vs hours-at-bid (awarded ÷ bid productivity) × burdened wage; profit and margin move with it. Shown as two cards matching the stat-box language: big projected number leads, "was X · ▼ Δ" beneath in red (losing) / green (gaining), pace line above. Running jobs labeled "Projection if this pace holds — not a verdict." Replaces the old plain $ line. Gated by readablePace (>10% placed) so the early-job 446-artifact never drives a money number.

**Too-early gate on the popup:** Productivity and Runway boxes show "too early to read" below 10% placed instead of an inflated figure (matches the table's pace gate). Bug fixed: readablePace keyed off `running` (phase), not `base.state` which isn't set at that point.

**Column tooltips (ⓘ) on both Performance tables** — hoverable, click doesn't sort. Completed: Placed, Hours, Realized, Bid, Variance, $ impact. In-progress: Placed, Hours, Pace, Bid, Forecast. Forecast explained: "Projected total hours at the current pace vs. the hours the bid budgeted. Over 100% = trending over the hour budget." SortHeader gained an optional `info` prop (shared component — available to Bids/Active Work/Billing too).

**Verified:** build passes; sensitivity math exact (pace 170 vs bid 200 → profit 20k→16.6k, margin 20%→16.6%, −3.4 pts) and the too-early gate nulls sensitivity at 5% placed.

---

## 30. Payroll hours override (historical jobs) — BUILT

Transition-overlap fix: an old job whose real hours live in the manual Labor Hours To-Date field can get flipped to an UNDERCOUNTED timesheet total by a few stray timecards. Owner can now override per job — "trust the payroll number here" — and edit that number from the OS.

**Notion:** new `Manual Hours Override` (checkbox) on Projects. Read in mapProject; written via updateProject (repo maps it; PROJECT_EDITABLE + validateProjectEdit allow `manualHoursOverride` and `payrollHours`).

**Engine (hours.js):** actualHoursForProject(entry, payrollHours, manualOverride). Override honored ONLY when a payroll number > 0 exists (else ignored — a stray checkbox can't blank a job's hours). Returns era "payroll" + overridden:true, and always exposes timesheetHours + payrollHours so the UI can offer/compare. Everything downstream (productivity, burn, sensitivity) recomputes off the chosen hours automatically.

**Popup Hours box — self-hiding control (label "payroll", not "manual"):**
- Timesheet-era job with a DIFFERING payroll number → "timesheet — payroll shows N · Use" (one tap sets the override).
- On payroll → "payroll · Edit" (writes corrected hours to Labor Hours To-Date + keeps override on).
- No payroll number, or the two match → nothing renders. Once the payroll era ends the control retires itself entirely.
- One number shown at a time; the alternative offered only when they conflict.

**Verified:** build passes; 4-case hours test exact (timesheet keeps 40 while exposing payroll 400; override→400; override ignored when no payroll; no-timecards→payroll).

---

## 31. Payroll override control — gate fix + diagnostic

The §30 "Use/Edit" hours control wasn't appearing on Kino (timesheet-era job with a differing old payroll number). Root cause: the gate required timesheetHours to be a non-null number AND only offered the control when timesheet differed — it didn't handle payroll-era jobs (no Edit affordance) or all-voided/under-review timesheet jobs (ts null/0).

**Fix:** gate split into showUse (timesheet-era job whose payroll number differs — null/absent timesheet treated as 0) and showEdit (job already on payroll, via override OR natural payroll-era). Control hides only when there's genuinely no payroll number and not on payroll.

**Temporary diagnostic:** when the control is intentionally hidden, a tiny grey line shows `ts=… · pay=… · era=…` so the real values on a live job (Kino) can be confirmed, then removed next build.

**Verified:** build passes.

---

## 32. Payroll hours control — professional placement

Moved the Use/Edit payroll control out of the cramped Hours stat box into the popup FOOTER (bottom-left, actions Go-to-project/Close pushed right). Now a proper bordered button: "Use payroll hours" (timesheet job, payroll differs) or "Edit payroll hours" (already on payroll). Hover shows a tooltip with both numbers (Timesheet N · Payroll N) + what the action does, so the stat boxes stay clean. Edit opens an inline input in the footer. Temporary §31 diagnostic removed.

**Verified:** build passes; diagnostic gone, button + tooltip in footer.
