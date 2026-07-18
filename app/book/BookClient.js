"use client";

// =============================================================================
// THE BOOK — money on awarded work, as a WIP schedule (spec §121). One row per
// won job: contract, expected profit/margin, billed, remaining, outstanding —
// with totals. Read-only; click a job to open its billing workspace. Every
// figure comes from getBook(), which runs the same billing engine as the
// Billing zone, so the two never disagree.
// =============================================================================

import { useState } from "react";
import { useSort, SortHeader } from "@/app/components/Sortable";

const money = (n) =>
  typeof n !== "number"
    ? "—"
    : `${n < 0 ? "−" : ""}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(Math.abs(n) / 1e3)}k` : Math.round(Math.abs(n))}`;
const pct = (f) => (typeof f === "number" ? `${Math.round(f * 100)}%` : "—");

// project lifecycle → pill tone (matches the phases getBook carries)
const PHASE_TONE = { backlog: "text-info", running: "text-ok", billing: "text-safety", complete: "text-rebar" };

export default function BookClient({ data }) {
  const { open, closed, totals, closedTotals } = data;
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const matches = (r) => {
    const s = q.trim().toLowerCase();
    return !s || `${r.name || ""} ${r.projectId || ""} ${(r.gc || []).join(" ")}`.toLowerCase().includes(s);
  };
  const openF = open.filter(matches);
  const closedF = closed.filter(matches);
  const { sorted, sort, toggle } = useSort(openF, "outstanding", "desc", "book");

  return (
    <div className="space-y-5">
      {/* the glance — the whole book in one line */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Contract value" value={money(totals.contract)} info="Total revised contract value across open awarded jobs — original contract plus approved change orders." />
        <Tile label="Profit in book" value={money(totals.operatingProfit)} tone="ok" info="Operating profit these jobs were bid to make. Realized profit lands as jobs complete." />
        <Tile label="Remaining to bill" value={money(totals.remaining)} info="Contract value not yet invoiced — your booked future revenue (backlog)." />
        <Tile label="Outstanding" value={money(totals.outstanding)} tone="amber" info="Billed but not yet collected — money owed to you right now." />
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search job, GC, or ID"
        className="w-full sm:w-80 text-sm px-3 py-2 rounded-md border border-line bg-transparent text-concrete placeholder:text-rebar/60 focus:outline-none focus:border-rebar"
      />

      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <SortHeader label="Job" sortKey="name" sort={sort} toggle={toggle} className="px-4" />
              <SortHeader label="Status" sortKey="status" sort={sort} toggle={toggle} className="hidden sm:table-cell" />
              <SortHeader label="Contract" sortKey="contract" sort={sort} toggle={toggle} align="right" info="Revised contract value (incl. approved change orders); the bid's contract value until billing is set up." />
              <SortHeader label="Profit / margin" sortKey="operatingProfit" sort={sort} toggle={toggle} align="right" info="Operating profit and margin the job was bid to make." />
              <SortHeader label="Billed" sortKey="billed" sort={sort} toggle={toggle} align="right" className="hidden md:table-cell" info="Invoiced to date, net of short-pay roll-forwards." />
              <SortHeader label="Remaining" sortKey="remaining" sort={sort} toggle={toggle} align="right" info="Contract not yet invoiced — future revenue on this job." />
              <SortHeader label="Outstanding" sortKey="outstanding" sort={sort} toggle={toggle} align="right" className="px-4" info="Billed but not yet collected — owed to you now." />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={() => { window.location.href = `/billing/${r.id}`; }}
                className="border-t border-line cursor-pointer hover:bg-graphite/60 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-concrete truncate">{r.name || "—"}</div>
                  <div className="text-xs text-rebar mt-0.5">{r.projectId || "no ID"}{r.gc?.length ? ` · ${r.gc.join(", ")}` : ""}</div>
                </td>
                <td className="px-3 py-3 hidden sm:table-cell"><StatusPill status={r.status} phase={r.phase} /></td>
                <td className="px-3 py-3 text-right tabular-nums text-concrete">{money(r.contract)}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <div className="text-concrete">{money(r.operatingProfit)}</div>
                  <div className="text-[11px] text-rebar">{pct(r.operatingMargin)}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-concrete hidden md:table-cell">{money(r.billed)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-rebar">{money(r.remaining)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={r.outstanding > 0 ? "text-warn" : "text-rebar"}>{money(r.outstanding)}</span>
                </td>
              </tr>
            ))}
            {openF.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-rebar text-sm">
                  {q ? "No awarded jobs match this search." : "No awarded work on the books yet."}
                </td>
              </tr>
            )}
          </tbody>
          {openF.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line bg-graphite/40 font-semibold text-concrete">
                <td className="px-4 py-3">Total · {totals.jobs} job{totals.jobs === 1 ? "" : "s"}</td>
                <td className="hidden sm:table-cell"></td>
                <td className="px-3 py-3 text-right tabular-nums">{money(totals.contract)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-ok">{money(totals.operatingProfit)}</td>
                <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell">{money(totals.billed)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(totals.remaining)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-warn">{money(totals.outstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {closed.length > 0 && (
        <div className="rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
          <button onClick={() => setShowClosed((o) => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-graphite/30">
            <span className={`text-rebar text-xs transition-transform ${showClosed ? "rotate-90" : ""}`}>▸</span>
            <span className="text-sm text-concrete font-medium">Closed jobs</span>
            <span className="text-xs text-rebar">completed — profit earned</span>
            <span className="ml-auto flex items-center gap-4 text-xs tabular-nums">
              <span className="text-rebar">{closedTotals.jobs} job{closedTotals.jobs === 1 ? "" : "s"}</span>
              <span className="text-concrete">{money(closedTotals.contract)} contract</span>
              <span className="text-ok font-medium">{money(closedTotals.operatingProfit)} profit</span>
            </span>
          </button>
          {showClosed && (
            <div className="border-t border-line divide-y divide-line" style={{ background: "var(--surface-2)" }}>
              {(q ? closedF : closed).map((r) => (
                <div
                  key={r.id}
                  onClick={() => { window.location.href = `/billing/${r.id}`; }}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-graphite/40 cursor-pointer text-sm"
                >
                  <span className="text-concrete truncate">{r.name || "—"}</span>
                  <span className="text-xs text-rebar truncate">{r.projectId || ""}{r.gc?.length ? ` · ${r.gc.join(", ")}` : ""}</span>
                  <span className="ml-auto flex items-center gap-4 shrink-0 tabular-nums text-xs">
                    <span className="text-concrete/70">{money(r.contract)}</span>
                    <span className="text-ok">{money(r.operatingProfit)}</span>
                  </span>
                </div>
              ))}
              {q && closedF.length === 0 && <div className="px-4 py-3 text-xs text-rebar">No closed jobs match this search.</div>}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-rebar">
        The Book is read-only — every figure is computed from the same billing engine as the Billing zone, so the two always agree.
        Contract is the revised value including approved change orders; profit and margin are what the job was bid to make. Click any
        job to open its billing workspace.
      </p>
    </div>
  );
}

function Tile({ label, value, tone, info }) {
  const c = tone === "amber" ? "text-warn" : tone === "ok" ? "text-ok" : "text-concrete";
  return (
    <div className="rounded-lg border border-line px-4 py-3" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-1 text-[11px] text-rebar mb-1">
        <span>{label}</span>
        {info && (
          <span title={info} className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-rebar/50 text-rebar text-[9px] leading-none cursor-help">i</span>
        )}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status, phase }) {
  const tone = PHASE_TONE[phase] || "text-rebar";
  return (
    <span className={`inline-flex items-center text-xs rounded-full px-2 py-0.5 bg-steel border border-line ${tone}`}>
      {status || "—"}
    </span>
  );
}
