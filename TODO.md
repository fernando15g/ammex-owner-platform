# Ammex OS — Build Backlog

Working list. Source of truth for *how things work* is the build spec; this is
*what's left to do*. Check items off as they ship; fold shipped notes into the
spec's build log.

---

## Shipped

- [x] **Mutation audit (8b)** — every save/edit refreshes its page data. Fixed
  BidDetail inline edit (now `router.refresh()`) + bid-sheet close-mode (reloads
  so a closed line reappears instead of vanishing).
- [x] **StagePath chevron outline** — two-layer clip so unselected segments read
  as the same chevron shape as the colored ones (outline now drawn on the
  diagonal edges).
- [x] **Active Work completion %** — placement completion (placed ÷ awarded
  weight) is now the primary, always-visible "Complete" column with a progress
  bar; the raw hours-consumed % column is gone (hours detail still lives in the
  job panel); Forecast kept.
- [x] **Placement freshness flag** — "not updated" flag on jobs whose placement
  was never logged, so a blank/stale Complete % can't read as real progress.
- [x] **Performance headline redesign** — visual layout in the app theme: hero
  readout + gap badge, an "i" toggle revealing a plain-language explanation of
  what it means and that it's dynamic, a bullet bar (bid marker + realized
  overshoot = cushion), labeled stat tiles (hrs saved/100k, $/100k, realized
  variance), and a per-job spread strip with its own explanation. Handles the
  crews-slower case (red shortfall) too.
- [x] **The Book** (`/book`) — WIP schedule of awarded work, split the way a
  bonding company reads it: **Backlog** (awarded, not started), **Active** (the
  live WIP, sortable with totals), and a collapsed **Closed** history. One row
  per job: contract, expected profit/margin, billed, remaining, outstanding.
  Four KPI tiles (whole live book), search, "i" tooltips, click-through to each
  job's billing page. Read-only; same billing engine as the Billing zone
  (`getBook()` in `lib/data.js`). Nav enabled.

---

## Next up

- [x] **Bids/Pipeline rework** — in-flight bids now grouped by stage, hottest on
  top (Live: Contingent then Negotiating · Submitted/Follow-Up newest-first ·
  in-the-works at the bottom). Killed the red Due column; the date shown is the
  submission date everywhere, neutral. `app/pipeline/PipelineClient.js`.

- [x] **Home dashboard** (`/home`) — front door. Five zone tiles (bids in
  flight, active work, to-collect, the Book, crew pace), each linking in, plus a
  prioritized "needs your attention" list: aging receivables, jobs over pace,
  cold bids (14d, with snooze/mark-lost right on the card), missing placement.
  Root `/` resumes your last zone within 6h, else lands on Home.
- [x] **Home v2 — command center** — alerts expand to their items; click an item
  for a modal that resolves it in place, no leaving Home. Actions: log a payment
  (overdue), snooze / mark lost (cold bids), enter placed pounds (missing
  placement), open bid sheet (no sheet); over-pace is view-only. Added a
  no-bid-sheet alert. Alerts are live signals — they clear when the real thing is
  resolved, never by a dismiss. New `Last Follow-Up` date property on the Bid
  Tracker drives cold-bid snooze; `placedLbs` now project-editable for inline
  placement entry.

---

## Optional refinements

- [ ] **Billing draft auto-save** — while entering billing numbers, keep a local
  draft so a refresh/nav-away doesn't lose input; on return, offer to restore the
  unsaved entry. Billing-zone improvement, unrelated to Home.

- [ ] **Performance "cushion" weighting** (`lib/rules/performance.js`) — realized
  is pounds-weighted but `bidAssumed` is a plain average of ratios; consistent
  weighting would tighten the gap when job sizes vary. Low priority; current
  behavior looks intentional.
- [ ] **Placement staleness threshold** — Active Work now flags *blank* placement;
  decide what date age counts as "stale" if we want to flag old-but-present
  placement too.
- [ ] **Migration note** — before the Postgres move, snapshot the legacy Notion
  formula columns the money layer falls back to (`Estimated Contract Value`,
  `Operating Profit (pre-tax)`) for incomplete/historical rows, or those
  fallbacks go blank. Performance + confidence are already pure-code and safe.

---

## Resolved / struck

- ~~Confidence % reconciliation~~ — not needed. Code computes confidence itself
  (Reviewing 10 / Estimating 20 / Contingent 40 / Submitted 50 / Follow Up 55 /
  Negotiating 75) and deliberately ignores Notion's formula (won't survive the
  Postgres migration). Already correct by design.
- ~~Dark-mode theming~~ — already shipped (light + dark both live).
