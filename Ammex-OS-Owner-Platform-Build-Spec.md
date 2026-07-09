
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
