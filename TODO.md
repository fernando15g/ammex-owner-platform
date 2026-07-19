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

- [x] **Stabilization audit batch** — PIN gate (middleware + /gate, env AMMEX_PIN,
  fallback 5314; APIs 401 when locked); Bids search across stage groups; card
  radius standardized app-wide; SCHEDULE annotated. Full deliverables in
  AUDIT-REPORT.md (readiness: Ready for Daily Operations, 88/100).


- [x] **Address autocomplete + Home polish** — (1) Photon (OSM) type-ahead on the
  project street field: pick a suggestion to fill street/city/state/ZIP + pin
  coords in one shot; free-typing still works (non-mandatory), pin-drop still the
  backstop. (2) Timesheet card: trims trailing empty days (no weekend bars),
  compacted, slimmer bars with hover-to-read hours. (3) Balanced analytics row
  (map 2 / timesheet 2 / work mix 1) so the map reads clearly again. (4) The map's
  "N need a location" flag is now clickable -> modal listing those jobs, each
  linking straight to its edit page.


- [x] **Home timesheet pulse + Active Work search** — Home's top analytics row is
  now map | "This week in the field" (middle, wide) | work mix. The timesheet card
  shows total hours (with ▲/▼ vs last week), crew on the clock, jobs worked, an
  hours-by-day strip, and flags for under-review + unassigned hours (counts only
  non-voided/non-under-review, same rules as the burn engine). Active Work gained
  a search box (name / project ID / GC / foreman). Map card restacked (counties
  below) to fit the narrower column.


- [x] **Manual pin-drop** — project form gained a collapsed "drop a pin on map"
  control (Leaflet + free OpenStreetMap tiles, lazy-loaded on open, no key). Click
  or drag to set exact coordinates; search a city/ZIP to zoom in. A hand-placed
  pin sets `Site Pin Manual` and is treated as truth — auto-geocoding skips it and
  an address change won't move it; "reset to address" hands control back to
  geocoding. Pairs with auto-geocode (Census→OSM) rather than replacing it.


- [x] **Home flagship analytics** — added the analytics canvas below tiles/alerts:
  Arizona county job-concentration map (pre-projected paths, no runtime map
  library), work-mix donut by project type, foreman scorecard (realized vs bid
  lbs/MH, colored by beating/on/behind, small samples flagged), and the book by
  stage (backlog/active/closed). Dependency-free (SVG/CSS charts).
- [x] **Map pins + site fields + Home polish** — projects now carry Site
  Street/City/State/Zip (+ Lat/Lng cache); the new-project form captures them
  (State defaults to AZ, sweet-spot fields softly encouraged, confirm-on-skip).
  A Census geocoder (no key, fails safe) resolves address → lat/lng, caches it to
  Notion, and drops a pin; county shading is the fallback. Map card gained a
  by-county list and a subtle "N need a location" note; Home is full-width; the
  foreman scorecard right side is aligned into fixed columns.
- [x] **Billing draft auto-save** — the invoice builder (CreateBillClient) now
  continuously stashes the grid + header to a LOCAL draft (localStorage, never
  the server) as you type; warns on hard exit (beforeunload) with unsaved input;
  offers a "restore / discard" bar on return; clears the moment the invoice
  saves. Never touches the books until saved.



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
