"use client";

import { useState } from "react";
import { useSort, SortHeader } from "@/app/components/Sortable";

// Billing & Receivables overview — the A/R schedule. One row per project
// (like the paper report), but with computed aging, outstanding, retention,
// and unbilled-in-field. Click a project → its billing workspace.

const money = (n) => (typeof n !== "number" ? "—" : n < 0 ? `-$${Math.abs(Math.round(n)).toLocaleString()}` : `$${Math.round(n).toLocaleString()}`);

const STATUS_TONE = {
  "Overdue": "text-danger",
  "Billing in progress": "text-concrete",
  "Fully billed": "text-info",
  "Paid in full": "text-ok",
  "Not billed": "text-rebar",
};

export default function BillingOverviewClient({ data }) {
  const { rows, totals } = data;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const active = rows.filter((r) => r.hasBilling);
  const { sorted: activeSorted, sort, toggle } = useSort(active, "name", "asc");
  const sortById = (a, b) => String(a.projectId || "~").localeCompare(String(b.projectId || "~"), undefined, { numeric: true });
  const searchList = [...rows].sort(sortById).filter((r) => {
    if (q.trim() === "") return true;
    const hay = `${r.name || ""} ${r.projectId || ""} ${(r.gc || []).join(" ")}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  return (
    <div>
      {/* Find a project — scrollable, sorted by ID, includes closed (dimmed) */}
      <div className="relative mb-4 max-w-md">
        <input
          className="inp"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Find project to bill"
        />
        {open && searchList.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-line shadow-lg overflow-y-auto" style={{ background: "var(--surface)", maxHeight: "13.5rem" }}>
            {searchList.map((m) => {
              const closed = m.status === "Closed" || m.status === "Paid" || m.status === "Complete";
              return (
                <button key={m.id} onMouseDown={() => { window.location.href = `/billing/${m.id}`; }} className="w-full text-left px-3 py-2.5 hover:bg-graphite/60 border-b border-line last:border-b-0 flex items-baseline gap-2">
                  <span className={`text-sm ${closed ? "text-rebar line-through" : "text-concrete"}`}>{m.name || "—"}</span>
                  <span className={`text-xs ${closed ? "text-rebar/60" : "text-rebar"}`}>{m.projectId || ""}{m.gc?.length ? ` · ${m.gc.join(", ")}` : ""}{closed ? " · closed" : !m.hasBilling ? " · no billing yet" : ""}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Portfolio A/R summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Outstanding (owed to you)" value={money(totals.outstanding)} accent />
        <Stat label="Overdue" value={money(totals.overdueTotal)} tone={totals.overdueTotal > 0 ? "danger" : "ok"} />
        <Stat label="Remaining to bill" value={money(totals.remainingToBill)} />
        <Stat label="Retention held" value={money(totals.retention)} />
      </div>

      {/* Aging strip */}
      <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
        <p className="text-[11px] uppercase tracking-wider text-rebar mb-3">Aging — outstanding by age</p>
        <div className="grid grid-cols-5 gap-2 text-center">
          <Age label="Current" value={money(totals.aging.current)} />
          <Age label="1–30" value={money(totals.aging.d1_30)} warn={totals.aging.d1_30 > 0} />
          <Age label="31–60" value={money(totals.aging.d31_60)} warn={totals.aging.d31_60 > 0} />
          <Age label="61–90" value={money(totals.aging.d61_90)} danger={totals.aging.d61_90 > 0} />
          <Age label="90+" value={money(totals.aging.d90_plus)} danger={totals.aging.d90_plus > 0} />
        </div>
      </div>

      {/* Per-project A/R table */}
      <div className="rounded-lg border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <SortHeader label="Project" sortKey="name" sort={sort} toggle={toggle} className="px-4" />
              <SortHeader label="Contract" sortKey="billing.revisedContract" sort={sort} toggle={toggle} align="right" className="hidden md:table-cell" />
              <SortHeader label="Billed" sortKey="billing.billedToDate" sort={sort} toggle={toggle} align="right" />
              <SortHeader label="Outstanding" sortKey="billing.outstanding" sort={sort} toggle={toggle} align="right" />
              <SortHeader label="Remaining" sortKey="billing.remainingToBill" sort={sort} toggle={toggle} align="right" className="hidden lg:table-cell" />
              <SortHeader label="Status" sortKey="billing.status" sort={sort} toggle={toggle} className="px-4" />
            </tr>
          </thead>
          <tbody>
            {activeSorted.map((r) => (
              <tr key={r.id} onClick={() => { window.location.href = `/billing/${r.id}`; }} className="border-t border-line cursor-pointer hover:bg-graphite/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-concrete truncate">{r.name || "—"}</div>
                  <div className="text-xs text-rebar mt-0.5">{r.projectId || ""}{r.gc?.length ? ` · ${r.gc.join(", ")}` : ""}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-concrete/80">{money(r.billing.revisedContract)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-concrete">{money(r.billing.billedToDate)}</td>
                <td className="px-3 py-3 text-right tabular-nums font-medium text-concrete">{money(r.billing.outstanding)}</td>
                <td className="px-3 py-3 text-right tabular-nums hidden lg:table-cell text-concrete/70">{money(r.billing.remainingToBill)}</td>
                <td className="px-4 py-3"><span className={`text-xs ${STATUS_TONE[r.billing.status] || "text-concrete"}`}>{r.billing.status}</span></td>
              </tr>
            ))}
            {active.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-rebar">No projects with billing yet. Use the search above to pull up a project and set its contract value or create its first bill.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-rebar mt-3">Showing projects with billing activity. To start billing a new project, find it with the search above. All totals computed live.</p>
    </div>
  );
}

function Stat({ label, value, accent, tone }) {
  const c = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : accent ? "text-safety" : "text-concrete";
  return (<div className="rounded-lg border border-line px-4 py-3" style={{ background: "var(--surface)" }}><p className="text-[11px] text-rebar mb-1 leading-tight">{label}</p><p className={`text-lg font-semibold ${c}`}>{value}</p></div>);
}
function Age({ label, value, warn, danger }) {
  const c = danger ? "text-danger" : warn ? "text-warn" : "text-concrete";
  return (<div><p className="text-[11px] text-rebar mb-1">{label}</p><p className={`text-sm font-medium tabular-nums ${c}`}>{value}</p></div>);
}
