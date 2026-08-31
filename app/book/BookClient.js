"use client";
import SpecialtyTag from "@/app/components/SpecialtyTag";

// =============================================================================
// THE BOOK — money on awarded work, as a WIP schedule (spec §121). One row per
// won job: contract, expected profit/margin, billed, remaining, outstanding —
// with totals. Read-only; click a job to open its billing workspace. Every
// figure comes from getBook(), which runs the same billing engine as the
// Billing zone, so the two never disagree.
// =============================================================================

import { useState } from "react";
import { useSort, SortHeader } from "@/app/components/Sortable";
import { moneyShort as money, pct } from "@/lib/format/numbers";

// project lifecycle → pill tone (matches the phases getBook carries)
const PHASE_TONE = { backlog: "text-info", running: "text-ok", billing: "text-safety", complete: "text-rebar" };

export default function BookClient({ data }) {
  const { active, backlog, closed, totals, activeTotals, backlogTotals, closedTotals } = data;
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [chooser, setChooser] = useState(null); // row whose destination picker is open

  const matches = (r) => {
    const s = q.trim().toLowerCase();
    return !s || `${r.name || ""} ${r.projectId || ""} ${(r.gc || []).join(" ")}`.toLowerCase().includes(s);
  };
  const activeF = active.filter(matches);
  const backlogF = backlog.filter(matches);
  const closedF = closed.filter(matches);
  const { sorted, sort, toggle } = useSort(activeF, "outstanding", "desc", "book");

  return (
    <div className="space-y-5">
      {/* the glance — the whole book in one line */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Contract value" value={money(totals.contract)} info="Total revised contract value across open awarded jobs — original contract plus approved change orders." />
        <Tile label="Profit in book" value={money(totals.operatingProfit)} tone="ok" info="Closed jobs show realized profit (actually earned); active and backlog show the profit they were bid to make. Realized lands as jobs complete." />
        <Tile label="Remaining to bill" value={money(totals.remaining)} info="Contract value not yet invoiced — your booked future revenue (backlog)." />
        <Tile label="Outstanding" value={money(totals.outstanding)} tone="amber" info="Billed but not yet collected — money owed to you right now." />
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search job, GC, or ID"
        className="w-full sm:w-80 text-sm px-3 py-2 rounded-md border border-line bg-transparent text-concrete placeholder:text-rebar/60 focus:outline-none focus:border-rebar"
      />

      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <h2 className="text-sm font-medium text-concrete">Active work ({activeF.length})</h2>
          <span className="text-xs text-rebar">jobs underway — the work-in-progress</span>
        </div>
        <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <SortHeader label="Job" sortKey="projectId" sort={sort} toggle={toggle} className="px-4" info="Click to sort by project ID." />
              <SortHeader label="Status" sortKey="status" sort={sort} toggle={toggle} className="hidden sm:table-cell" />
              <SortHeader label="Contract" sortKey="contract" sort={sort} toggle={toggle} align="right" info="Revised contract value (incl. approved change orders); the bid's contract value until billing is set up." />
              <SortHeader label="Expected profit" sortKey="operatingProfit" sort={sort} toggle={toggle} align="right" info="Profit and margin the job was BID to make — the forecast, not today\u2019s realized number. See Performance for how a job is actually tracking." />
              <SortHeader label="Billed" sortKey="billed" sort={sort} toggle={toggle} align="right" className="hidden md:table-cell" info="Invoiced to date, net of short-pay roll-forwards." />
              <SortHeader label="Remaining" sortKey="remaining" sort={sort} toggle={toggle} align="right" info="Contract not yet invoiced — future revenue on this job." />
              <SortHeader label="Outstanding" sortKey="outstanding" sort={sort} toggle={toggle} align="right" className="px-4" info="Billed but not yet collected — owed to you now." />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.id}
                onClick={() => setChooser(r)}
                className="border-t border-line cursor-pointer hover:bg-graphite/60 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-baseline min-w-0"><span className="font-medium text-concrete truncate">{r.name || "—"}</span><SpecialtyTag types={r.specialtyTypes} /></div>
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
            {activeF.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-rebar text-sm">
                  {q ? "No active jobs match this search." : "No active work in progress."}
                </td>
              </tr>
            )}
          </tbody>
          {activeF.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-line bg-graphite/40 font-semibold text-concrete">
                <td className="px-4 py-3">Total · {activeTotals.jobs} job{activeTotals.jobs === 1 ? "" : "s"}</td>
                <td className="hidden sm:table-cell"></td>
                <td className="px-3 py-3 text-right tabular-nums">{money(activeTotals.contract)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-ok">{money(activeTotals.operatingProfit)}</td>
                <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell">{money(activeTotals.billed)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(activeTotals.remaining)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-warn">{money(activeTotals.outstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>

      {/* Backlog — awarded, not started. Signed future revenue, nothing billed
          yet, so it's its own thing rather than mixed into the active WIP. */}
      {backlog.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-sm font-medium text-concrete">Backlog ({backlogF.length})</h2>
            <span className="text-xs text-rebar">awarded, not started — booked future work</span>
            <span className="ml-auto text-xs tabular-nums text-rebar">
              <span className="text-concrete">{money(backlogTotals.contract)}</span> contract ·{" "}
              <span className="text-ok">{money(backlogTotals.operatingProfit)}</span> est. profit
            </span>
          </div>
          <div className="rounded-lg border border-line divide-y divide-line overflow-hidden">
            {backlogF.map((r) => (
              <div
                key={r.id}
                onClick={() => setChooser(r)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-graphite/60 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline min-w-0"><span className="text-sm font-medium text-concrete truncate">{r.name || "—"}</span><SpecialtyTag types={r.specialtyTypes} /></div>
                  <div className="text-xs text-rebar mt-0.5">{r.projectId || "no ID"}{r.gc?.length ? ` · ${r.gc.join(", ")}` : ""}</div>
                </div>
                <div className="ml-auto flex items-center gap-8 shrink-0 text-sm tabular-nums text-right">
                  <div className="w-24"><div className="text-concrete">{money(r.contract)}</div><div className="text-[11px] text-rebar">contract</div></div>
                  <div className="w-20"><div className="text-ok">{money(r.operatingProfit)}</div><div className="text-[11px] text-rebar">{pct(r.operatingMargin)} margin</div></div>
                </div>
              </div>
            ))}
            {backlogF.length === 0 && <div className="px-4 py-6 text-center text-rebar text-sm">No backlog jobs match this search.</div>}
          </div>
        </div>
      )}

      {closed.length > 0 && (
        <div className="rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
          <button onClick={() => setShowClosed((o) => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-graphite/30">
            <span className={`text-rebar text-xs transition-transform ${showClosed ? "rotate-90" : ""}`}>▸</span>
            <span className="text-sm text-concrete font-medium">Closed jobs</span>
            <span className="text-xs text-rebar">completed — realized profit earned</span>
            <span className="ml-auto flex items-center gap-4 text-xs tabular-nums">
              <span className="text-rebar">{closedTotals.jobs} job{closedTotals.jobs === 1 ? "" : "s"}</span>
              <span className="text-concrete">{money(closedTotals.contract)} contract</span>
              <span className="text-ok font-medium">{money(closedTotals.operatingProfit)} profit</span>
            </span>
          </button>
          {showClosed && (
            <div className="border-t border-line divide-y divide-line" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-rebar/70">
                <span>Job</span>
                <span className="ml-auto flex items-center gap-8 shrink-0 text-right">
                  <span className="w-24">Contract</span>
                  <span className="w-20">Profit</span>
                </span>
              </div>
              {(q ? closedF : closed).map((r) => (
                <div
                  key={r.id}
                  onClick={() => setChooser(r)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-graphite/40 cursor-pointer text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-concrete">{r.name || "—"}</span>
                    <span className="text-xs text-rebar ml-2">{r.projectId || ""}{r.gc?.length ? ` · ${r.gc.join(", ")}` : ""}</span>
                  </div>
                  <span className="ml-auto flex items-center gap-8 shrink-0 tabular-nums text-right">
                    <span className="w-24 text-concrete/80">{money(r.contract)}</span>
                    <span className="w-20 text-ok">{money(r.operatingProfit)}</span>
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
        Contract is the revised value including approved change orders. Profit is REALIZED (actually earned) on closed jobs, and the BID forecast on active/backlog jobs. Click any
        job to open its billing workspace.
      </p>
    {chooser && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setChooser(null)}>
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative w-full max-w-sm rounded-lg border border-line bg-graphite p-5" onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 text-sm font-semibold text-concrete truncate">{chooser.name || "Project"}</div>
          <div className="mb-4 text-xs text-rebar">{chooser.projectId || ""}{chooser.gc?.length ? ` · ${chooser.gc.join(", ")}` : ""}</div>
          <div className="space-y-2">
            <a href={`/billing/${chooser.id}`} className="block rounded-md border border-line px-4 py-2.5 text-sm text-concrete hover:bg-steel">
              <span className="font-medium">Billing</span>
              <span className="block text-xs text-rebar mt-0.5">Invoices, payments, retention</span>
            </a>
            <a href={`/projects/${chooser.id}`} className="block rounded-md border border-line px-4 py-2.5 text-sm text-concrete hover:bg-steel">
              <span className="font-medium">Project</span>
              <span className="block text-xs text-rebar mt-0.5">Scope, schedule, site, hours</span>
            </a>
            {chooser.relatedBidId ? (
              <a href={`/pipeline/${chooser.relatedBidId}`} className="block rounded-md border border-line px-4 py-2.5 text-sm text-concrete hover:bg-steel">
                <span className="font-medium">Bid</span>
                <span className="block text-xs text-rebar mt-0.5">The estimate this job came from</span>
              </a>
            ) : (
              <div className="rounded-md border border-line px-4 py-2.5 text-sm text-rebar/60">
                <span className="font-medium">Bid</span>
                <span className="block text-xs mt-0.5">No linked bid</span>
              </div>
            )}
          </div>
          <button onClick={() => setChooser(null)} className="mt-4 w-full text-xs text-rebar hover:text-concrete py-1">Cancel</button>
        </div>
      </div>
    )}
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
