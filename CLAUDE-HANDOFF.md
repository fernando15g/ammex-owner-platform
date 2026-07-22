# CLAUDE-HANDOFF — where we left off

**Read this first, then the build spec, then the code.** This is the running state
of Ammex OS so a fresh session (or a fresh Claude) can pick up without the chat
history. It's maintained by hand at ship time — treat the **git repo as the source
of truth** if this file and the code ever disagree.

_Last updated against commit: `65e93d0` (Realized economics for closed jobs) — this
build adds the items marked ✅ below._

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
