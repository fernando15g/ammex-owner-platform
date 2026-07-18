"use client";

import { useState, Fragment } from "react";
import { useSort, SortHeader } from "@/app/components/Sortable";

// Bids — the bid list. In-flight bids are grouped by stage (hottest on top) so
// live opportunities never sink under a flat sort; closed-out bids (Awarded /
// Lost / No Bid) stay reachable as a flat list. Dates shown are SUBMISSION
// dates, never due dates: a due date only matters before you submit, and a red
// "overdue" on an already-submitted bid just reads as a missed deadline that
// isn't one. The TOTALS up top stay in-flight only.

const lbsOf = (tons) => (typeof tons === "number" ? tons * 2000 : null);
const lbsStr = (lbs) => (typeof lbs === "number" ? `${Math.round(lbs).toLocaleString()} lbs` : "—");
const tonsStr = (t) => (typeof t === "number" ? `${Math.round(t).toLocaleString()} tons` : "—");
const money = (n) => (typeof n !== "number" ? "—" : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);
const pct = (f) => (typeof f === "number" ? `${Math.round(f * 100)}%` : "—");
const dateStr = (s) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

// newest submission first; not-yet-submitted (null) sinks to the bottom
const bySubmittedDesc = (a, b) => {
  if (!a.submissionDate && !b.submissionDate) return 0;
  if (!a.submissionDate) return 1;
  if (!b.submissionDate) return -1;
  return new Date(b.submissionDate) - new Date(a.submissionDate);
};

// In-flight stages, stacked hottest-first. Contingent = waiting on the contract
// (basically won), so it leads; then negotiating; then the ones out for a
// decision (newest submitted first, so the ones going cold surface as you
// scroll); then the pre-submission work at the bottom.
const GROUPS = [
  { key: "live", title: "Live — chasing the award", hint: "waiting on the contract, or negotiating", statuses: ["Contingent", "Negotiating"] },
  { key: "submitted", title: "Submitted — awaiting decision", hint: "newest first — older ones are going cold", statuses: ["Submitted", "Follow Up"] },
  { key: "works", title: "In the works", hint: "not submitted yet", statuses: ["Need Weights", "Reviewing", "Estimating"] },
];
const LIVE_ORDER = { Contingent: 0, Negotiating: 1 };

function buildGroups(rows) {
  return GROUPS
    .map((g) => {
      const items = rows.filter((r) => g.statuses.includes(r.status));
      if (g.key === "live") items.sort((a, b) => (LIVE_ORDER[a.status] - LIVE_ORDER[b.status]) || ((b.contractValue || 0) - (a.contractValue || 0)));
      else if (g.key === "submitted") items.sort(bySubmittedDesc);
      else items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return { ...g, items };
    })
    .filter((g) => g.items.length > 0);
}

const FILTERS = [
  { key: "flight", label: "In flight", test: (r) => r.inFlight },
  { key: "awarded", label: "Awarded", test: (r) => r.status === "Awarded" },
  { key: "lost", label: "Lost / No Bid", test: (r) => r.status === "Lost" || r.status === "No Bid" },
  { key: "all", label: "All", test: () => true },
];

export default function PipelineClient({ data }) {
  const { rows, totals } = data;
  const [filter, setFilter] = useState("flight");
  const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const filtered = rows.filter(active.test);
  const isFlight = filter === "flight";
  const groups = buildGroups(filtered);
  const { sorted: shown, sort, toggle } = useSort(filtered, "submissionDate", "desc", "bids");
  const countOf = (f) => rows.filter(f.test).length;

  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-5">
        <Stat label={`In flight (${totals.count} bids)`} value={money(totals.raw)} />
        <Stat label="Risk-weighted" value={money(totals.weighted)} accent />
        <Stat label="Raw weight" value={lbsStr(lbsOf(totals.rawTons))} sub={tonsStr(totals.rawTons)} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key ? "bg-safety text-steel border-safety font-medium" : "border-line text-rebar hover:text-concrete"
            }`}
          >
            {f.label} <span className="opacity-60">{countOf(f)}</span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              {isFlight ? (
                <>
                  <th className="px-4 py-2.5 text-left font-medium">Bid</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden sm:table-cell">Status</th>
                  <th className="px-3 py-2.5 text-left font-medium hidden md:table-cell">Submitted</th>
                  <th className="px-3 py-2.5 text-right font-medium">Value</th>
                  <th className="px-4 py-2.5 text-right font-medium hidden lg:table-cell">Margin</th>
                </>
              ) : (
                <>
                  <SortHeader label="Bid" sortKey="name" sort={sort} toggle={toggle} className="px-4" />
                  <SortHeader label="Status" sortKey="status" sort={sort} toggle={toggle} className="hidden sm:table-cell" />
                  <SortHeader label="Submitted" sortKey="submissionDate" sort={sort} toggle={toggle} className="hidden md:table-cell" />
                  <SortHeader label="Value" sortKey="contractValue" sort={sort} toggle={toggle} align="right" />
                  <SortHeader label="Margin" sortKey="operatingMargin" sort={sort} toggle={toggle} align="right" className="hidden lg:table-cell px-4" />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {isFlight ? (
              <>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr className="bg-graphite/50 border-t border-line">
                      <td colSpan={5} className="px-4 py-2">
                        <span className="text-[11px] font-medium text-concrete uppercase tracking-wider">{g.title}</span>
                        <span className="text-xs text-rebar ml-2">{g.hint}</span>
                        <span className="text-xs text-rebar/70 ml-2">· {g.items.length}</span>
                      </td>
                    </tr>
                    {g.items.map((r) => <BidRow key={r.id} r={r} />)}
                  </Fragment>
                ))}
                {groups.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-rebar">No bids in flight. Click “+ New Bid” to add one.</td></tr>
                )}
              </>
            ) : (
              <>
                {shown.map((r) => <BidRow key={r.id} r={r} />)}
                {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-rebar">No bids with this status.</td></tr>}
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-rebar mt-3">
        Risk-weighted = each bid&apos;s value × its confidence by status. In-flight bids are grouped by stage, hottest on
        top; the date shown is when the bid was submitted.
      </p>
    </div>
  );
}

function BidRow({ r }) {
  return (
    <tr onClick={() => { window.location.href = `/pipeline/${r.id}`; }} className="border-t border-line cursor-pointer hover:bg-graphite/60">
      <td className="px-4 py-3">
        <div className="font-medium text-concrete truncate">{r.name || "—"}</div>
        <div className="text-xs text-rebar mt-0.5">{r.gc?.length ? r.gc.join(", ") : "no GC"}{r.cityCounty ? ` · ${r.cityCounty}` : ""}</div>
      </td>
      <td className="px-3 py-3 hidden sm:table-cell whitespace-nowrap">
        <span className="inline-block text-xs rounded-full px-2 py-0.5 bg-steel border border-line text-concrete/80">{r.status}</span>
        {r.status === "Awarded" && !r.project && (
          <span className="ml-1.5 inline-block text-[10px] rounded-full px-1.5 py-0.5 border border-warn/50 text-warn">needs project</span>
        )}
        {r.project && (
          <span className="ml-1.5 inline-block text-[10px] rounded-full px-1.5 py-0.5 border border-ok/40 text-ok">{r.project.projectId || "project"}</span>
        )}
      </td>
      <td className="px-3 py-3 hidden md:table-cell text-concrete/80">{dateStr(r.submissionDate)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-concrete">{money(r.contractValue)}</td>
      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell text-concrete/80">{pct(r.operatingMargin)}</td>
    </tr>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div>
      <div>
        <span className={`text-xl font-semibold ${accent ? "text-safety" : "text-concrete"}`}>{value}</span>
        <span className="text-rebar text-sm ml-2">{label}</span>
      </div>
      {sub && <div className="text-xs text-rebar/70 mt-0.5">{sub}</div>}
    </div>
  );
}
