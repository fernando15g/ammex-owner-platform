"use client";

import { useState } from "react";

// Bids — the bid list. In-flight by default, but closed-out bids (Awarded /
// Lost / No Bid) stay reachable: an Awarded bid is where a project is created
// from. The TOTALS up top remain in-flight only, so a won or lost bid can never
// inflate the pipeline value.
// Original note: in-flight bids list. Procore-style scannable table. Shows raw and
// confidence-weighted totals up top; each bid's due date, status, GC, value.

const money = (n) => (typeof n !== "number" ? "—" : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);
const pct = (f) => (typeof f === "number" ? `${Math.round(f * 100)}%` : "—");
const dateStr = (s) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

function daysUntil(s) {
  if (!s) return null;
  const d = Math.ceil((new Date(s) - new Date()) / 86400000);
  return d;
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
  const shown = rows.filter(active.test);
  const countOf = (f) => rows.filter(f.test).length;

  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-5">
        <Stat label={`In flight (${totals.count} bids)`} value={money(totals.raw)} />
        <Stat label="Risk-weighted" value={money(totals.weighted)} accent />
        <Stat label="Raw tons" value={typeof totals.rawTons === "number" ? Math.round(totals.rawTons).toLocaleString() : "—"} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f.key
                ? "bg-safety text-steel border-safety font-medium"
                : "border-line text-rebar hover:text-concrete"
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
              <th className="text-left font-medium px-4 py-2.5">Bid</th>
              <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Status</th>
              <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Due</th>
              <th className="text-right font-medium px-3 py-2.5">Value</th>
              <th className="text-right font-medium px-4 py-2.5 hidden lg:table-cell">Margin</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const d = daysUntil(r.bidDueDate);
              const urgent = d != null && d <= 3;
              const soon = d != null && d > 3 && d <= 7;
              return (
                <tr key={r.id} onClick={() => { window.location.href = `/pipeline/${r.id}`; }} className="border-t border-line cursor-pointer hover:bg-graphite/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-concrete truncate">{r.name || "—"}</div>
                    <div className="text-xs text-rebar mt-0.5">{r.gc?.length ? r.gc.join(", ") : "no GC"}{r.cityCounty ? ` · ${r.cityCounty}` : ""}</div>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell whitespace-nowrap">
                    <span className="inline-block text-xs rounded-full px-2 py-0.5 bg-steel border border-line text-concrete/80">{r.status}</span>
                    {/* A won bid with no project yet is work that hasn't been set up. */}
                    {r.status === "Awarded" && !r.project && (
                      <span className="ml-1.5 inline-block text-[10px] rounded-full px-1.5 py-0.5 border border-warn/50 text-warn">needs project</span>
                    )}
                    {r.project && (
                      <span className="ml-1.5 inline-block text-[10px] rounded-full px-1.5 py-0.5 border border-ok/40 text-ok">{r.project.projectId || "project"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <span className={urgent ? "text-danger" : soon ? "text-warn" : "text-concrete/80"}>
                      {dateStr(r.bidDueDate)}{d != null && d >= 0 ? ` · ${d}d` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-concrete">{money(r.contractValue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell text-concrete/80">{pct(r.operatingMargin)}</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-rebar">{filter === "flight" ? "No bids in flight. Click “+ New Bid” to add one." : "No bids with this status."}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-rebar mt-3">Risk-weighted = each bid&apos;s value × its confidence by status. Due dates in red are within 3 days.</p>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (<div><span className={`text-xl font-semibold ${accent ? "text-safety" : "text-concrete"}`}>{value}</span><span className="text-rebar text-sm ml-2">{label}</span></div>);
}
