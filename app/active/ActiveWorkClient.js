"use client";

// =============================================================================
// ACTIVE WORK — first real zone (spec §7.3). Procore-inspired: scannable table
// of running jobs (Mobilizing + Active + Punchlist), worst-burn-first, click a
// row to open a detail panel. The panel doubles as a data-verification tool —
// every number the spine feeds a project, shown for one job at a time.
// =============================================================================

import { useState } from "react";

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
  const { rows, counts } = data;

  return (
    <div className="lg:flex lg:gap-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="ml-auto" />
        <a href="/projects/new" className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">+ New project</a>
      </div>

      {/* Table */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-x-6 gap-y-1 mb-4 text-sm">
          <Metric label="Running jobs" value={counts.total} />
          <Metric label="Mobilizing" value={counts.mobilizing} />
          <Metric label="Over pace" value={counts.atRisk} tone={counts.atRisk > 0 ? "danger" : "ok"} />
        </div>

        <div className="rounded-lg border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Project</th>
                <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Status</th>
                <th className="text-right font-medium px-3 py-2.5">Hours</th>
                <th className="text-right font-medium px-3 py-2.5 hidden md:table-cell">Placed</th>
                <th className="text-right font-medium px-4 py-2.5">Forecast</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
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
      <div className="lg:w-96 shrink-0 mt-6 lg:mt-0">
        {selected ? (
          <DetailPanel row={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="rounded-lg border border-dashed border-line p-6 text-sm text-rebar text-center lg:sticky lg:top-24">
            Select a job to inspect its full data.
          </div>
        )}
      </div>
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

function DetailPanel({ row, onClose }) {
  const d = row.detail;
  const f = d.financials;
  return (
    <div className="rounded-lg border border-line bg-graphite lg:sticky lg:top-24 overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-start gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-concrete truncate">{row.name}</h2>
          <p className="text-xs text-rebar mt-0.5">{row.projectId} · {row.status}</p>
        </div>
        <button onClick={onClose} className="ml-auto text-rebar hover:text-concrete text-sm">✕</button>
      </div>

      <div className="p-5 space-y-5 text-sm">
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
