# CLAUDE-HANDOFF — where we left off

**Read this first, then the build spec, then the code.** This is the running state
of Ammex OS so a fresh session (or a fresh Claude) can pick up without the chat
history. It's maintained by hand at ship time — treat the **git repo as the source
of truth** if this file and the code ever disagree.

_Last updated against commit: `7d7d6b6` (Fix filter panel overlap) + this build (Batch C: Combine Baseline removed, polish)._

---

## What this is
Ammex OS — a private owner platform for **Ammex**, an Arizona rebar-placement
subcontractor. Next.js 14 + React + Notion backend, deployed on Vercel. Single
owner/operator: **Fern**. Claude is the continuing lead engineer across sessions.
PIN gate `5314`. Live at the Vercel URL; a separate timecard app lives at
`ammex-timecard.vercel.app`.

## Operating contract (do not skip)
- **You are the continuing engineer on a production codebase, not starting fresh.**
- **Order of precedence:** (1) the GitHub repo, (2) documented decisions in chat,
  (3) existing behavior, (4) new requests.
- **Every build session: re-clone the repo fresh first and check `git log`.** Fern
  ships between sessions, so a stale clone will be behind and silently revert work.
  The repo is private; Fern flips it public briefly for each clone.
- **Never re-clone mid-session** — it blows away staged, unpushed work.
- Before changing anything: read the relevant code, confirm understanding briefly,
  change the smallest amount necessary, flag downstream effects. Concise — no reports.
- **Never** rebuild / duplicate / rename / reorganize / swap libraries / remove
  "unused" code without explicit approval. Assume every decision is intentional.
  Extend and integrate rather than replace.
- **Talk before code** on design decisions. Fern strongly prefers this.
- **Money-core changes get verified with a worked example before shipping** (we do
  this every time — see retention, short-pay, realized-economics history).
- **Ship format:** a FULL-repo zip (exclude `node_modules`, `.next`, `.git`) +
  a ≤49-char commit summary + a description. Fern swaps the folder, commits in
  GitHub Desktop, pushes; Vercel auto-deploys.
- Build check: `npm install --no-audit --no-fund && npm run build` → require
  "✓ Compiled successfully".

## Architecture (the important bits)
- **DAL seam (built for migration):** only `lib/notion/client.js` + `lib/notion/ids.js`
  touch Notion. Repositories speak domain-in / domain-out. "Postgres migration =
  a second file with the same functions." App-owned IDs (Line ID, Event ID) survive
  a DB swap.
- `lib/data.js` = the hub (`getEverything()` + per-zone `getX()` functions).
- `lib/rules/*` = stateless rule modules, each metric computed once (money, billing,
  invoicing, performance, burn, phase, hours, capacity, reconcile, lineItems...).
- Build spec = `Ammex-OS-Owner-Platform-Build-Spec.md` (source of truth).
  Backlog = `TODO.md`. Audit deliverable = `AUDIT-REPORT.md`.
- **Notion schema is verifiable live:**
  `https://ammex-timecard.vercel.app/api/notion-check?db=<DBID>&pin=5314`
  (returns every property name + a few sample rows — the fast way to catch a
  name mismatch, which is the usual cause of a `validation_error` 400).
- Projects DB id: `35a9aeba5383801990dac4cb0de148e8`. Billing Events DB:
  `3989aeba538380cd93d1e53d71c3c459`. (Full list in `lib/notion/ids.js`.)

## Key domain facts (so numbers are computed right)
- **Weight is in pounds.** Productivity = billed/placed LBS-unit quantity ÷ counted
  hours (lbs/MH). Hourly change-orders count dollars, never weight.
- **Ammex's economics:** revenue = the bid price; **labor (hours) is the only tracked
  variable cost.** Material/contingency are baked into the bid price (estimating
  inputs), not tracked as actuals. Bill by **placed weight × bid $/lb rate** — on an
  underrun you're paid for what you placed, not the full contract.
- **Retention** is withheld off each progress invoice (already counted as billed;
  GC pays net), then **billed + collected at closeout** via its own event types
  (`Retention Bill` / `Retention Payment`) that NEVER touch grossBilled /
  billedToDate / remainingToBill. Ledger: held / billed / received / due / to-bill.
  Per-invoice retention % is frozen at bill time (a reprint matches what was sent).
- **Short pay** is retention-aware: "short" = paid < gross − retention. Only the true
  shortfall beyond retention rolls forward, grossed up by the retention rate so the
  re-bill collects the right net. A short pay is a **re-bill, not an outstanding
  balance** — that's why Outstanding can read $0 after a short pay (by design).
  Logging a payment against an invoice auto-detects a short pay (no separate button
  needed). Retention/short-pay math verified in code.
- **Closed job = final scope.** On close, runway disappears and economics lock to
  actual placed weight (revenue = placed × bid rate, profit = bid profit for the
  placed portion adjusted for actual vs. budgeted labor). Margin % is scope-invariant
  (so it doesn't change); profit $ and runway do. `lib/rules/performance.js` →
  `realizedEconomics()` + `closed` flag; surfaced in `ProjectPerformanceModal.js`.

## Shipped so far (recent, in git)
- Invoice Excel generation + template upload (`118624a`)
- Settings-driven retention + "Download latest invoice" button (`d9f4f11`)
- Retention billing (own event types) + billing page cleanup + `.gitignore` (`8bbc0c9`)
- Due Billings report (full-ledger + open-items tabs) on `/billing` (`b030b6d`)
- Realized economics for closed jobs, runway suppressed (`65e93d0`)
- ✅ THIS build: Active Work stale-weight fix (#1) + "Go to bid" button (#5),
  Net 30 default invoice due date (#8), billing-overview Outstanding split (#9),
  collapsed **Closed** section in Active Work, and this handoff file.

## Backlog / open items (talk-first before building each)
Held at Fern's request (Fern is doing these first):
- **PT (post-tension) work** — weight-based (tons) at a higher $/rate; its own scope
  so it doesn't distort rebar productivity. Sequence: Fern builds it into the bid
  **calculator** first, then we integrate into the OS.
- **PT productivity baseline** — dig historical PT jobs (tons vs. hours) to set a
  real tons/MH figure to bid against. Data task first, then feeds the calculator.

Ready to build (need one quick decision each, noted):
- **#4 "+ Invoice" from the billing overview** with a project picker (route to a bid
  sheet if the project has none). Decision: picker shows all projects vs. billable-
  only with "needs bid sheet" flagged (lean: billable-first, missing-sheet marked).
- **#6 Bid sheet: bulk-set the Furn/Inst dropdown** across all lines. Decision:
  "Set all" button + default for new rows (recommended) vs. Excel drag-fill.
- **#7 Short-pay rollforward: line-item-aware resolver** (own focused build). When a
  short pay rolls forward, present the rollback to resolve: **Auto** (OS spreads rolled
  lbs across lines with room), **Manual** (per-line entry when the counterparty's
  breakdown is known), **Adjust later** (editable). Safeguards: never roll onto a
  fully-billed line; never exceed a line's remaining-to-bill; rolled lbs must sum to
  the shortfall (dollars ↔ weight stay reconciled with the counterparty); flag if
  auto can't place it all. **Editable until the rolled weight is re-billed, then
  locked** (confirmed).

Larger tracks:
- **Supabase auth + roles** — STARTED: free Supabase project created (region us-west-1,
  Data API ON / auto-expose OFF / auto-RLS ON, standard Postgres, no GitHub link).
  Next: Fern provides the project URL + API keys. Then wire the client, model
  users/roles/permissions, replace the PIN with per-person login, **enforce zones
  server-side** (not just hidden menus), build a System Check admin UI (create/edit
  profiles, grant/revoke zones, read-only vs. full control, add/remove roles), and
  attribution goes live (the app already stamps an actor). Roles to start: **Owner**
  (Fern, all zones) and **Admin** (Bids + Active Work + Billing, full control, Home
  reflecting only those). Auth is independent of the data migration — build it on the
  current Notion-backed app.
- **Notion → Postgres data migration** — later, repository by repository behind the
  DAL seam, starting with a low-stakes one (e.g. audit) to prove the swap. Let it earn
  its own green light (Notion rate limits actually hurting), not driven by auth.

Smaller / verification:
- Invoice **multi-page** polish — repeat header + column labels each printed page,
  live "Page X of Y", fit columns to width; ~20 line rows/page target.
- **Due Billings report** — review on real data; possible aging buckets.
- Optional **right-rail summary** on the billing detail page (dead-space idea; Fern
  leaned "leave as is").
- Older backlog in `TODO.md`: StagePath chevron polish, The Book + Home read-only
  zones, dark mode, performance headline redesign, pipeline/bids rework.

## Gotchas
- Notion property names are **case- and space-sensitive**; a mismatch throws
  `validation_error: "X is not a property that exists"`. (Recent example: the Projects
  DB had `Retention Enable` — missing the "d" — vs. code's `Retention Enabled`.)
- Notion auto-creates missing **select** options on write, so new event types
  (Retention Bill/Payment) don't need manual setup — but a rejected option fails loud.
- Reads don't 400 on a missing property (return blank); only writes do — so a config
  problem can be "silently off" until you try to write.

## Where we are (July 2026 — post specialty + Batch A/C)

**Everything below is shipped, pushed, and TESTED by Fern unless marked.**

### Specialty scope (PT + mesh) — COMPLETE, tested end-to-end
- Bids can carry **PT Building / PT Bridge / Mesh** priced LABOR-ONLY beside rebar.
  Math is a verbatim port of the calculator (`lib/rules/specialty.js` — re-copy from
  the calculator repo if its math ever changes; never reimplement).
- **Pricing UI on BOTH bid forms** (new-bid + detail): checkbox reveals type buttons;
  each line computes rev/cost/hours/margin live; recommended rate to hit target;
  "▲ no cost basis" when productivity is blank. Rollup + Rebar/Specialty/Combined
  split shown in Economics.
- **On save, specialty becomes billable line items** (`PT LBS` / `SF` / `HRS`) via
  `POST /api/bids/[id]/specialty` (archives + recreates that bid's specialty lines;
  rebar lines untouched). One source of truth: line items → (calc) columns → legacy
  `PT/Specialty Revenue` (history only, hidden in UI unless a legacy value exists).
- **Rows echo raw inputs** (lbs/rate/productivity...) so a reloaded bid seeds the
  editor populated — this was the root of a nasty bug (empty seed → $0 specialty →
  wrong contract value + a stale-vs-live −$13,000 display). One brain now: the
  read-only Specialty panel renders from the SAME live rollup the editor prices.
- **Protected everywhere:** weight test matches unit `LBS` exactly, so specialty
  adds revenue but zero pounds. Specialty hours are subtracted from lbs/MH
  denominators (pace, fleet blend, foreman scorecard, summary modal), added to hour
  budgets (burn), and split from rebar in realizedEconomics (rebar scales with
  placed lbs; specialty counts whole). Jobs without specialty are byte-identical.
- Defaults: PT Building 98 lb/MH, Mesh 1400 sqft/MH (real figures). PT ACTUAL hours
  per job = designed (option 1: one "PT Hours (actual)" field) but HELD, not built.

### Invoices — corruption root cause found and fixed
- **`invoiceBuffer()` in `lib/documents/invoice.js` is mandatory** for invoice
  downloads: ExcelJS + fitToPage writes `<pageSetUpPr>` BEFORE `<outlinePr>`,
  violating OOXML element order → Excel flags the file corrupt (recovery = blank).
  openpyxl/lxml tolerate it, so sandbox validation CANNOT catch this class of bug —
  proven by a 4-file feature ladder opened in Fern's Excel. The helper re-zips with
  the order fixed. Any NEW spreadsheet route: either avoid fitToPage entirely
  (bids export does) or run the same fix.
- Multi-page invoices: rows 1–11 repeat per page, fit-to-width, live "PAGE X OF Y"
  header. **Billing Job Reference** (Projects prop) prints as PROJECT NAME, frozen
  into each invoice snapshot (`ref` in `[snap]`), per-invoice override on the
  new-bill form; blank falls back to project name + ID.

### Billing / projects — shipped + tested
- Short-pay resolver: themed modal, Auto/Manual allocation, THREE interlocked
  columns (billed lbs / rollback lbs / $ — edit any, others follow), reconcile
  guard, "⋯ → Edit rollback" (locked once a newer invoice exists).
- Cascade delete: project → its billing events + line items (+ optional bid via
  checkbox), type-DELETE confirm; bid force-delete when blocked.
- Themed `confirmDialog` everywhere (no native prompts). Project edit modal:
  read-only until "Edit project"; Save/Cancel/Delete pinned in the frozen footer.
- `getProjectBilling` exposes bid / actualStartDate / resolved hours (project
  details modal shows bid rate, hours, started).

### Bids page — Batch A (shipped, tested; filter polish shipped)
- **Filters panel:** GC / Fabricator / Detailer dropdowns, City/County TYPE-IN
  (contains, case-insensitive), bid-due + submitted date ranges, value min/max,
  live "N of M shown", Clear. Stage chips show MATCH counts when filters active;
  empty state points to where matches live ("2 in Awarded" — tap to jump).
- **Export = exactly what's on screen, in order:** Excel (`/api/bids/export?ids=`,
  built from scratch, NO fitToPage → immune to the corruption bug) and Print/PDF
  (`/pipeline/print?ids=` — light print view, browser does the PDF; no PDF dep).
- **Detailer** = new Bid Tracker select (auto-creates options); on both forms,
  filter, exports.
- **Cold bids:** anchor falls back last-follow-up → submission → BID DUE DATE
  (most bids lack submission dates; Apr/May bids now flag at 69–98d). Future due
  dates can't trip it. Same anchor feeds the export's "days since contact".
- Foreman scorecard states its exclusions: "N shown · M excluded (reasons)",
  hover for per-job detail; empty state explains instead of looking broken.

### Hours model — DECIDED, minimal
- `Combine Baseline` is **REMOVED from the codebase** (was read-and-ignored; a trap).
  Fern can delete the Notion property whenever. Combined mode still = payroll +
  full timesheet (only correct if payroll is frozen pre-cutover).
- **Spanning jobs (started before 6/25/26 with timecards) are handled MANUALLY:**
  Fern sets Hours Mode = Payroll and keeps the payroll number current (accounting's
  total is complete/authoritative — Westwing: 729). "Payroll Hours As Of" date was
  designed but deliberately NOT built (transition problem; new jobs are pure
  timesheet/Auto). Don't resurrect it without asking.

## Gotchas that bit us (don't relearn these)
- Notion property NAMES must match exactly or writes 400 (`Retention Enable` ≠
  `Retention Enabled`; `Billing Job Reference` missing from `PROJECT_EDITABLE`
  blocked ALL project saves). Select/multi-select OPTION VALUES auto-create on
  write — but near-duplicate options accumulate silently (check dropdowns for typos).
- **Zod `z.object()` silently STRIPS unknown keys** — new bid fields must be added
  to `bidSchema.js` or saves quietly drop them.
- Client components: helpers defined inside hooks aren't in scope at render
  (`n()` crash class). Component-scope `num0()` exists in BidDetailClient.
- ExcelJS reads its own malformed output happily; so does openpyxl. For anything
  Excel-bound, the only real oracle is Excel — ship a test file to Fern if unsure.
- `PROJECT_EDITABLE` (lib/rules/mutations.js) gates all project saves; bid schema
  gates bid saves. Check BOTH when adding fields.

## Open backlog (in Fern's priority order)
1. **Payment-row document download** — BLOCKED on format decision (receipt /
   remittance / plain export). Ask before building.
2. **Supabase auth + roles** — replaces PIN. Free project exists (us-west-1);
   needs Fern's URL + keys. Owner (Fern, everything) + Admin (Bids/Active
   Work/Billing). Server-side zone enforcement. Multi-session build.
3. **Due Billings report review** — Fern reads it against real data; expect tweaks.
4. HELD: PT actual hours (option 1 designed). HELD: mesh/PT productivity
   calibration vs real jobs. Older TODO.md: performance headline redesign, The
   Book + Home read-only zones, dark mode, StagePath chevron polish.

## Timecard app (context)
Separate repo/app at ammex-timecard.vercel.app — employee timesheets + admin
Review cockpit. The OS reads its Timecards + Crew Roster Notion DBs (read-only
from the OS side; field names there are LOAD-BEARING, never rename).
