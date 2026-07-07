"use client";

// Pipeline — in-flight bids list. Procore-style scannable table. Shows raw and
// confidence-weighted totals up top; each bid's due date, status, GC, value.

const money = (n) => (typeof n !== "number" ? "—" : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);
const pct = (f) => (typeof f === "number" ? `${Math.round(f * 100)}%` : "—");
const dateStr = (s) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

function daysUntil(s) {
  if (!s) return null;
  const d = Math.ceil((new Date(s) - new Date()) / 86400000);
  return d;
}

export default function PipelineClient({ data }) {
  const { rows, totals } = data;
  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-5">
        <Stat label={`In flight (${totals.count} bids)`} value={money(totals.raw)} />
        <Stat label="Risk-weighted" value={money(totals.weighted)} accent />
        <Stat label="Raw tons" value={typeof totals.rawTons === "number" ? Math.round(totals.rawTons).toLocaleString() : "—"} />
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
            {rows.map((r) => {
              const d = daysUntil(r.bidDueDate);
              const urgent = d != null && d <= 3;
              const soon = d != null && d > 3 && d <= 7;
              return (
                <tr key={r.id} className="border-t border-line hover:bg-graphite/60">
                  <td className="px-4 py-3">
                    <div className="font-medium text-concrete truncate">{r.name || "—"}</div>
                    <div className="text-xs text-rebar mt-0.5">{r.gc?.length ? r.gc.join(", ") : "no GC"}{r.cityCounty ? ` · ${r.cityCounty}` : ""}</div>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    <span className="inline-block text-xs rounded-full px-2 py-0.5 bg-steel border border-line text-concrete/80">{r.status}</span>
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
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-rebar">No bids in flight. Click “+ New Bid” to add one.</td></tr>}
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
