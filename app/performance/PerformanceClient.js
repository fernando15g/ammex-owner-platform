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
import ProjectDetailsModal from "@/app/projects/ProjectDetailsModal";

// ---- formatters (house style) ----
const money = (n) =>
  typeof n !== "number" ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(Math.abs(n) / 1e3)}k` : Math.round(Math.abs(n))}`;
const pct = (f, signed = false) =>
  typeof f !== "number" ? "—" : `${signed && f > 0 ? "+" : ""}${Math.round(f * 100)}%`;
const lbs = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
const num = (n, d = 0) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
const rate = (n) => (typeof n === "number" ? `${Math.round(n)}` : "—");

export default function PerformanceClient({ data }) {
  const { trusted, needsReview, inProgress, fleet } = data;
  const { sorted, sort, toggle } = useSort(trusted, "variancePct", "asc", "performance");
  const [detailsFor, setDetailsFor] = useState(null);

  const gap = fleet.gap;
  const crewsSlower = gap && gap.pct < 0;

  return (
    <div className="space-y-6">
      {/* ================= HEADLINE — the one number ================= */}
      <div className="rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
        <div className="p-6 flex flex-wrap gap-x-10 gap-y-4 items-end">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">Crews actually produce</p>
            <p className="text-3xl font-semibold text-concrete tabular-nums">
              {fleet.blendedRealized != null ? <>{rate(fleet.blendedRealized)} <span className="text-base font-normal text-rebar">lbs/MH</span></> : "—"}
            </p>
            <p className="text-xs text-rebar mt-1">
              {fleet.trustedJobs > 0
                ? `${lbs(fleet.trustedLbs)} lbs ÷ ${num(fleet.trustedHours)} hrs across ${fleet.trustedJobs} trusted job${fleet.trustedJobs === 1 ? "" : "s"}`
                : "no trusted completed jobs yet"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">Bids assume</p>
            <p className="text-3xl font-semibold text-concrete tabular-nums">
              {fleet.bidAssumed != null ? <>{rate(fleet.bidAssumed)} <span className="text-base font-normal text-rebar">lbs/MH</span></> : "—"}
            </p>
            <p className="text-xs text-rebar mt-1">avg productivity priced on the same jobs</p>
          </div>
          {gap && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">Gap</p>
              <p className={`text-3xl font-semibold tabular-nums ${crewsSlower ? "text-danger" : "text-ok"}`}>{pct(gap.pct, true)}</p>
              <p className="text-xs text-rebar mt-1">{crewsSlower ? "crews place slower than bids price" : "crews beat what bids price"}</p>
            </div>
          )}
        </div>

        {/* what the gap MEANS — hours and dollars on the next bid */}
        {gap && Math.abs(gap.deltaHoursPer100k) >= 1 && (
          <div className={`px-6 py-3 border-t border-line text-sm ${crewsSlower ? "bg-danger/10" : "bg-ok/10"}`}>
            <span className="text-concrete">
              On every <span className="font-medium">100,000 lbs</span> bid at {rate(fleet.bidAssumed)} lbs/MH, crews at their real pace take{" "}
              <span className={`font-semibold ${crewsSlower ? "text-danger" : "text-ok"}`}>
                {num(Math.abs(gap.deltaHoursPer100k))} {crewsSlower ? "more" : "fewer"} hours
              </span>{" "}
              ≈ <span className={`font-semibold ${crewsSlower ? "text-danger" : "text-ok"}`}>{money(Math.abs(gap.costPer100k))}</span> in burdened labor{" "}
              {crewsSlower ? "the bid never priced." : "of cushion the bid didn't count on."}
            </span>
          </div>
        )}
        {typeof fleet.totalCostSlip === "number" && fleet.trustedJobs > 0 && Math.abs(fleet.totalCostSlip) >= 500 && (
          <div className="px-6 py-3 border-t border-line text-xs text-rebar">
            Across the trusted jobs, productivity variance has {fleet.totalCostSlip > 0 ? "cost" : "saved"}{" "}
            <span className={`font-medium ${fleet.totalCostSlip > 0 ? "text-danger" : "text-ok"}`}>{money(Math.abs(fleet.totalCostSlip))}</span>{" "}
            vs. what those bids priced.
          </div>
        )}
      </div>

      {/* ================= TRUSTED — the jobs the averages stand on ================= */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-medium text-concrete">Trusted completed jobs</h2>
          <span className="text-xs text-rebar">these feed the averages</span>
        </div>
        <div className="rounded-lg border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
                <SortHeader label="Project" sortKey="name" sort={sort} toggle={toggle} className="px-4" />
                <SortHeader label="Placed" sortKey="placedLbs" sort={sort} toggle={toggle} align="right" />
                <SortHeader label="Hours" sortKey="hours" sort={sort} toggle={toggle} align="right" />
                <SortHeader label="Realized" sortKey="realized" sort={sort} toggle={toggle} align="right" />
                <SortHeader label="Bid" sortKey="bidProductivity" sort={sort} toggle={toggle} align="right" className="hidden sm:table-cell" />
                <SortHeader label="Variance" sortKey="variancePct" sort={sort} toggle={toggle} align="right" />
                <SortHeader label="$ impact" sortKey="costSlip" sort={sort} toggle={toggle} align="right" className="px-4 hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const slow = typeof r.variancePct === "number" && r.variancePct < -0.05;
                const fast = typeof r.variancePct === "number" && r.variancePct > 0.05;
                return (
                  <tr key={r.id} onClick={() => setDetailsFor(r.id)} className="border-t border-line cursor-pointer hover:bg-graphite/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-concrete truncate">{r.name || "—"}</div>
                      <div className="text-xs text-rebar mt-0.5">
                        {r.projectId || "no ID"}
                        {r.hoursEra === "payroll" ? " · payroll-era hours" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{lbs(r.placedLbs)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{num(r.hours)}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-concrete">{rate(r.realized)}</td>
                    <td className="px-3 py-3 text-right tabular-nums hidden sm:table-cell">{rate(r.bidProductivity)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {typeof r.variancePct === "number" ? (
                        <span className={slow ? "text-danger" : fast ? "text-ok" : "text-concrete"}>{pct(r.variancePct, true)}</span>
                      ) : (
                        <span className="text-rebar text-xs">no bid rate</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {typeof r.costSlip === "number" ? (
                        <span className={r.costSlip > 0 ? "text-danger" : "text-ok"}>{r.costSlip > 0 ? `−${money(r.costSlip)}` : `+${money(Math.abs(r.costSlip))}`}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              {trusted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-rebar text-sm">
                    No trusted completed jobs yet — the averages will light up as jobs finish with clean hours and tonnage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-rebar mt-2">
          Realized = placed lbs ÷ counted hours (voided &amp; under-review timecards excluded). Variance is against the productivity that job&apos;s
          bid priced. $ impact = the burdened labor cost of the hours the job took beyond (or under) what the bid assumed for the steel placed.
        </p>
      </div>

      {/* ================= NEEDS REVIEW — shown, excluded, fixable ================= */}
      {needsReview.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-sm font-medium text-warn">Needs review</h2>
            <span className="text-xs text-rebar">excluded from every average until fixed</span>
          </div>
          <div className="rounded-lg border border-warn/40 divide-y divide-line overflow-hidden" style={{ background: "var(--surface)" }}>
            {needsReview.map((r) => (
              <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-graphite/40">
                <button onClick={() => setDetailsFor(r.id)} className="text-sm font-medium text-concrete hover:text-safety truncate text-left">
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

      {/* ================= IN PROGRESS — projections, never verdicts ================= */}
      {inProgress.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-sm font-medium text-concrete">In progress</h2>
            <span className="text-xs text-rebar">pace so far — a projection, not a verdict</span>
          </div>
          <div className="rounded-lg border border-line divide-y divide-line overflow-hidden" style={{ background: "var(--surface)" }}>
            {inProgress.map((r) => {
              const slow =
                r.projectable && typeof r.variancePct === "number" && r.variancePct < -0.05;
              return (
                <div key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 hover:bg-graphite/40">
                  <button onClick={() => setDetailsFor(r.id)} className="text-sm font-medium text-concrete hover:text-safety truncate text-left">
                    {r.name || "—"}
                  </button>
                  <span className="text-xs text-rebar">
                    {r.projectId || "no ID"}
                    {r.isMobilizing ? " · mobilizing" : ""}
                  </span>
                  <span className="ml-auto text-xs tabular-nums">
                    {r.projectable ? (
                      <>
                        <span className="text-rebar">pacing </span>
                        <span className={`font-semibold ${slow ? "text-warn" : "text-concrete"}`}>{rate(r.paceLbsPerMH)} lbs/MH</span>
                        {typeof r.bidProductivity === "number" && (
                          <span className="text-rebar"> vs {rate(r.bidProductivity)} bid ({pct(r.placedFraction)} placed)</span>
                        )}
                      </>
                    ) : (
                      <span className="text-rebar">
                        {r.isMobilizing ? "staging — too early to read" : "not enough placed to project"}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-rebar">
        Averages stand on trusted completed jobs only. A job lands in review when its hours and tonnage contradict each other
        (implied rate outside 40–500 lbs/MH, missing hours, or missing pounds) — fix the timesheet or the placed
        pounds and it joins the averages automatically.
      </p>

      {detailsFor && <ProjectDetailsModal projectId={detailsFor} onClose={() => setDetailsFor(null)} />}
    </div>
  );
}
