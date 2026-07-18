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

---

## Next up

- [ ] **Performance headline redesign** (`app/performance/PerformanceClient.js`)
  Adopt the mocked-up layout, re-skinned in the real app theme (tokens:
  `rebar`/`concrete`/`steel`/`safety`/`ok`/`danger`, `--surface`, `--line` —
  not generic mockup colors). Pieces:
  - Keep a compact visible readout of the raw numbers (247 / 180 / +37%), plus
    an **"i" info affordance** that reveals the full readout + a plain-language
    explanation of what it means and that it's dynamic (updates as jobs
    complete; only trusted completed jobs counted). Explanation is the priority.
  - Replace the two prose insight sentences with a **bullet-chart** actual-vs-bid
    comparison (bid marker, realized overshoot = cushion) + labeled **stat tiles**
    (151 hrs saved/100k, +$6k/100k, +$55k realized variance).
  - **Per-job spread strip** — one dot per trusted job by realized lbs/MH, WITH a
    short plain-language explanation (it's confusing without one). Data is ready:
    `performance.js` already exposes each job's `realized` lbs/MH.
  - At build time, check whether the app already has a charting/bar pattern to
    stay consistent with, before introducing new markup.

---

## Bigger builds — new read-only zones (spec §177)

- [ ] **The Book** (`/book` — nav stub exists in `AppShell.js`, `ready:false`)
  Money on **awarded** work: contract value, operating profit, margins
  (spec §121, "not built yet"). Mostly a rollup across awarded projects of
  numbers `billing.js` / `performance.js` / the bid engine already compute.
  **Scope its shape first** — which metrics, grouping (by project / GC /
  fabricator?), totals row. Build before Home.

- [ ] **Home dashboard** (`/` — currently redirects to `/active`)
  Front-door zone summarizing every zone's headline (pipeline value, active
  work, billing outstanding + unbilled-in-field, the Book's awarded total).
  Build **after** The Book.

---

## Optional refinements

- [ ] **Performance "cushion" weighting** (`lib/rules/performance.js`) — realized
  is pounds-weighted but `bidAssumed` is a plain average of ratios; consistent
  weighting would tighten the gap when job sizes vary. Low priority; current
  behavior looks intentional.
- [ ] **Placement staleness threshold** — Active Work now flags *blank* placement;
  decide what date age counts as "stale" if we want to flag old-but-present
  placement too.

---

## Resolved / struck

- ~~Confidence % reconciliation~~ — not needed. Code computes confidence itself
  (Reviewing 10 / Estimating 20 / Contingent 40 / Submitted 50 / Follow Up 55 /
  Negotiating 75) and deliberately ignores Notion's formula (won't survive the
  Postgres migration). Already correct by design.
- ~~Dark-mode theming~~ — already shipped (light + dark both live).
