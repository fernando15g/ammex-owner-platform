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
  const { rows, totals, health, allProjects = [] } = data;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [invoicePick, setInvoicePick] = useState(false);
  const active = rows.filter((r) => r.hasBilling);
  const { sorted: activeSorted, sort, toggle } = useSort(active, "name", "asc", "billing");
  const sortById = (a, b) => String(a.projectId || "~").localeCompare(String(b.projectId || "~"), undefined, { numeric: true });
  const searchList = [...rows].sort(sortById).filter((r) => {
    if (q.trim() === "") return true;
    const hay = `${r.name || ""} ${r.projectId || ""} ${(r.gc || []).join(" ")}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  return (
    <div>
      {invoicePick && <InvoicePickerModal projects={allProjects} onClose={() => setInvoicePick(false)} />}
      {health?.ok && health.counts.warnings > 0 && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 mb-4">
          <p className="text-sm text-concrete">
            <span className="font-medium">{health.counts.warnings} thing{health.counts.warnings === 1 ? "" : "s"} worth a look.</span>{" "}
            <span className="text-rebar">Nothing is broken — but something doesn&apos;t add up the way you&apos;d expect.</span>
          </p>
          <ul className="text-xs text-rebar mt-1.5 list-disc pl-4 space-y-0.5">
            {health.warnings.slice(0, 3).map((w, i) => <li key={i}>{w.message}</li>)}
            {health.warnings.length > 3 && <li>…and {health.warnings.length - 3} more.</li>}
          </ul>
          <a href="/check" className="text-xs text-info hover:underline mt-1.5 inline-block">See the full reconciliation →</a>
        </div>
      )}

      {health && !health.ok && (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 mb-4">
          <p className="text-sm text-concrete">
            <span className="font-medium">The books don&apos;t add up.</span>{" "}
            {health.counts.errors} problem{health.counts.errors === 1 ? "" : "s"} found — an invoice and its line
            items disagree somewhere, so a number on this page may be wrong.
          </p>
          <ul className="text-xs text-rebar mt-1.5 list-disc pl-4 space-y-0.5">
            {health.errors.slice(0, 3).map((e, i) => <li key={i}>{e.message}</li>)}
            {health.errors.length > 3 && <li>…and {health.errors.length - 3} more.</li>}
          </ul>
          <a href="/check" className="text-xs text-info hover:underline mt-1.5 inline-block">See the full reconciliation →</a>
        </div>
      )}

      {/* Find a project — scrollable, sorted by ID, includes closed (dimmed) */}
      <div className="flex items-start gap-2 mb-4">
      <div className="relative max-w-md flex-1">
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
      <button onClick={() => setInvoicePick(true)} className="text-sm px-3 py-2 rounded-md font-medium bg-safety text-steel whitespace-nowrap">+ Invoice</button>
      <a href="/api/billing/reports/due-billings" title="Download the DUE BILLINGS report as Excel — every job's invoices, payments, and what's still due, plus the retention billings section. Two tabs: the full ledger and open items only." className="text-sm px-3 py-2 rounded-md font-medium bg-info text-white whitespace-nowrap flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>
        Due billings report
      </a>
      </div>

      {/* Portfolio A/R summary — retention is split out so nothing double-counts:
          collect-now + retention held = total owed. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <Stat label="Outstanding (collect now)" value={money(Math.max(totals.outstanding - totals.retention, 0))} accent />
        <Stat label="Retention held" value={money(totals.retention)} />
        <Stat label="Total owed to you" value={money(totals.outstanding)} />
        <Stat label="Overdue" value={money(totals.overdueTotal)} tone={totals.overdueTotal > 0 ? "danger" : "ok"} />
        <Stat label="Remaining to bill" value={money(totals.remainingToBill)} />
      </div>

      {/* Aging strip */}
      <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
        <p className="text-[11px] uppercase tracking-wider text-rebar mb-3">Aging — total owed by age (includes retention)</p>
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
              <SortHeader label="Owed" sortKey="billing.outstanding" sort={sort} toggle={toggle} align="right" />
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

// The "+ Invoice" picker: all projects, searchable. Selecting one routes to the
// invoice flow if it has a bid sheet, or to CREATE the sheet first if it doesn't
// — so a missing sheet is a detour, never a dead-end.
function routeForInvoice(p) {
  if (p.hasSheet) return `/billing/${p.id}/new-bill`;
  if (p.bidId) return `/pipeline/${p.bidId}/sheet`;
  return `/projects/${p.id}`;
}

function InvoicePickerModal({ projects, onClose }) {
  const [q, setQ] = useState("");
  const list = projects.filter((p) => {
    if (q.trim() === "") return true;
    const hay = `${p.name || ""} ${p.projectId || ""} ${(p.gc || []).join(" ")}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-10 overflow-y-auto" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-lg border border-line shadow-2xl" style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <p className="text-sm font-medium text-concrete">Start an invoice</p>
          <button onClick={onClose} className="ml-auto text-rebar hover:text-concrete" aria-label="Close">✕</button>
        </div>
        <div className="p-4">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects…"
            className="w-full text-sm px-3 py-2 rounded-md border border-line bg-transparent text-concrete focus:outline-none focus:border-rebar mb-2"
          />
          <div className="rounded-lg border border-line overflow-y-auto" style={{ maxHeight: "22rem" }}>
            {list.map((p) => (
              <button
                key={p.id}
                onClick={() => { window.location.href = routeForInvoice(p); }}
                className="w-full text-left px-3 py-2.5 hover:bg-graphite/60 border-b border-line last:border-b-0 flex items-baseline gap-2"
              >
                <span className="text-sm text-concrete">{p.name || "—"}</span>
                <span className="text-xs text-rebar">{p.projectId || ""}{p.gc?.length ? ` · ${p.gc.join(", ")}` : ""}</span>
                {!p.hasSheet && (
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full border border-warn/50 text-warn whitespace-nowrap shrink-0">needs bid sheet</span>
                )}
              </button>
            ))}
            {list.length === 0 && <div className="px-3 py-6 text-center text-sm text-rebar">No projects match.</div>}
          </div>
          <p className="text-[11px] text-rebar mt-2">Pick a project to invoice. One without a bid sheet takes you to create it first.</p>
        </div>
      </div>
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
