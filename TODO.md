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

- [x] **Unbilled-work readout + margin flag + contract-from-sheet** — (1) Contract
  pounds now resolve from the LIVE bill sheet (Σ LBS-line quantities) when a sheet
  exists, else the bid estimate — so adding a line item flows into Active Work's
  remaining-to-bill + placement %, matching the billing page (was frozen to the
  bid estimate). (2) Unbilled-work readout under Placement progress: "billed X as
  of DATE (Y hrs) · Z hrs since -> ~W lbs to bill (est. @ pace)"; the same estimate
  now IS Billing's "Unbilled in field" (the installed-minus-billed row went to
  zero once installed=billed, so it needed a real source). (3) Margin flag: "N%
  under bid pace - margin at risk" in the panel + a quiet amber dot on the job row,
  plus a "~X to bill" hint on rows with a growing unbilled estimate. Verified
  contract/billed/remaining math + pace 6/6. Files: lib/data.js,
  lib/rules/performance.js, app/active/ActiveWorkClient.js.


- [x] **Billed-lbs wired end to end (the interconnect)** — installed pounds now
  resolves ONCE in getEverything: billed LBS weight the moment a job has OS
  billing, hand-entered Rebar Placed To-Date only when it doesn't (legacy jobs
  unchanged, still editable). placedFraction/remaining/financials/burn all key
  off the resolved number, so Active Work, Performance, Home, and the Book read
  the identical figure by construction. Shared paceForProject (lbs/MH): placed ÷
  all hours (no billing) · MATCHED billed ÷ hours-thru-last-invoice (mid-job,
  timesheet-era) · TOTAL billed ÷ all hours (≥85% billed BY POUNDS or closed —
  fixes the punchlist-inflation bug; was 98%-by-dollars, never switched).
  Active panel: hero shows installed w/ "from billing" tag (edit still writes
  the manual field) + a Pace row (same resolver as Performance). Home
  missing-placement + foreman scorecard read resolved installed. getPerformance
  simplified (central resolution killed the duplicate billing loads). Verified
  6/6 scenarios. EXPECT: closed-history verdicts may shift (billed now leads);
  some needs-review jobs may move to trusted (matched-at-end fix).

- [ ] **Pace alert** (hours-vs-billed-lbs watchdog) — quiet, findable, not
  in-your-face; design to be talked through together before building.


- [x] **Combined hours fix** — Combined now = payroll + full timesheet (e.g. 64 +
  60 = 124), no baseline subtraction. The earlier baseline-freeze made it collapse
  to payroll right after combining (added-since-combine = 0), which read as "not
  saving." Payroll stays frozen during the job; close-out reconciliation is the
  Payroll-mode final number. Combine Baseline field now unused (left in Notion,
  harmless). Files: lib/rules/hours.js, app/components/HoursControl.js. Verified 4/4.

- [ ] **Avg + peak crew size** (FTE-based) on the job panel — replace/augment the
  "Timecards" row. avg crew = total man-hours ÷ days worked ÷ real-avg-workday
  (~6h, already measured); pair with peak crew. Skew-proof, tied to real labor.
  (Backlog — build when ready.)


- [x] **Active detail panel redesign + 4-stage chevron** — rebuilt the panel to
  the approved flagship layout: hero placement-progress (big % + bar + editable
  installed/awarded/remaining), bold section headers with real spacing, and four
  clean sections (Hours w/ the source picker · Economics · Billing · Job detail).
  Removed the duplicate Installed lbs and the "not yet tracked" billing stubs
  (Billing now shows real numbers or "No invoices yet · X remaining"); empty
  GC/Fabricator/Type/Location collapse to one "not set" line. StagePath chevron
  reduced from 6 to 4 phase-driven stages (Awarded→Active→Billing→Closed);
  Mobilizing/Punchlist still read as Active — no status/phase logic changed.
  Applies everywhere the chevron shows (Active panel + Project Details modal).
  Files: app/components/StagePath.js, app/active/ActiveWorkClient.js.


- [x] **Hours source modes (Auto / Payroll / Combined)** — one resolver
  (actualHoursForProject) now honors a per-job Hours Mode: Auto (timecards if any,
  else payroll), Payroll (use the payroll number as-is; editable — doubles as the
  close-out "final"), Combined (frozen payroll baseline + only timecard hours
  logged AFTER the combine anchor; baseline frozen at select-time). Every zone
  inherits it — Active, Performance, Home, burn, productivity — so they can't
  diverge. Shared HoursControl picker in BOTH the Active detail panel and the
  Performance modal (same fields, perfect lockstep); removed the modal's old
  two-way HoursSource. New Notion fields: Hours Mode (select) + Combine Baseline
  (number). Legacy Manual Hours Override still respected. Math verified 7/7.
  Also: bulk grid cells outlined like a spreadsheet; Active right panel now aligns
  to the table (search/bulk moved above both columns). Files: lib/rules/hours.js,
  lib/data.js, lib/rules/performance.js, lib/notion/projectRepository.js,
  lib/rules/mutations.js, app/components/HoursControl.js (new), ActiveWorkClient.js,
  ProjectPerformanceModal.js, BulkUpdate.js.


- [x] **Active-job editing + bulk grid + Notes** — (1) inline placed-to-date
  editor on the Active detail panel (click "Installed lbs" to update it for the
  life of the job; same write path as the Home alert). (2) Bulk-update grid on
  Active Work: one row per active job, editable Placed lbs / Labor hours / Notes;
  labor hours editable ONLY on payroll-era jobs (timesheet-era locked, hours come
  from the timecard app — respects the Performance source toggle, never flips it);
  changed cells highlight amber; "Save all" commits only changed cells, failed
  rows flag and keep the rest. (3) Notes property (Projects DB "Notes") now
  read + editable in the OS — bulk grid, project form (textarea), and shown on the
  Active panel. (4) Home nav item now has a divider line under it. Files:
  app/active/BulkUpdate.js (new), ActiveWorkClient.js, ProjectForm.js, AppShell.js,
  lib/data.js, lib/notion/projectRepository.js, lib/rules/mutations.js.


- [x] **Map streamline (one source of truth)** — location now comes ONLY from the
  project's address/pin; dropped the bid City/County text layer entirely. County
  shading is derived from the pins themselves (point-in-polygon via baked AZ
  county polygons, verified against known cities), colored by job count. Pins
  enlarged for easier hover. The "needs a location" flag = active jobs with no pin
  and no address, and its modal is now inline-editable — add the address (with
  autocomplete) right there, it saves to the project, pins, and drops off. Files:
  app/home/azCounties.js (regenerated w/ polys + countyOfPoint), lib/data.js,
  app/home/HomeClient.js.


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
