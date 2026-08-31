"use client";
import { moneyShort, pct as pctFmt, rateCents } from "@/lib/format/numbers";

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
const money = (n) => moneyShort(n);
const pct = (f) => pctFmt(f);
import { fmtDateLocal } from "@/lib/format/dates";
const dateStr = (s) => fmtDateLocal(s, { month: "short", day: "numeric" });

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
  { key: "works", title: "In the works", hint: "actively estimating — not submitted yet", statuses: ["Reviewing", "Estimating", "Need Weights"] },
  { key: "live", title: "Live — chasing the award", hint: "waiting on the contract, or negotiating", statuses: ["Contingent", "Negotiating"] },
  { key: "submitted", title: "Submitted — awaiting decision", hint: "newest first — older ones are going cold", statuses: ["Submitted", "Follow Up"] },
];
const LIVE_ORDER = { Contingent: 0, Negotiating: 1 };

// Quiet per-status color cue — a small dot on the status pill so the pipeline
// reads at a glance. Warm = hot/blocked, blue = out for decision, green = won.
const STATUS_COLOR = {
  Contingent: "#ff6a13",    // hottest — waiting on the contract
  Negotiating: "#f0873a",   // warm — in play
  Submitted: "#2f73d8",     // out for decision
  "Follow Up": "#e0a63b",   // amber — going cold
  Reviewing: "#7c8899",     // neutral — pre-submission
  Estimating: "#7c8899",    // neutral — pre-submission
  "Need Weights": "#e5533c", // blocked
  Awarded: "#4a9e63",       // won
  Lost: "#5b6470",          // muted
  "No Bid": "#5b6470",      // muted
};

function buildGroups(rows, orderBy = null) {
  return GROUPS
    .map((g) => {
      const items = rows.filter((r) => g.statuses.includes(r.status));
      if (orderBy) items.sort((a, b) => (orderBy.get(a.id) ?? 0) - (orderBy.get(b.id) ?? 0));
      else if (g.key === "live") items.sort((a, b) => (LIVE_ORDER[a.status] - LIVE_ORDER[b.status]) || ((b.contractValue || 0) - (a.contractValue || 0)));
      else if (g.key === "submitted") items.sort(bySubmittedDesc);
      else if (g.key === "works") {
        const WORKS_ORDER = { Reviewing: 0, Estimating: 1, "Need Weights": 2 };
        items.sort((a, b) => (WORKS_ORDER[a.status] - WORKS_ORDER[b.status]) || (a.name || "").localeCompare(b.name || ""));
      }
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
  const [query, setQuery] = useState("");
  // Advanced filters: pick what you want on screen, and export EXACTLY that —
  // what you see is what you export, no separate export dialog to keep in sync.
  const BLANK_ADV = { gc: "", fabricator: "", detailer: "", cityCounty: "", dueFrom: "", dueTo: "", subFrom: "", subTo: "", valMin: "", valMax: "" };
  const [adv, setAdv] = useState(BLANK_ADV);
  const [advOpen, setAdvOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const advActive = Object.values(adv).some((v) => v !== "");
  const setA = (k, v) => setAdv((a) => ({ ...a, [k]: v }));
  const distinct = (get) => [...new Set(rows.flatMap(get).filter(Boolean))].sort();
  const opts = {
    gc: distinct((r) => r.gc || []),
    fabricator: distinct((r) => r.fabricator || []),
    detailer: distinct((r) => (r.detailer ? [r.detailer] : [])),
    cityCounty: distinct((r) => (r.cityCounty ? [r.cityCounty] : [])),
  };
  const advTest = (r) => {
    if (adv.gc && !(r.gc || []).includes(adv.gc)) return false;
    if (adv.fabricator && !(r.fabricator || []).includes(adv.fabricator)) return false;
    if (adv.detailer && r.detailer !== adv.detailer) return false;
    if (adv.cityCounty && !String(r.cityCounty || "").toLowerCase().includes(adv.cityCounty.trim().toLowerCase())) return false;
    if (adv.dueFrom && (!r.bidDueDate || r.bidDueDate < adv.dueFrom)) return false;
    if (adv.dueTo && (!r.bidDueDate || r.bidDueDate > adv.dueTo)) return false;
    if (adv.subFrom && (!r.submissionDate || r.submissionDate < adv.subFrom)) return false;
    if (adv.subTo && (!r.submissionDate || r.submissionDate > adv.subTo)) return false;
    if (adv.valMin && !(Number(r.contractValue) >= Number(adv.valMin))) return false;
    if (adv.valMax && !(Number(r.contractValue) <= Number(adv.valMax))) return false;
    return true;
  };
  const q = query.trim().toLowerCase();
  const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const searched = q
    ? rows.filter((r) => [r.name, r.project?.projectId, (r.gc || []).join(" "), (r.fabricator || []).join(" "), (r.projectType || []).join(" "), r.cityCounty, r.status].filter(Boolean).join(" ").toLowerCase().includes(q))
    : rows;
  const filtered = searched.filter(active.test).filter(advTest);
  const isFlight = filter === "flight";
  const { sorted: shown, sort, toggle, touched: sortTouched } = useSort(filtered, "bidDueDate", "asc", "bids");
  // Sorting the grouped in-flight view sorts WITHIN each stage (keeps hottest on
  // top). Until a header is clicked, groups keep their default order. We reuse
  // the exact useSort comparator by ordering group items to match `shown`.
  const toggleSort = toggle;
  const orderBy = sortTouched ? new Map(shown.map((r, i) => [r.id, i])) : null;
  const groups = buildGroups(filtered, orderBy);
  const flightSort = sortTouched ? sort : { key: null, dir: "asc" };
  // Chip counts: normally the raw stage counts; once filters/search are active,
  // the count becomes "matches in that stage" — so an empty view tells you at a
  // glance which chip the matches are hiding under instead of looking broken.
  const filterActive = advActive || q !== "";
  const matchBase = searched.filter(advTest);
  const countOf = (f) => (filterActive ? matchBase : rows).filter(f.test).length;
  // Filters on + nothing here -> say where the matches went instead of a bare table.
  const elsewhere = filterActive && filtered.length === 0
    ? FILTERS.filter((f) => f.key !== filter && f.key !== "all" && countOf(f) > 0)
    : [];
  // Export what is on screen, in the on-screen order.
  const visibleOrdered = isFlight ? groups.flatMap((g) => g.items) : shown;
  const exportIds = visibleOrdered.map((r) => r.id).join(",");
  const exportExcel = () => { window.location.href = `/api/bids/export?ids=${exportIds}`; };
  const exportPrint = () => { window.open(`/pipeline/print?ids=${exportIds}`, "_blank"); };

  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mb-5">
        <Stat label={`In flight (${totals.count} bids)`} value={money(totals.raw)} />
        <Stat label="Risk-weighted" value={money(totals.weighted)} accent />
        <Stat label="Raw weight" value={lbsStr(lbsOf(totals.rawTons))} sub={tonsStr(totals.rawTons)} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
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
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bids by name, GC, or fabricator"
          className="ml-auto w-full sm:w-64 text-sm px-3 py-1.5 rounded-md border border-line bg-transparent text-concrete placeholder:text-rebar/60 focus:outline-none focus:border-rebar"
        />
        <button onClick={() => setAdvOpen((o) => !o)} className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${advActive ? "border-safety text-safety" : "border-line text-rebar hover:text-concrete"}`}>
          Filters{advActive ? " ·" : ""}
        </button>
        <div className="relative">
          <button onClick={() => setExportOpen((o) => !o)} className="text-xs px-3 py-1.5 rounded-md border border-line text-rebar hover:text-concrete">Export ▾</button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 mt-1 z-20 w-40 rounded-md border border-line bg-graphite shadow-lg overflow-hidden">
                <button onClick={() => { setExportOpen(false); exportExcel(); }} className="w-full text-left text-xs px-3 py-2 text-concrete/80 hover:bg-steel">Excel spreadsheet</button>
                <button onClick={() => { setExportOpen(false); exportPrint(); }} className="w-full text-left text-xs px-3 py-2 text-concrete/80 hover:bg-steel border-t border-line">Print / PDF</button>
              </div>
            </>
          )}
        </div>
      </div>

      {advOpen && (
        <div className="rounded-lg border border-line p-3 mb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5" style={{ background: "var(--surface)" }}>
          <AdvSelect label="GC" value={adv.gc} options={opts.gc} onChange={(v) => setA("gc", v)} />
          <AdvSelect label="Fabricator" value={adv.fabricator} options={opts.fabricator} onChange={(v) => setA("fabricator", v)} />
          <AdvSelect label="Detailer" value={adv.detailer} options={opts.detailer} onChange={(v) => setA("detailer", v)} />
          <label className="block">
            <span className="text-[10px] text-rebar block mb-1">City / County</span>
            <input type="text" value={adv.cityCounty} onChange={(e) => setA("cityCounty", e.target.value)} placeholder="type to match — e.g. phoe" className="inp-sm w-full" />
          </label>
          <div className="block">
            <span className="text-[10px] text-rebar block mb-1">Value $ (min – max)</span>
            <div className="grid grid-cols-2 gap-1.5">
              <input type="text" inputMode="numeric" value={adv.valMin} onChange={(e) => setA("valMin", e.target.value)} placeholder="min" className="inp-sm w-full min-w-0" />
              <input type="text" inputMode="numeric" value={adv.valMax} onChange={(e) => setA("valMax", e.target.value)} placeholder="max" className="inp-sm w-full min-w-0" />
            </div>
          </div>
          <AdvDates label="Bid due" from={adv.dueFrom} to={adv.dueTo} onFrom={(v) => setA("dueFrom", v)} onTo={(v) => setA("dueTo", v)} />
          <AdvDates label="Submitted" from={adv.subFrom} to={adv.subTo} onFrom={(v) => setA("subFrom", v)} onTo={(v) => setA("subTo", v)} />
          <div className="flex items-center gap-3 col-span-full pt-1 border-t border-line mt-1">
            <span className="text-xs text-rebar">{filtered.length} of {rows.length} shown</span>
            {advActive && <button onClick={() => setAdv(BLANK_ADV)} className="text-xs text-safety hover:underline">Clear filters</button>}
          </div>
        </div>
      )}

      {isFlight ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="rounded-lg border border-line overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[150px] hidden sm:table-column" />
                  <col className="w-[90px] hidden md:table-column" />
                  <col className="w-[90px] hidden md:table-column" />
                  <col className="w-[100px]" />
                  <col className="w-[80px] hidden lg:table-column" />
                </colgroup>
                {/* title sits on the left of the header row; column labels on the right */}
                <thead>
                  <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider border-b border-line">
                    <th className="px-4 py-2.5 text-left align-middle">
                      <span className="text-concrete font-semibold tracking-wider">{g.title}</span>
                      <span className="text-rebar/70 ml-2 normal-case">· {g.items.length}</span>
                    </th>
                    <SortHeader label="Status" sortKey="status" sort={flightSort} toggle={toggleSort} align="center" className="hidden sm:table-cell" />
                    <SortHeader label="Bid due" sortKey="bidDueDate" sort={flightSort} toggle={toggleSort} className="hidden md:table-cell" />
                    <SortHeader label="Bid ¢" sortKey="bidRate" sort={flightSort} toggle={toggleSort} align="right" className="hidden md:table-cell" />
                    <SortHeader label="Value" sortKey="contractValue" sort={flightSort} toggle={toggleSort} align="right" />
                    <SortHeader label="Margin" sortKey="operatingMargin" sort={flightSort} toggle={toggleSort} align="right" className="hidden lg:table-cell px-4" />
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((r) => <BidRow key={r.id} r={r} first />)}
                </tbody>
              </table>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="rounded-lg border border-line px-4 py-10 text-center text-rebar">{elsewhere.length > 0
              ? <>No matches here — {elsewhere.map((f, i) => (
                  <span key={f.key}>{i > 0 ? " \u00b7 " : ""}<button onClick={() => setFilter(f.key)} className="text-safety hover:underline">{countOf(f)} in {f.label}</button></span>
                ))}</>
              : "No bids in flight. Click “+ New Bid” to add one."}</div>
          )}
        </div>
      ) : (
      <div className="rounded-lg border border-line overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col />
            <col className="w-[150px] hidden sm:table-column" />
            <col className="w-[90px] hidden md:table-column" />
            <col className="w-[90px] hidden md:table-column" />
            <col className="w-[100px]" />
            <col className="w-[80px] hidden lg:table-column" />
          </colgroup>
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider border-b border-line">
              <SortHeader label="Bid" sortKey="name" sort={sort} toggle={toggle} className="px-4" />
              <SortHeader label="Status" sortKey="status" sort={sort} toggle={toggle} align="center" className="hidden sm:table-cell" />
              <SortHeader label="Bid due" sortKey="bidDueDate" sort={sort} toggle={toggle} className="hidden md:table-cell" />
              <SortHeader label="Bid ¢" sortKey="bidRate" sort={sort} toggle={toggle} align="right" className="hidden md:table-cell" />
              <SortHeader label="Value" sortKey="contractValue" sort={sort} toggle={toggle} align="right" />
              <SortHeader label="Margin" sortKey="operatingMargin" sort={sort} toggle={toggle} align="right" className="hidden lg:table-cell px-4" />
            </tr>
          </thead>
          <tbody>
            {(
              <>
                {shown.map((r) => <BidRow key={r.id} r={r} />)}
                {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-rebar">{elsewhere.length > 0
                    ? <>No matches here — {elsewhere.map((f, i) => (
                        <span key={f.key}>{i > 0 ? " \u00b7 " : ""}<button onClick={() => setFilter(f.key)} className="text-safety hover:underline">{countOf(f)} in {f.label}</button></span>
                      ))}</>
                    : "No bids with this status."}</td></tr>}
              </>
            )}
          </tbody>
        </table>
      </div>
      )}
      <p className="text-xs text-rebar mt-3">
        Risk-weighted = each bid&apos;s value × its confidence by status. In-flight bids are grouped by stage, hottest on
        top; the date shown is when the bid was submitted.
      </p>
    </div>
  );
}

const ALL_STATUSES = ["Reviewing", "Estimating", "Need Weights", "Contingent", "Negotiating", "Submitted", "Follow Up", "Awarded", "Lost", "No Bid"];
const centsStr = (r) => rateCents(r);

function BidRow({ r }) {
  const [status, setStatus] = useState(r.status);
  const [busy, setBusy] = useState(false);
  const go = () => { window.location.href = `/pipeline/${r.id}`; };

  // Inline status change straight from the list — no need to open the bid.
  // Uses the same PATCH the detail page uses (keeps the Lost/No-Bid guard).
  const changeStatus = async (next) => {
    if (next === status) return;
    const prev = status;
    setStatus(next); setBusy(true); // optimistic
    try {
      const res = await fetch(`/api/bids/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: { status: next } }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Save failed");
      // let Notion settle, then refresh so the bid re-groups into its new section
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setStatus(prev); setBusy(false); // rollback
      alert(String(e.message || e));
    }
  };

  return (
    <tr className="border-t border-line hover:bg-graphite/60">
      <td className="px-4 py-3 cursor-pointer max-w-0" onClick={go}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium text-concrete truncate">{r.name || "—"}</span>
          {r.project?.projectId && (
            <span className="text-[10px] rounded-full px-1.5 py-0.5 border border-ok/40 text-ok shrink-0">{r.project.projectId}</span>
          )}
        </div>
        <div className="text-xs text-rebar mt-0.5">{r.gc?.length ? r.gc.join(", ") : "no GC"}{r.cityCounty ? ` · ${r.cityCounty}` : ""}</div>
      </td>
      <td className="px-3 py-3 hidden sm:table-cell whitespace-nowrap text-center">
        <div className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[status] || "#9aa3af" }} />
          <span className="relative inline-flex items-center">
            <select
              value={status}
              disabled={busy}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => changeStatus(e.target.value)}
              className="bg-steel border border-line rounded-full text-xs text-concrete/80 pl-2.5 pr-6 py-0.5 cursor-pointer hover:border-rebar focus:outline-none focus:border-rebar disabled:opacity-50 appearance-none"
            >
              {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {/* Real caret character (not a CSS background image, which was silently
                not rendering in some browsers). pointer-events-none so clicks fall
                through to the select underneath. */}
            <span className="pointer-events-none absolute right-2 text-concrete text-[10px] leading-none">▾</span>
          </span>
        </div>
        {status === "Awarded" && !r.project && (
          <div className="text-[10px] text-warn mt-1">needs project</div>
        )}
      </td>
      <td className="px-3 py-3 hidden md:table-cell text-concrete/80 cursor-pointer" onClick={go}>{dateStr(r.bidDueDate)}</td>
      <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell text-concrete/80 cursor-pointer" onClick={go}>{centsStr(r.bidRate)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-concrete cursor-pointer" onClick={go}>{money(r.contractValue)}</td>
      <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell text-concrete/80 cursor-pointer" onClick={go}>{pct(r.operatingMargin)}</td>
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

function AdvSelect({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-[10px] text-rebar block mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="inp-sm w-full">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function AdvDates({ label, from, to, onFrom, onTo }) {
  // Native date inputs refuse to shrink below their intrinsic width, so at
  // squeezed widths the pair overflowed its grid cell and overlapped the next.
  // Two columns of room below lg + min-w-0 lets them compress cleanly.
  return (
    <div className="block col-span-2 lg:col-span-1">
      <span className="text-[10px] text-rebar block mb-1">{label} (from – to)</span>
      <div className="grid grid-cols-2 gap-1.5">
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="inp-sm w-full min-w-0" />
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="inp-sm w-full min-w-0" />
      </div>
    </div>
  );
}
