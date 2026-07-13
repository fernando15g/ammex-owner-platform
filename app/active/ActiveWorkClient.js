"use client";

// =============================================================================
// ACTIVE WORK — first real zone (spec §7.3). Procore-inspired: scannable table
// of running jobs (Mobilizing + Active + Punchlist), worst-burn-first, click a
// row to open a detail panel. The panel doubles as a data-verification tool —
// every number the spine feeds a project, shown for one job at a time.
// =============================================================================

import { useState } from "react";
import { useSort, SortHeader } from "@/app/components/Sortable";
import ProjectDetailsModal from "@/app/projects/ProjectDetailsModal";
import { useEffect } from "react";
import StagePath from "@/app/components/StagePath";

// ---- formatters ----
const money = (n) =>
  typeof n !== "number" ? "—" : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;
const pct = (f) => (typeof f === "number" ? `${Math.round(f * 100)}%` : "—");
const lbs = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
const num = (n, d = 0) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "—");
const dateStr = (s) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

const SEV = {
  danger: { dot: "bg-danger", text: "text-danger", label: "Over pace" },
  warn: { dot: "bg-warn", text: "text-warn", label: "Tight" },
  ok: { dot: "bg-ok", text: "text-ok", label: "On pace" },
  mobilizing: { dot: "bg-info", text: "text-info", label: "Mobilizing" },
  "no-bid": { dot: "bg-rebar", text: "text-rebar", label: "No bid linked" },
};

export default function ActiveWorkClient({ data }) {
  const [selected, setSelected] = useState(null);
  const { rows, counts, backlog = [] } = data;
  const { sorted, sort, toggle } = useSort(rows, "name", "asc", "active");
  const [detailsFor, setDetailsFor] = useState(null);

  // Keep your place. Going to look at something and coming back shouldn't cost
  // you the project you were already reading. Session-scoped on purpose: a fresh
  // visit tomorrow starts clean rather than shoving a project at you.
  useEffect(() => {
    try {
      const id = sessionStorage.getItem("ammex-active-selected");
      if (id) {
        const row = rows.find((r) => r.id === id);
        if (row) setSelected(row);
      }
    } catch {}
  }, [rows]);

  useEffect(() => {
    try {
      if (selected?.id) sessionStorage.setItem("ammex-active-selected", selected.id);
      else sessionStorage.removeItem("ammex-active-selected");
    } catch {}
  }, [selected]);
  const [backlogOpen, setBacklogOpen] = useState(false);

  return (
    <div>
      {/* Metrics sit above BOTH columns, so the table and the detail panel
          start on the same line. */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-4 text-sm">
        <Metric label="Running jobs" value={counts.total} />
        <Metric label="Mobilizing" value={counts.mobilizing} />
        <Metric label="Over pace" value={counts.atRisk} tone={counts.atRisk > 0 ? "danger" : "ok"} />
      </div>

      {/* BACKLOG — contracted work not yet performed. The industry term, and a
          real business metric (it's your booked future revenue), so the header
          carries the value, not just a count. Collapsed by default: it's context,
          not the main event — but the count and value stay visible so a job can't
          quietly rot here unnoticed. */}
      {backlog.length > 0 && (() => {
        const value = backlog.reduce((a, b) => a + (b.contractValue || 0), 0);
        return (
          <div className="rounded-lg border border-line mb-5 overflow-hidden" style={{ background: "var(--surface)" }}>
            <button
              onClick={() => setBacklogOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-graphite/30"
            >
              <span className={`text-rebar text-xs transition-transform ${backlogOpen ? "rotate-90" : ""}`}>▸</span>
              <span className="text-sm text-concrete font-medium">Backlog</span>
              <span className="text-xs text-rebar">awarded, not yet started</span>
              <span className="ml-auto flex items-center gap-3 text-xs">
                <span className="text-rebar">{backlog.length} job{backlog.length === 1 ? "" : "s"}</span>
                {value > 0 && <span className="text-concrete tabular-nums font-medium">${Math.round(value).toLocaleString()}</span>}
              </span>
            </button>

            {backlogOpen && (
              <div className="border-t border-line divide-y divide-line" style={{ background: "var(--surface-2)" }}>
                {backlog.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3 hover:bg-graphite/40">
                    {/* the project, not billing — there's nothing to bill on a job
                        that hasn't started */}
                    <a href={`/projects/${b.id}`} className="text-sm text-concrete hover:text-safety truncate">{b.name}</a>
                    <span className="text-xs text-rebar truncate">
                      {[b.projectId, b.gc?.length ? b.gc.join(", ") : null].filter(Boolean).join(" · ")}
                    </span>
                    {!b.hasBid && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-warn/50 text-warn whitespace-nowrap">no bid</span>
                    )}
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      {typeof b.contractValue === "number" && (
                        <span className="text-xs text-concrete/70 tabular-nums">${Math.round(b.contractValue).toLocaleString()}</span>
                      )}
                      <button onClick={() => setDetailsFor(b.id)} className="text-[11px] px-2 py-0.5 rounded border border-line text-rebar hover:text-concrete">Details</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="lg:flex lg:gap-6">
      {/* Table — scrolls sideways when the window is too narrow for every column */}
      <div className="flex-1 min-w-0">
        <div className="rounded-lg border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
                <SortHeader label="Project" sortKey="name" sort={sort} toggle={toggle} className="px-4" />
                <SortHeader label="Status" sortKey="status" sort={sort} toggle={toggle} className="hidden sm:table-cell" />
                <SortHeader label="Hours" sortKey="payrollHours" sort={sort} toggle={toggle} align="right" />
                <SortHeader label="Placed" sortKey="placedLbs" sort={sort} toggle={toggle} align="right" className="hidden md:table-cell" />
                <SortHeader label="Forecast" sortKey="forecastLbsPerMH" sort={sort} toggle={toggle} align="right" className="px-4" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const sev = SEV[r.burn.severity] || SEV.ok;
                const isSel = selected?.id === r.id;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`border-t border-line cursor-pointer transition-colors ${isSel ? "bg-steel" : "hover:bg-graphite/60"}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-concrete flex items-center gap-2">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                        <span className="truncate">{r.name || "—"}</span>
                        {r.multiBid && <span className="text-[10px] text-warn border border-warn/40 rounded px-1">multi-bid</span>}
                      </div>
                      <div className="text-xs text-rebar mt-0.5 pl-3.5">
                        {r.projectId || "no ID"}{r.foreman?.length ? ` · ${r.foreman.join(", ")}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell">
                      <StatusPill status={r.status} sev={r.burn.severity} />
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {r.burn.hoursPct != null ? (
                        <span className={sev.text}>{pct(r.burn.hoursPct)}</span>
                      ) : (
                        <span className="text-rebar">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell">
                      {pct(r.placedFraction)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.burn.forecastable ? (
                        <span className={`font-semibold ${sev.text}`}>→ {pct(r.burn.forecastPct)}</span>
                      ) : (
                        <span className="text-rebar text-xs">{SEV[r.burn.severity]?.label || "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-rebar">No running jobs right now.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-rebar mt-3">
          Forecast = on pace to finish at this % of budgeted hours (hours spent ÷ steel placed). Mobilizing jobs show
          staging hours before much is placed — expected, not an alarm.
        </p>
      </div>

      {/* Detail panel */}
      <div className="lg:w-[30rem] xl:w-[34rem] shrink-0 mt-6 lg:mt-0">
        {selected ? (
          <DetailPanel row={selected} onClose={() => setSelected(null)} onEdit={() => setDetailsFor(selected.id)} />
        ) : (
          <div className="rounded-lg border border-dashed border-line p-6 text-sm text-rebar text-center lg:sticky lg:top-24">
            Select a job to inspect its full data.
          </div>
        )}
      </div>
      </div>

      {detailsFor && (
        <ProjectDetailsModal projectId={detailsFor} onClose={() => setDetailsFor(null)} />
      )}
    </div>
  );
}

function Metric({ label, value, tone }) {
  const c = tone === "danger" ? "text-danger" : tone === "ok" ? "text-concrete" : "text-concrete";
  return (
    <div>
      <span className={`text-xl font-semibold ${c}`}>{value}</span>
      <span className="text-rebar ml-2">{label}</span>
    </div>
  );
}

function StatusPill({ status, sev }) {
  const s = SEV[sev] || SEV.ok;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 bg-steel border border-line ${s.text}`}>
      {status || "—"}
    </span>
  );
}

function DetailPanel({ row, onClose, onEdit }) {
  const d = row.detail;
  const f = d.financials;
  return (
    <div className="rounded-lg border border-line bg-graphite lg:sticky lg:top-24 overflow-hidden">
      <div className="px-6 py-5 border-b border-line flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-concrete truncate">{row.name}</h2>
          <p className="text-sm text-rebar mt-1">{row.projectId} · {row.status}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button onClick={onEdit} className="text-xs px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite">Edit</button>
          <button onClick={onClose} className="text-rebar hover:text-concrete text-sm px-1" aria-label="Close">✕</button>
        </div>
      </div>

      <div className="px-6 py-4 border-b border-line">
        <StagePath
          status={row.status}
          projectId={row.id}
          compact
          onChanged={() => window.location.reload()}
        />
      </div>

      <div className="p-6 space-y-6 text-sm">
        <Section title="Burn">
          <Row label="Bid hours" value={num(row.burn.projectedHours)} />
          <Row label="Logged hours" value={num(row.burn.actualHours)} sub={d.hoursEra === "payroll" ? "payroll-era" : d.hoursEra === "timesheet" ? "from timecards" : null} />
          <Row label="Hours consumed" value={pct(row.burn.hoursPct)} />
          <Row label="Forecast finish" value={row.burn.forecastable ? `${pct(row.burn.forecastPct)} of budget` : "not enough placed"} />
        </Section>

        <Section title="Placement">
          <Row label="Awarded lbs" value={lbs(row.awardedLbs)} />
          <Row label="Installed lbs" value={lbs(row.placedLbs)} sub={row.placementAsOf ? `as of ${dateStr(row.placementAsOf)}` : "not updated"} />
          <Row label="Placed" value={pct(row.placedFraction)} />
          <Row label="Bid productivity" value={row.bidProductivity != null ? `${num(row.bidProductivity)} lbs/MH` : "—"} />
        </Section>

        <Section title="Contract">
          <Row label="Contract value" value={money(row.contractValue)} />
          <Row label="Operating profit" value={money(row.operatingProfit)} sub="expected (bid)" />
          <Row label="Operating margin" value={pct(row.operatingMargin)} />
          <Row label="Bid rate" value={d.bidRate != null ? `$${d.bidRate}/lb` : "—"} />
        </Section>

        <Section title="Financials (spine — fills as billing comes online)">
          <Row label="Installed lbs" value={lbs(f.installedLbs)} />
          <Row label="Billable lbs" value={lbs(f.billableLbs)} sub="not yet tracked" />
          <Row label="Billed lbs" value={lbs(f.billedLbs)} sub="not yet tracked" />
          <Row label="Unbilled in field" value={f.unbilledInstalledLbs != null ? lbs(f.unbilledInstalledLbs) : "—"} />
          <Row label="Remaining contract lbs" value={lbs(f.remainingContractLbs)} />
        </Section>

        <Section title="Job">
          <Row label="Actual start" value={dateStr(d.actualStartDate)} />
          <Row label="Foreman" value={row.foreman?.length ? row.foreman.join(", ") : "—"} />
          <Row label="GC" value={d.gc?.length ? d.gc.join(", ") : "—"} />
          <Row label="Fabricator" value={d.fabricator?.length ? d.fabricator.join(", ") : "—"} />
          <Row label="Type" value={d.projectType?.length ? d.projectType.join(", ") : "—"} />
          <Row label="Location" value={d.cityCounty || "—"} />
          <Row label="Timecards" value={num(d.timecardCount)} />
        </Section>
        {d.scope && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">Scope</p>
            <p className="text-concrete/80 text-sm leading-relaxed">{d.scope}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-rebar mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value, sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-rebar">{label}</span>
      <span className="text-concrete text-right tabular-nums">
        {value}
        {sub && <span className="block text-[11px] text-rebar/70">{sub}</span>}
      </span>
    </div>
  );
}
