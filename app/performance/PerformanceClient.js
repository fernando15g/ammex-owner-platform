"use client";

// =============================================================================
// PERFORMANCE — realized vs. bid productivity, with trust states baked in.
//
// The screen answers ONE question: what do crews actually produce, and what is
// the gap to what bids assume costing? (spec: the strategic feedback loop —
// the number that eventually tunes the calculator.)
//
// Honesty rules, visible on screen:
//   • Averages come from TRUSTED completed jobs only.
//   • Needs-review jobs are shown WITH their discrepancy, excluded from every
//     average until the timesheet/tonnage is fixed.
//   • Running jobs show a pace PROJECTION, clearly labeled — never a verdict.
// =============================================================================

import { useState } from "react";
import { useSort, SortHeader } from "@/app/components/Sortable";
import ProjectPerformanceModal from "./ProjectPerformanceModal";

// ---- formatters (house style) ----
const money = (n) =>
  typeof n !== "number" ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(Math.abs(n) / 1e3)}k` : Math.round(Math.abs(n))}`;
const pct = (f, signed = false) =>
  typeof f !== "number" ? "—" : `${signed && f > 0 ? "+" : ""}${Math.round(f * 100)}%`;
const lbs = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
const num = (n, d = 0) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
const rate = (n) => (typeof n === "number" ? `${Math.round(n)}` : "—");

// margin banding (rules layer decides the state; this only picks the color):
// below-floor = the hard red · eroded = profitable but > 2 pts under bid ·
// on-plan = within ±2 pts of bid (neutral) · above-plan = beat the bid margin
const MARGIN_CLS = {
  "below-floor": "text-danger",
  eroded: "text-warn",
  "on-plan": "text-concrete",
  "above-plan": "text-ok",
};

export default function PerformanceClient({ data }) {
  const { trusted, needsReview, inProgress, fleet } = data;
  const [perfRow, setPerfRow] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // search — one box filters every section, by job name or Job ID
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (r) =>
    !q ||
    String(r.name || "").toLowerCase().includes(q) ||
    String(r.projectId || "").toLowerCase().includes(q);
  const fTrusted = q ? trusted.filter(match) : trusted;
  const fNeedsReview = q ? needsReview.filter(match) : needsReview;
  const fInProgress = q ? inProgress.filter(match) : inProgress;

  const { sorted, sort, toggle } = useSort(fTrusted, "variancePct", "asc", "performance");

  // section count — shows "shown of total" while a search is narrowing
  const count = (shown, total) => (q && shown !== total ? `${shown} of ${total}` : `${total}`);

  const gap = fleet.gap;
  const crewsSlower = gap && gap.pct < 0;

  // Headline geometry — recomputed every render from the trusted set, so the
  // bar, tiles and dots all move as jobs complete. Bullet bar is 0-based (honest
  // magnitude); the per-job spread uses a windowed scale so dots don't bunch up.
  const realizedVals = trusted.map((r) => r.realized).filter((v) => typeof v === "number" && v > 0);
  const clampPct = (v) => Math.max(0, Math.min(100, v));
  const haveHead = fleet.blendedRealized != null && fleet.bidAssumed != null;
  const axisMax = haveHead ? Math.max(fleet.blendedRealized, fleet.bidAssumed) * 1.15 : 1;
  const bidX = haveHead ? clampPct((fleet.bidAssumed / axisMax) * 100) : 0;
  const realX = haveHead ? clampPct((fleet.blendedRealized / axisMax) * 100) : 0;
  const lo = realizedVals.length ? Math.min(...realizedVals, fleet.bidAssumed ?? Infinity) : 0;
  const hi = realizedVals.length ? Math.max(...realizedVals, fleet.blendedRealized ?? -Infinity) : 1;
  const sPad = Math.max((hi - lo) * 0.15, 10);
  const sMin = lo - sPad;
  const sMax = hi + sPad;
  const spreadX = (v) => clampPct(((v - sMin) / (sMax - sMin)) * 100);

  return (
    <div className="space-y-6">
      {/* ================= HEADLINE — the one number, made visual ================= */}
      <div className="rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
        <div className="px-6 pt-5 pb-4 flex items-start gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-rebar">Fleet productivity</p>
            <div className="flex items-baseline gap-2.5 mt-1 flex-wrap">
              <span className="text-4xl font-semibold text-concrete tabular-nums leading-none">{haveHead ? rate(fleet.blendedRealized) : "—"}</span>
              <span className="text-sm text-rebar">lbs/MH produced</span>
              {gap && (
                <span className={`inline-flex items-center gap-1 text-sm font-semibold px-2 py-0.5 rounded ${crewsSlower ? "text-danger bg-danger/10" : "text-ok bg-ok/10"}`}>
                  {pct(gap.pct, true)} vs bid
                </span>
              )}
            </div>
            <p className="text-xs text-rebar mt-1.5">
              {fleet.trustedJobs > 0
                ? `${lbs(fleet.trustedLbs)} lbs ÷ ${num(fleet.trustedHours)} hrs · ${fleet.trustedJobs} trusted job${fleet.trustedJobs === 1 ? "" : "s"}`
                : "no trusted completed jobs yet"}
            </p>
          </div>
          <button
            onClick={() => setInfoOpen((o) => !o)}
            className={`ml-auto shrink-0 w-6 h-6 rounded-full border text-xs italic flex items-center justify-center transition-colors ${infoOpen ? "border-safety text-safety" : "border-line text-rebar hover:text-concrete hover:border-rebar"}`}
            aria-label="What does this mean?"
            title="What does this mean?"
          >
            i
          </button>
        </div>

        {infoOpen && haveHead && (
          <div className="px-6 pb-4 text-sm space-y-2 border-b border-line">
            <p><span className="text-concrete font-medium">What this shows:</span> <span className="text-rebar">how much rebar your crews actually place per man-hour, next to what your bids assumed when they were priced.</span></p>
            <ul className="space-y-1 text-rebar">
              <li><span className="text-concrete">Produced ({rate(fleet.blendedRealized)})</span> — total pounds placed ÷ total hours across trusted completed jobs. Bigger jobs count more.</li>
              <li><span className="text-concrete">Bid ({rate(fleet.bidAssumed)})</span> — the average productivity those same jobs were priced at.</li>
              <li><span className="text-concrete">Gap ({pct(gap?.pct, true)})</span> — {crewsSlower ? "crews place slower than bids assumed, so jobs run tight on labor." : "crews place faster than bids assumed, so jobs finish with labor to spare."}</li>
            </ul>
            <p className="text-rebar">These recalculate on their own as jobs finish — only completed jobs you trust are counted, so the number sharpens over time.</p>
          </div>
        )}

        {haveHead && (
          <div className="px-6 pt-4 pb-2">
            <div className="relative h-11">
              <div className="absolute left-0 right-0 top-4 h-3 rounded-full bg-graphite border border-line" />
              <div className="absolute top-4 left-0 h-3 rounded-l-full bg-rebar/25" style={{ width: `${Math.min(bidX, realX)}%` }} />
              <div className={`absolute top-4 h-3 ${crewsSlower ? "bg-danger/60" : "bg-ok"}`} style={{ left: `${Math.min(bidX, realX)}%`, width: `${Math.abs(realX - bidX)}%` }} />
              <div className="absolute top-2 w-0.5 h-7 bg-concrete" style={{ left: `${bidX}%` }} />
              <div className="absolute top-0 text-[11px] text-rebar -translate-x-1/2 whitespace-nowrap" style={{ left: `${bidX}%` }}>bid {rate(fleet.bidAssumed)}</div>
              <div className={`absolute top-0 text-[11px] font-medium -translate-x-1/2 whitespace-nowrap ${crewsSlower ? "text-danger" : "text-ok"}`} style={{ left: `${realX}%` }}>{rate(fleet.blendedRealized)}</div>
            </div>
            <p className="text-center text-xs text-rebar">
              {crewsSlower ? "the red band is labor the bid didn’t budget for" : "the green band is cushion your bids never priced"}
            </p>
          </div>
        )}

        {gap && (
          <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Tile label={crewsSlower ? "Extra hrs / 100k lbs" : "Hours saved / 100k lbs"} value={`${num(Math.abs(gap.deltaHoursPer100k))} hrs`} tone={crewsSlower ? "danger" : "ok"} />
            <Tile label="Labor value / 100k lbs" value={money(Math.abs(gap.costPer100k))} tone={crewsSlower ? "danger" : "ok"} signed={crewsSlower ? "−" : "+"} />
            {typeof fleet.totalCostSlip === "number" && fleet.trustedJobs > 0 && (
              <Tile label="Realized variance" value={money(Math.abs(fleet.totalCostSlip))} tone={fleet.totalCostSlip > 0 ? "danger" : "ok"} signed={fleet.totalCostSlip > 0 ? "−" : "+"} />
            )}
          </div>
        )}

        {realizedVals.length >= 2 && (
          <div className="px-6 pb-5 border-t border-line">
            <p className="text-[11px] uppercase tracking-wider text-rebar mt-3 mb-3">Per-job spread · realized lbs/MH</p>
            <div className="relative h-8">
              <div className="absolute left-0 right-0 top-4 h-px bg-line" />
              <div className="absolute top-1 w-px h-6 bg-rebar/70" style={{ left: `${spreadX(fleet.bidAssumed)}%` }} />
              <div className={`absolute top-1 w-0.5 h-6 ${crewsSlower ? "bg-danger" : "bg-ok"}`} style={{ left: `${spreadX(fleet.blendedRealized)}%` }} />
              {trusted.map((r) =>
                typeof r.realized === "number" && r.realized > 0 ? (
                  <div
                    key={r.id}
                    className="absolute top-2.5 w-2.5 h-2.5 rounded-full bg-concrete/70 -translate-x-1/2 hover:bg-safety cursor-default"
                    style={{ left: `${spreadX(r.realized)}%` }}
                    title={`${r.name || r.projectId}: ${rate(r.realized)} lbs/MH`}
                  />
                ) : null
              )}
            </div>
            <div className="flex justify-between text-[11px] text-rebar mt-1">
              <span>slower</span>
              <span>faster →</span>
            </div>
            <p className="text-xs text-rebar mt-2">
              Each dot is one trusted job, by how fast that crew actually placed. The
              <span className={crewsSlower ? "text-danger" : "text-ok"}> {crewsSlower ? "red" : "green"} line</span> is your fleet blend ({rate(fleet.blendedRealized)}); the gray line is what bids assumed ({rate(fleet.bidAssumed)}). Dots clustered tight mean a steady pace you can bank on when bidding; spread wide means the average hides big job-to-job swings.
            </p>
          </div>
        )}
      </div>

      {/* ================= SEARCH — one box, every section ================= */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search jobs — name or ID"
        className="w-full sm:w-80 text-sm px-3 py-2 rounded-md border border-line bg-transparent text-concrete placeholder:text-rebar/60 focus:outline-none focus:border-rebar"
      />

      {/* ================= IN PROGRESS — the work you act on, first ================= */}
      {fInProgress.length > 0 && (
        <InProgressTable rows={fInProgress} count={count(fInProgress.length, inProgress.length)} onOpen={setPerfRow} />
      )}

      {/* ================= NEEDS REVIEW — shown, excluded, fixable ================= */}
      {fNeedsReview.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-sm font-medium text-warn">Needs review ({count(fNeedsReview.length, needsReview.length)})</h2>
            <span className="text-xs text-rebar">excluded from every average until fixed</span>
          </div>
          <div className="rounded-lg border border-warn/40 divide-y divide-line overflow-hidden" style={{ background: "var(--surface)" }}>
            {fNeedsReview.map((r) => (
              <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-graphite/40">
                <button onClick={() => setPerfRow(r)} className="text-sm font-medium text-concrete hover:text-safety truncate text-left">
                  {r.name || "—"}
                </button>
                <span className="text-xs text-rebar">{r.projectId || "no ID"}</span>
                <span className="text-xs tabular-nums text-rebar">
                  {lbs(r.placedLbs)} lbs · {num(r.hours)} hrs
                  {r.realized != null && <> · implies <span className="text-warn font-medium">{rate(r.realized)} lbs/MH</span></>}
                </span>
                <span className="w-full sm:w-auto sm:ml-auto text-xs text-warn">
                  {r.problems.join("; ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= COMPLETED — reference, at the bottom ================= */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-medium text-concrete">Completed jobs ({count(fTrusted.length, trusted.length)})</h2>
          <span className="text-xs text-rebar">trusted — these feed the averages</span>
        </div>
        <div className="rounded-lg border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
                <SortHeader label="Project" sortKey="name" sort={sort} toggle={toggle} className="px-4" />
                <SortHeader label="Placed" sortKey="placedLbs" sort={sort} toggle={toggle} align="right" info="Pounds of rebar installed on this job." />
                <SortHeader label="Hours" sortKey="hours" sort={sort} toggle={toggle} align="right" info="Counted labor hours (voided and under-review timecards excluded)." />
                <SortHeader label="Realized" sortKey="realized" sort={sort} toggle={toggle} align="right" info="Actual lbs placed per man-hour — placed pounds ÷ counted hours." />
                <SortHeader label="Bid" sortKey="bidProductivity" sort={sort} toggle={toggle} align="right" className="hidden sm:table-cell" info="The productivity (lbs/MH) this job\u2019s bid assumed." />
                <SortHeader label="Variance" sortKey="variancePct" sort={sort} toggle={toggle} align="right" info="Realized productivity vs. what the bid assumed. Positive = beating the bid." />
                <SortHeader label="Margin" sortKey="achievedMargin" sort={sort} toggle={toggle} align="right" className="px-4 hidden md:table-cell" info="Operating margin the job actually finished at, vs. what the bid priced. Red only below the 12% floor; within ±2 pts of the bid margin reads neutral — a 30% bid that lands 29% is fine, not a failure." />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const slow = typeof r.variancePct === "number" && r.variancePct < -0.05;
                const fast = typeof r.variancePct === "number" && r.variancePct > 0.05;
                return (
                  <tr key={r.id} onClick={() => setPerfRow(r)} className="border-t border-line cursor-pointer hover:bg-graphite/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-concrete truncate">{r.name || "—"}</div>
                      <div className="text-xs text-rebar mt-0.5">
                        {r.projectId || "no ID"}
                        {r.hoursEra === "payroll" ? " · payroll-era hours" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{lbs(r.placedLbs)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{num(r.hours)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div className="font-semibold text-concrete">{rate(r.realized)}</div>
                      {r.matched && r.allHoursRealized != null && Math.round(r.allHoursRealized) !== Math.round(r.realized) && (
                        <div className="text-[11px] text-rebar">{rate(r.allHoursRealized)} · all hrs</div>
                      )}
                      <div className={`text-[10px] uppercase tracking-wide ${r.weightSource === "billed" ? "text-safety" : "text-rebar/70"}`}>{r.weightSource}</div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell">{rate(r.bidProductivity)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {typeof r.variancePct === "number" ? (
                        <span className={slow ? "text-danger" : fast ? "text-ok" : "text-concrete"}>{pct(r.variancePct, true)}</span>
                      ) : (
                        <span className="text-rebar text-xs">no bid rate</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {typeof r.achievedMargin === "number" ? (
                        <>
                          {/* money leads: the margin the job actually made. Color is banded
                              off the BID margin, not zero — red only below the 12% floor. */}
                          <div className={`font-semibold ${MARGIN_CLS[r.marginState] || "text-concrete"}`}>{pct(r.achievedMargin)}</div>
                          <div className="text-[11px] text-rebar">
                            bid {pct(r.bidMargin)}
                            {typeof r.costSlip === "number" && Math.abs(r.costSlip) >= 1 && (
                              <> · {r.costSlip > 0 ? "−" : "+"}{money(Math.abs(r.costSlip))} labor</>
                            )}
                          </div>
                        </>
                      ) : typeof r.costSlip === "number" ? (
                        // no bid economics on this job — show the labor $ quietly, no verdict color
                        <span className="text-rebar">{r.costSlip > 0 ? `−${money(r.costSlip)}` : `+${money(Math.abs(r.costSlip))}`}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              {fTrusted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-rebar text-sm">
                    {q
                      ? "No completed jobs match this search."
                      : "No trusted completed jobs yet — the averages will light up as jobs finish with clean hours and tonnage."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-rebar mt-2">
          Realized = placed lbs ÷ counted hours (voided &amp; under-review timecards excluded). Variance is against the productivity that job&apos;s
          bid priced. Margin = the operating margin the job actually finished at (labor moved to the realized pace), next to what the bid priced;
          the small $ figure is the burdened labor cost of the productivity variance. Coloring is banded off the bid margin — red only below the
          12% floor, amber when profitable but more than 2 pts under the bid, neutral within ±2 pts.
        </p>
      </div>

      <p className="text-xs text-rebar">
        Averages stand on trusted completed jobs only. A job lands in review when its hours and tonnage contradict each other
        (implied rate outside 40–500 lbs/MH, missing hours, or missing pounds) — fix the timesheet or the placed
        pounds and it joins the averages automatically. Weight source flips from <span className="text-concrete">placed</span> (manual
        placed-to-date) to <span className="text-concrete">billed</span> (LBS billed on invoices) automatically once a job is ≥98% billed.
        On billed jobs the headline rate is <span className="text-concrete">matched</span> — billed weight ÷ hours through the last
        invoice date — so both sides of the fraction cover the same window; the quieter “all hrs” figure divides by every hour logged.
      </p>

      {perfRow && <ProjectPerformanceModal row={perfRow} onClose={() => setPerfRow(null)} />}
    </div>
  );
}


// A labeled stat tile — the prose insights, turned into scannable numbers.
function Tile({ label, value, tone, signed }) {
  const c = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-concrete";
  return (
    <div className="rounded-md px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px] text-rebar mb-1">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${c}`}>{signed || ""}{value}</div>
    </div>
  );
}

// In-progress table — same format discipline as the trusted table. Forecast
// (projected finish % of hour budget) sorts worst-first; mobilizing sinks.
function InProgressTable({ rows, count, onOpen }) {
  const prepared = rows.map((r) => ({
    ...r,
    _forecast: r.burn?.forecastPct ?? null,
    _sink: r.isMobilizing ? 1 : 0,
  }));
  const { sorted, sort, toggle } = useSort(prepared, "_forecast", "desc", "perf-inprogress");
  const ordered = [...sorted].sort((a, b) => a._sink - b._sink);
  const pct1 = (f) => (typeof f !== "number" ? "—" : `${Math.round(f * 100)}%`);
  const rateN = (n) => (typeof n === "number" ? `${Math.round(n)}` : "—");
  const lbsN = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
  const numN = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h2 className="text-sm font-medium text-concrete">In progress ({count})</h2>
        <span className="text-xs text-rebar">pace so far — projections, never verdicts</span>
      </div>
      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <SortHeader label="Project" sortKey="name" sort={sort} toggle={toggle} className="px-4" />
              <SortHeader label="Placed" sortKey="placedLbs" sort={sort} toggle={toggle} align="right" info="Pounds of rebar installed on this job." />
              <SortHeader label="Hours" sortKey="hours" sort={sort} toggle={toggle} align="right" info="Counted labor hours (voided and under-review timecards excluded)." />
              <SortHeader label="Pace" sortKey="paceLbsPerMH" sort={sort} toggle={toggle} align="right" info="Current lbs/MH. \u2018Billed\u2019 = billed weight through the last invoice date; \u2018placed\u2019 = manual placed-to-date." />
              <SortHeader label="Bid" sortKey="bidProductivity" sort={sort} toggle={toggle} align="right" className="hidden sm:table-cell" info="The productivity (lbs/MH) this job\u2019s bid assumed." />
              <SortHeader label="Forecast" sortKey="_forecast" sort={sort} toggle={toggle} align="right" className="px-4" info="Projected total hours at the current pace vs. the hours the bid budgeted. Over 100% = trending to finish over the hour budget." />
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => {
              const f = r._forecast;
              const fCls = typeof f !== "number" ? "text-rebar" : f >= 1.05 ? "text-danger" : f >= 0.95 ? "text-warn" : "text-ok";
              return (
                <tr key={r.id} onClick={() => onOpen(r)} className="border-t border-line cursor-pointer hover:bg-graphite/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-concrete truncate">{r.name || "—"}</div>
                    <div className="text-xs text-rebar mt-0.5">
                      {r.projectId || "no ID"}
                      {r.isMobilizing ? " · mobilizing" : ""}
                      {r.billingLags ? " · billing behind field" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div>{lbsN(r.placedLbs)}</div>
                    <div className="text-[11px] text-rebar">{pct1(r.placedFraction)} of {lbsN(r.awardedLbs)}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <div>{numN(r.hours)}</div>
                    <div className="text-[11px] text-rebar">{r.burn?.hoursPct != null ? `${pct1(r.burn.hoursPct)} of budget` : "no bid hours"}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {r.paceLbsPerMH != null ? (
                      <>
                        <div className="font-semibold text-concrete">{rateN(r.paceLbsPerMH)}</div>
                        {r.paceSource === "billed" && r.matched && (
                          <div className="text-[11px] text-rebar">thru {String(r.matched.throughDate).slice(5)}</div>
                        )}
                        <div className={`text-[10px] uppercase tracking-wide ${r.paceSource === "billed" ? "text-safety" : "text-rebar/70"}`}>{r.paceSource}</div>
                      </>
                    ) : (
                      <span className="text-xs text-rebar">{r.isMobilizing ? "staging" : "too early"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell">{rateN(r.bidProductivity)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={`font-medium ${fCls}`}>{typeof f === "number" ? pct1(f) : "—"}</span>
                    {typeof f === "number" && <div className="text-[11px] text-rebar">of hour budget</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
