"use client";

// =============================================================================
// PROJECT BILLING WORKSPACE — the admin's ONE place to work a project's money.
// See the full picture (contract, billed, paid, outstanding, retention, aging,
// unbilled-in-field), update installed pounds + contract settings, and log
// bills/payments/change-orders. Everything computed live from events.
// =============================================================================

import { useState } from "react";
import ProjectDetailsModal from "@/app/projects/ProjectDetailsModal";
import InfoTip from "@/app/components/InfoTip";

// Local YYYY-MM-DD (NOT toISOString — that uses UTC and can shift the day).
function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const money = (n) => (typeof n !== "number" ? "—" : n < 0 ? `-$${Math.abs(Math.round(n)).toLocaleString()}` : `$${Math.round(n).toLocaleString()}`);
const lbs = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");
const dateStr = (s) => {
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export default function ProjectBillingClient({ data }) {
  const b = data.billing;
  const carry = data.carryover || { open: 0, items: [], hasOpen: false };
  const [showAdd, setShowAdd] = useState(null); // 'Bill' | 'Payment' | 'Change Order' | null
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [evaOpen, setEvaOpen] = useState(true);
  const [editing, setEditing] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function refresh() { window.location.reload(); }

  async function deleteEvent(ev) {
    const label = ev.type === "Bill" ? `invoice ${ev.invoiceNumber || ""}` : ev.type.toLowerCase();
    const warn = ev.type === "Bill"
      ? `Delete ${label}?\n\nThis REVERSES its effects: the line quantities it billed roll back, so totals stay correct. The record is archived (recoverable in Notion).\n\nType DELETE to confirm.`
      : `Delete this ${label} (${money(ev.amount)})?\n\nThe record is archived (recoverable in Notion).\n\nType DELETE to confirm.`;
    const typed = window.prompt(warn);
    if (typed !== "DELETE") { if (typed != null) setErr("Delete cancelled - you must type DELETE exactly."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/billing/delete-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: ev.id }) });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      refresh();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  function editEvent(ev) { setEditing(ev); }

  async function saveEdit(ev, changes) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/billing/event/${ev.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      refresh();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  async function shortPay(ev) {
    const expected = (ev.amount || 0) - (ev.retentionWithheld || 0);
    const input = window.prompt(`Short pay on ${ev.invoiceNumber || "this bill"}\nExpected (net of retention): $${expected.toFixed(2)}\n\nEnter the amount ACTUALLY received:`);
    if (input == null) return;
    const paid = Number(String(input).replace(/[$,]/g, ""));
    if (isNaN(paid) || paid < 0) { setErr("Enter a valid dollar amount."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/billing/short-pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: ev.id, paidAmount: paid }) });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      refresh();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  return (
    <div className="max-w-6xl">

      {err && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">{err}</div>}

      {/* The money picture */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat tip="Total value of the job, including approved change orders." label="Contract value" value={money(b.revisedContract)} sub={(b.changeOrders || 0) + (b.coLinesValue || 0) > 0 ? `incl. ${money((b.changeOrders || 0) + (b.coLinesValue || 0))} change orders` : b.contractSource === "override" ? "overridden" : "from line items"} />
        <Stat tip="Work billed against the contract. Excludes any short-paid amount that rolled forward and was re-billed, so the same work isn't counted twice." label="Billed to date" value={money(b.billedToDate)} sub={b.rolledForward > 0 ? `${money(b.grossBilled)} invoiced · ${money(b.rolledForward)} rolled` : null} />
        <Stat tip="Payments received against those invoices." label="Paid to date" value={money(b.paidToDate)} />
        <Stat tip="Withheld until closeout. Earned, not yet collectable." label="Retention held" value={b.retentionEnabled ? money(b.retention) : "—"} sub={b.retentionEnabled ? null : "off"} />

        <Stat tip="Invoiced but not yet collected. Your current receivable." label="Outstanding" value={money(b.outstanding)} tone="attention" />
        <Stat tip="Contracted work not yet invoiced." label="Remaining to bill" value={money(b.remainingToBill)} tone="info" />

        {/* Short-pay balance appears above Status when there's an open carryover;
            otherwise Status stretches to fill the space (2 rows tall). */}
        {carry.hasOpen ? (
          <>
            <Stat tip="Underpaid work carried forward to the next invoice." label="Short-pay balance" value={money(carry.open)} sub="re-bills next invoice" tone="warn" />
            <Stat tip="Derived from contract, billing, and payment activity." label="Status" value={b.status} status />
          </>
        ) : (
          <div className="col-span-2 lg:col-span-2 rounded-lg border border-line px-4 py-3 flex flex-col justify-center" style={{ background: "var(--surface)" }}>
            <p className="text-[11px] text-rebar mb-1 leading-tight flex items-center gap-1">Status<InfoTip text="Derived from contract, billing, and payment activity." /></p>
            <p className="text-lg font-semibold text-concrete">{b.status}</p>
          </div>
        )}
      </div>

      {/* Short-pay carryover detail — which lines were adjusted */}
      {carry.hasOpen && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 mb-4 text-sm">
          <p className="text-concrete mb-1"><span className="font-medium">Short-pay carryover: {money(carry.open)}</span> — re-bills automatically within its line items on the next invoice.</p>
          {carry.items.map((it, i) => (
            <div key={i} className="text-xs text-rebar mt-1">
              {it.fromInvoice || "An invoice"}: billed {money(it.billedOriginal)}, received {money(it.received)} — {money(it.remaining)} still to re-bill.{" "}Weight rolled back:{" "}
              {it.lines.map((l) => {
                const line = (data.lines || []).find((x) => (l.lid && x.lineId === l.lid) || x.id === l.id);
                return `${line ? (line.itemNo || line.description) : "line"} −${lbs(l.qty)} lbs`;
              }).join(", ") || "no line detail"}
            </div>
          ))}
        </div>
      )}

      {/* Aging */}
      {b.outstanding > 0 && (
        <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
          <p className="text-[11px] uppercase tracking-wider text-rebar mb-3">Aging</p>
          <div className="grid grid-cols-5 gap-2 text-center text-sm">
            <div><p className="text-[11px] text-rebar">Current</p><p className="tabular-nums">{money(b.aging.current)}</p></div>
            <div><p className="text-[11px] text-rebar">1–30</p><p className={`tabular-nums ${b.aging.d1_30 > 0 ? "text-warn" : ""}`}>{money(b.aging.d1_30)}</p></div>
            <div><p className="text-[11px] text-rebar">31–60</p><p className={`tabular-nums ${b.aging.d31_60 > 0 ? "text-warn" : ""}`}>{money(b.aging.d31_60)}</p></div>
            <div><p className="text-[11px] text-rebar">61–90</p><p className={`tabular-nums ${b.aging.d61_90 > 0 ? "text-danger" : ""}`}>{money(b.aging.d61_90)}</p></div>
            <div><p className="text-[11px] text-rebar">90+</p><p className={`tabular-nums ${b.aging.d90_plus > 0 ? "text-danger" : ""}`}>{money(b.aging.d90_plus)}</p></div>
          </div>
        </div>
      )}

      {/* Contract + installed pounds settings */}
      <div className="rounded-lg border border-line mb-6" style={{ background: "var(--surface)" }}>
        <button onClick={() => setSettingsOpen((s) => !s)} className="w-full flex items-center justify-between px-4 py-3 text-sm">
          <span className="text-concrete font-medium">Contract & retention</span>
          <span className="flex items-baseline gap-2">
            <span className="text-concrete font-semibold text-base tabular-nums">{money(b.revisedContract)}</span>
            <span className="text-rebar text-xs">{settingsOpen ? "hide ▴" : "edit ▾"}</span>
          </span>
        </button>
        {settingsOpen && <SettingsPanel data={data} setBusy={setBusy} setErr={setErr} onSaved={refresh} busy={busy} />}
      </div>

      {b.retentionEnabled && <RetentionPanel data={data} b={b} refresh={refresh} setBusy={setBusy} setErr={setErr} busy={busy} />}

      {/* Log new event */}
      <div className="flex flex-wrap gap-2 mb-4">
        <a href={`/billing/${data.id}/new-bill`} className="text-sm px-4 py-2 rounded-md font-medium bg-safety text-steel">+ Invoice</a>
        {data.events?.some((e) => e.type === "Bill") && (
          <a href={`/api/billing/${data.id}/invoice`} title="Download the most recent invoice as an Excel file — same template you send the GC. For an earlier one, use Download on its row below." className="text-sm px-4 py-2 rounded-md font-medium bg-info text-white flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /></svg>
            Download latest invoice
          </a>
        )}
        <button onClick={() => setDetailsOpen(true)} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete ml-auto">Project details</button>
        <AddBtn label="+ Log a payment" onClick={() => setShowAdd("Payment")} />
        <AddBtn label="+ Change order" onClick={() => setShowAdd("CO")} />
      </div>
      {showAdd === "Payment" ? (
        <PaymentForm projectId={data.id} bills={data.events.filter((e) => e.type === "Bill" && (e.amount || 0) > 0)} events={data.events} onClose={() => setShowAdd(null)} onSaved={refresh} />
      ) : showAdd === "CO" ? (
        <ChangeOrderForm projectId={data.id} relatedBidId={data.relatedBidId} onClose={() => setShowAdd(null)} onSaved={refresh} />
      ) : showAdd ? (
        <AddEventForm type={showAdd} projectId={data.id} projectIdLabel={data.projectId} onClose={() => setShowAdd(null)} onSaved={refresh} />
      ) : null}

      {/* A $0 contract with no explanation is worse than an error. Say what's
          missing and offer the fix. */}
      {(!data.lines || data.lines.length === 0) && (
        <div className="rounded-lg border border-warn/50 bg-warn/10 p-4 mb-6">
          <p className="text-sm text-concrete font-medium mb-1">No bid sheet.</p>
          <p className="text-xs text-rebar mb-3">Line items define this project&apos;s contract value and are required to invoice.</p>
          <a
            href={data.relatedBidId ? `/pipeline/${data.relatedBidId}/sheet` : `/projects/${data.id}`}
            className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium inline-block"
          >
            {data.relatedBidId ? "Create bid sheet" : "Attach a bid first"}
          </a>
        </div>
      )}

      {/* Bid vs. billed — line-item progress against the bid */}
      {data.lines && data.lines.length > 0 && (() => {
        const rows = data.lines;
        const estTotal = rows.reduce((a, l) => a + (l.quantity || 0), 0);
        const actualTotal = rows.reduce((a, l) => a + (l.qtyToDate || 0), 0);
        const pct = estTotal > 0 ? (actualTotal / estTotal) * 100 : 0;
        return (
          <div className="rounded-lg border border-line mb-6" style={{ background: "var(--surface)" }}>
            <button onClick={() => setEvaOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-concrete font-medium">Bid vs. billed (by line item)</span>
              <span className="text-rebar text-xs flex items-center gap-3">
                <span>{lbs(actualTotal)} of {lbs(estTotal)} lbs billed · {pct.toFixed(1)}%</span>
                {data.relatedBidId && (
                  <span
                    onClick={(e) => { e.stopPropagation(); window.location.href = `/pipeline/${data.relatedBidId}/sheet`; }}
                    className="text-safety hover:underline underline-offset-2 cursor-pointer whitespace-nowrap"
                    title="Open this project's bid sheet to view or edit the line items"
                  >view bid sheet →</span>
                )}
                <span>{evaOpen ? "hide" : "show"}</span>
              </span>
            </button>
            {evaOpen && (
              <div className="px-4 pb-4 border-t border-line pt-3 overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 620 }}>
                  <thead><tr className="text-rebar text-[11px] uppercase tracking-wider">
                    {data.multiPhase && <th className="text-left font-medium px-2 py-1.5">Phase</th>}
                    <th className="text-left font-medium px-2 py-1.5">Item</th>
                    <th className="text-left font-medium px-2 py-1.5">Description</th>
                    <th className="text-right font-medium px-2 py-1.5">Bid est. (lbs)</th>
                    <th className="text-right font-medium px-2 py-1.5">Billed to date (lbs)</th>
                    <th className="text-right font-medium px-2 py-1.5">Diff (lbs)</th>
                    <th className="text-right font-medium px-2 py-1.5">% done</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((l) => {
                      const est = l.quantity || 0, act = l.qtyToDate || 0, diff = act - est;
                      const lp = est > 0 ? (act / est) * 100 : 0;
                      return (
                        <tr key={l.id} className="border-t border-line">
                          {data.multiPhase && <td className="px-2 py-1.5 text-rebar text-xs whitespace-nowrap">{l.phaseLabel || "—"}</td>}
                          <td className="px-2 py-1.5 text-concrete/70">{l.itemNo || "—"}</td>
                          <td className="px-2 py-1.5 text-concrete">{l.description}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-concrete/70">{lbs(est)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-concrete">{lbs(act)}</td>
                          <td className={`px-2 py-1.5 text-right tabular-nums text-xs ${diff > 0 ? "text-warn" : act === 0 ? "text-rebar/70" : diff < 0 ? "text-rebar" : "text-ok"}`}>{act === 0 ? "not billed" : diff > 0 ? `+${lbs(diff)} over bid` : diff < 0 ? `${lbs(Math.abs(diff))} left` : "on bid"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-concrete/80">{lp.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-line bg-graphite/40">
                      <td colSpan={data.multiPhase ? 3 : 2} className="px-2 py-2 text-xs text-rebar">TOTAL</td>
                      <td className="px-2 py-2 text-right tabular-nums text-concrete/70">{lbs(estTotal)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-concrete">{lbs(actualTotal)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums text-xs ${actualTotal - estTotal > 0 ? "text-warn" : "text-rebar"}`}>{actualTotal === 0 ? "not billed" : actualTotal - estTotal > 0 ? `+${lbs(actualTotal - estTotal)} over bid` : actualTotal < estTotal ? `${lbs(estTotal - actualTotal)} left` : "on bid"}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-concrete">{pct.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-rebar mt-2">Over bid = actual weights came in heavier than the bid (normal - weights are verified against the fabricator sheet). Left = still to bill on that line.</p>
              </div>
            )}
          </div>
        );
      })()}

      {editing && (
        <EditEventForm
          event={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(changes) => saveEdit(editing, changes)}
        />
      )}

      {detailsOpen && (
        <ProjectDetailsModal projectId={data.id} onClose={() => setDetailsOpen(false)} />
      )}

      {/* Event history */}
      <div className="rounded-lg border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium px-4 py-2.5 w-32">Type</th>
              <th className="text-left font-medium px-3 py-2.5 w-36">Invoice #</th>
              <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell w-32">Date</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Amount</th>
              <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">Notes</th>
              <th className="text-right font-medium px-4 py-2.5 w-64">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((e) => {
              const isInvoice = e.type === "Bill";
              const label = isInvoice ? "Invoice" : e.type;
              // short-pay adjustment stamp (invoice keeps its original amount)
              let adj = null;
              const am = String(e.notes || "").match(/\[adjust\](\{.*?\})\s*$/s);
              if (am) { try { adj = JSON.parse(am[1]); } catch {} }
              const wasShortPaid = isInvoice && !!adj;
              const paidAgainst = data.events.filter((p) => p.type === "Payment" && p.invoiceNumber && p.invoiceNumber === e.invoiceNumber).reduce((a, p) => a + (p.amount || 0), 0);
              const netDue = (e.amount || 0) - (e.retentionWithheld || 0);
              const isPaid = isInvoice && (wasShortPaid || (paidAgainst >= netDue - 0.005 && netDue > 0));
              const cleanNotes = String(e.notes || "").split("[snap]")[0].split("[carry]")[0].split("[adjust]")[0].replace(/\[short pay\][\s\S]*/, "").replace(/\[voided\][\s\S]*/, "").trim();
              return (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    <span className={`inline-block whitespace-nowrap text-xs rounded-full px-2 py-0.5 border ${e.type === "Payment" ? "text-ok border-ok/40" : e.type === "Change Order" ? "text-info border-info/40" : e.type === "Retention Bill" || e.type === "Retention Payment" ? "text-safety border-safety/40" : "text-concrete border-line"}`}>{label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-rebar whitespace-nowrap">{e.invoiceNumber || "—"}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell text-concrete/80 whitespace-nowrap">{dateStr(e.date)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-concrete whitespace-nowrap">
                    {money(e.amount)}
                    {adj && <span className="block text-[10px] text-warn">received {money(adj.received)} · {money(adj.rolledForward)} rolled</span>}
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-rebar text-xs align-top">
                    <div className="line-clamp-2 break-words leading-snug" title={`${e.dueDate ? `due ${dateStr(e.dueDate)} ` : ""}${cleanNotes}`.trim()}>
                      {e.dueDate ? `due ${dateStr(e.dueDate)}` : ""}{cleanNotes ? ` ${cleanNotes}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* status tag (past fact) OR short-pay action (only on unpaid invoices) */}
                      {wasShortPaid ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-warn/50 text-warn">short paid</span>
                      ) : isInvoice && !isPaid ? (
                        <button onClick={() => shortPay(e)} disabled={busy} className="text-[11px] px-2 py-0.5 rounded border border-warn/50 text-warn hover:bg-warn/10 disabled:opacity-40" title="They paid less than billed — record it and roll the difference to the next invoice">Short pay</button>
                      ) : null}
                      {isInvoice && (
                        <a href={`/api/billing/${data.id}/invoice?bill=${e.id}`} title="Download this invoice as an Excel file — same template you send the GC, ready to review and print/PDF from Excel" className="text-[11px] px-2 py-0.5 rounded border border-info/50 text-info hover:bg-info/10 whitespace-nowrap">Download</a>
                      )}
                      <button onClick={() => editEvent(e)} disabled={busy} className="text-[11px] px-2 py-0.5 rounded border border-line text-rebar hover:text-concrete disabled:opacity-40">Edit</button>
                      <button onClick={() => deleteEvent(e)} disabled={busy} className="text-[11px] px-2 py-0.5 rounded border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40">Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.events.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-rebar">No events yet. Create the first invoice above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsPanel({ data, setBusy, setErr, onSaved, busy }) {
  const [s, setS] = useState({
    billingContractValue: data.settings.billingContractValue ?? "",
    retentionEnabled: !!data.settings.retentionEnabled,
    retentionPercent: data.settings.retentionPercent ?? "",
    retentionFlatAmount: data.settings.retentionFlatAmount ?? "",
    contractOverride: data.settings.billingContractValue ?? "",
    overrideReason: "",
  });
  async function save() {
    setBusy(true); setErr(null);
    try {
      const n = (v) => (v === "" ? null : Number(v));
      const res = await fetch("/api/billing/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: data.id, settings: { billingContractValue: n(s.contractOverride), contractOverrideReason: s.overrideReason || null, retentionEnabled: s.retentionEnabled, retentionPercent: n(s.retentionPercent), retentionFlatAmount: n(s.retentionFlatAmount) } }) });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      onSaved();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }
  return (
    <div className="px-4 pb-4 border-t border-line pt-4 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2 rounded-md border border-line p-3" style={{ background: "var(--surface-2)" }}>
          <p className="text-xs text-rebar mb-1">Contract value <span className="text-concrete/60">— {data.billing.contractSource === "override" ? "manually overridden" : "auto from line items"}</span></p>
          <p className="text-lg font-semibold text-concrete">{data.billing.revisedContract.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</p>
          <p className="text-[11px] text-rebar mt-1">Line items total {data.billing.linesContract.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}{data.billing.changeOrders ? ` + ${data.billing.changeOrders.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} change orders` : ""}. This updates automatically when line items change.</p>
          <details className="mt-2">
            <summary className="text-xs text-info cursor-pointer hover:underline">Override contract value</summary>
            <div className="mt-2 grid sm:grid-cols-2 gap-2">
              <input type="number" className="inp" value={s.contractOverride} onChange={(e) => setS({ ...s, contractOverride: e.target.value })} placeholder="Override amount" />
              <input className="inp" value={s.overrideReason} onChange={(e) => setS({ ...s, overrideReason: e.target.value })} placeholder="Reason for override" />
            </div>
            <p className="text-[11px] text-rebar mt-1">Leave blank to keep the auto value from line items. A reason is recorded for the audit trail.</p>
          </details>
        </div>
        <Lbl text="Retention" info="Turn on if this GC holds retention on the job. Off = no retention tracked.">
          <label className="flex items-center gap-2 text-sm text-concrete pt-2"><input type="checkbox" checked={s.retentionEnabled} onChange={(e) => setS({ ...s, retentionEnabled: e.target.checked })} /> This GC holds retention</label>
        </Lbl>
      </div>
      {s.retentionEnabled && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Lbl text="Retention percent" info="The % the GC holds back from each bill until the job closes (commonly 5% or 10%). Enter just the number, e.g. 10. Use this OR flat amount, not both.">
            <input type="number" step="0.1" className="inp" value={s.retentionPercent} onChange={(e) => setS({ ...s, retentionPercent: e.target.value })} placeholder="10" />
          </Lbl>
          <Lbl text="Retention flat amount" info="A fixed dollar retention for the whole job, instead of a percentage. Only use if the GC holds a set amount rather than a %. Most jobs use percent — leave blank if so.">
            <input type="number" className="inp" value={s.retentionFlatAmount} onChange={(e) => setS({ ...s, retentionFlatAmount: e.target.value })} placeholder="(optional)" />
          </Lbl>
        </div>
      )}

      <button onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{busy ? "Saving…" : "Save settings"}</button>
      <style jsx>{inpStyle}</style>
    </div>
  );
}

function EditEventForm({ event, busy, onCancel, onSave }) {
  const isInvoice = event.type === "Bill";
  const clean = String(event.notes || "")
    .split("[snap]")[0].split("[carry]")[0].split("[adjust]")[0]
    .replace(/\[short pay\][^\n]*/g, "").replace(/\[voided\][\s\S]*/, "").trim();

  const [f, setF] = useState({
    amount: event.amount ?? "",
    invoiceNumber: event.invoiceNumber || "",
    date: (event.date || "").slice(0, 10),
    dueDate: (event.dueDate || "").slice(0, 10),
    notes: clean,
  });

  function submit() {
    const changes = { date: f.date || null, notes: f.notes };
    if (isInvoice) {
      changes.invoiceNumber = f.invoiceNumber;
      changes.dueDate = f.dueDate || null;
    } else {
      changes.amount = Number(String(f.amount).replace(/[$,]/g, ""));
      if (event.type === "Payment") changes.invoiceNumber = f.invoiceNumber;
    }
    onSave(changes);
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-4" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-1">
        Edit {isInvoice ? `invoice ${event.invoiceNumber || ""}` : event.type.toLowerCase()}
      </p>
      {isInvoice ? (
        <p className="text-xs text-rebar mb-3">
          An invoice&apos;s amount comes from the quantities it billed, so it isn&apos;t edited here — that would
          leave it disagreeing with its line items. To change the money, undo the invoice and re-create it
          from the grid. Details below can be corrected freely.
        </p>
      ) : (
        <p className="text-xs text-rebar mb-3">
          Changing a payment&apos;s amount re-runs the short-pay check: any previous rollforward is undone first,
          then re-applied against the new amount.
        </p>
      )}

      <div className="grid sm:grid-cols-4 gap-3">
        {!isInvoice && (
          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Amount</span>
            <input type="text" inputMode="decimal" className="inp" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </label>
        )}
        {(isInvoice || event.type === "Payment") && (
          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Invoice #</span>
            <input className="inp" value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} />
          </label>
        )}
        <label className="block">
          <span className="text-xs text-rebar mb-1 block">Date</span>
          <input type="date" className="inp" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </label>
        {isInvoice && (
          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Due date</span>
            <input type="date" className="inp" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </label>
        )}
        <label className="block sm:col-span-2">
          <span className="text-xs text-rebar mb-1 block">Notes</span>
          <input className="inp" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </label>
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={submit} disabled={busy} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button onClick={onCancel} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
      </div>
    </div>
  );
}

const CO_UNITS = ["LBS", "SF", "LF", "EA", "LS"];

function ChangeOrderForm({ projectId, relatedBidId, onClose, onSaved }) {
  // basis: "Quantity" (qty x unit price) or "Hours" (hours x rate). Most COs are
  // by quantity; hourly COs (T&M work) bill by the hour and carry NO weight.
  const [f, setF] = useState({ basis: "Quantity", itemNo: "CO", description: "", qty: "", unit: "LBS", unitPrice: "", hours: "", rate: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const n = (v) => (v === "" || v == null ? null : Number(v));
  const isHours = f.basis === "Hours";
  const amount = isHours ? (n(f.hours) || 0) * (n(f.rate) || 0) : (n(f.qty) || 0) * (n(f.unitPrice) || 0);

  async function save() {
    if (!f.description) { setErr("Give the change order a description."); return; }
    if (isHours) {
      if (!n(f.hours) || !n(f.rate)) { setErr("Hours and rate are required — they set the CO's value."); return; }
    } else {
      if (!n(f.qty) || !n(f.unitPrice)) { setErr("Quantity and unit price are required — they set the CO's value."); return; }
    }
    setBusy(true); setErr(null);
    try {
      const item = isHours
        ? {
            description: f.description, itemNo: f.itemNo || "CO",
            projectId, bidId: relatedBidId || null,
            billingBasis: "Hours", hoursWorked: n(f.hours), rate: n(f.rate),
            unit: "HR", lineType: "CO", status: "Active", qtyToDate: 0,
          }
        : {
            description: f.description, itemNo: f.itemNo || "CO",
            projectId, bidId: relatedBidId || null,
            billingBasis: "Quantity",
            quantity: n(f.qty), unit: f.unit || "LBS", unitPrice: n(f.unitPrice),
            lineType: "CO", status: "Active", qtyToDate: 0,
          };
      const res = await fetch("/api/line-items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      onSaved();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-4" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-1">Add change order</p>
      <p className="text-xs text-rebar mb-3">A change order is extra contracted work — it&apos;s added as a line item at the bottom of the schedule. The contract value goes up now; it bills when you enter its quantity on an invoice (fully, partially, or on its own invoice).</p>
      {err && <div className="text-sm text-danger mb-3">{err}</div>}

      {/* billing basis toggle */}
      <div className="flex gap-1 mb-3 p-1 rounded-md border border-line w-fit" style={{ background: "var(--graphite)" }}>
        {["Quantity", "Hours"].map((b) => (
          <button key={b} onClick={() => setF({ ...f, basis: b })}
            className={`text-xs px-3 py-1.5 rounded ${f.basis === b ? "bg-safety text-steel font-medium" : "text-rebar hover:text-concrete"}`}>
            {b === "Quantity" ? "By quantity" : "By hours (T&M)"}
          </button>
        ))}
      </div>

      {isHours ? (
        <div className="grid sm:grid-cols-5 gap-3">
          <label className="block"><span className="text-xs text-rebar mb-1 block">Item no.</span><input className="inp" value={f.itemNo} onChange={(e) => setF({ ...f, itemNo: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="text-xs text-rebar mb-1 block">Description</span><input className="inp" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. T&M crew — extra dowels" /></label>
          <label className="block"><span className="text-xs text-rebar mb-1 block">Hours worked</span><input type="text" inputMode="decimal" className="inp" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} placeholder="40" /></label>
          <label className="block"><span className="text-xs text-rebar mb-1 block">Rate ($/hr)</span><input type="text" inputMode="decimal" className="inp" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="95" /></label>
        </div>
      ) : (
        <div className="grid sm:grid-cols-6 gap-3">
          <label className="block"><span className="text-xs text-rebar mb-1 block">Item no.</span><input className="inp" value={f.itemNo} onChange={(e) => setF({ ...f, itemNo: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="text-xs text-rebar mb-1 block">Description</span><input className="inp" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. 93RD/AMKOR HDWALL" /></label>
          <label className="block"><span className="text-xs text-rebar mb-1 block">Quantity</span><input type="text" inputMode="decimal" className="inp" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-rebar mb-1 block">Unit</span>
            <select className="inp" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
              {CO_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs text-rebar mb-1 block">Unit price</span><input type="text" inputMode="decimal" className="inp" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: e.target.value })} placeholder="0.30" /></label>
        </div>
      )}

      <p className="text-xs text-rebar mt-2">
        Adds <span className="text-concrete tabular-nums">{money(amount)}</span> to the contract value.
        {isHours && <span className="text-rebar"> · billed by the hour — carries no weight toward productivity.</span>}
      </p>
      <div className="flex gap-2 mt-4">
        <button onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{busy ? "Saving…" : "Add change order"}</button>
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
      </div>
    </div>
  );
}

function PaymentForm({ projectId, bills, events, onClose, onSaved }) {
  const money = (n) => (typeof n !== "number" || isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  // outstanding per invoice = (gross - retention) - payments already tied to it
  const paidByInvoice = {};
  for (const e of events) if (e.type === "Payment" && e.invoiceNumber) paidByInvoice[e.invoiceNumber] = (paidByInvoice[e.invoiceNumber] || 0) + (e.amount || 0);
  const options = bills.map((b) => {
    const net = (b.amount || 0) - (b.retentionWithheld || 0);
    const already = paidByInvoice[b.invoiceNumber] || 0;
    return { id: b.id, invoiceNumber: b.invoiceNumber, date: b.date, net, outstanding: net - already };
  });

  const [billEventId, setBillEventId] = useState(options[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const selected = options.find((o) => o.id === billEventId);
  const amtNum = amount === "" ? null : Number(amount);
  const isShort = selected && amtNum != null && amtNum < selected.net - 0.005;

  async function save() {
    if (amtNum == null || isNaN(amtNum)) { setErr("Enter a valid amount."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/billing/log-payment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, billEventId: billEventId || null, paidAmount: amtNum, paymentDate: date }),
      });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      onSaved();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-4" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-3">Log a payment</p>
      {err && <div className="text-sm text-danger mb-3">{err}</div>}
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-1">
          <span className="text-xs text-rebar mb-1 block">Against invoice</span>
          <select className="inp" value={billEventId} onChange={(e) => setBillEventId(e.target.value)}>
            {options.length === 0 && <option value="">No invoices yet</option>}
            {options.map((o) => <option key={o.id} value={o.id}>{o.invoiceNumber || "invoice"} — {money(o.outstanding)} due</option>)}
          </select>
        </label>
        <label className="block"><span className="text-xs text-rebar mb-1 block">Amount received</span><input type="text" inputMode="decimal" className="inp" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={selected ? String(selected.outstanding.toFixed(2)) : "0.00"} /></label>
        <label className="block"><span className="text-xs text-rebar mb-1 block">Date</span><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {selected && (
        <p className="text-xs mt-2 text-rebar">
          {selected.invoiceNumber || "Invoice"} · expected net {money(selected.net)}{" "}
          {isShort ? <span className="text-warn">· short pay — the ${(selected.net - amtNum).toFixed(2)} difference will roll to the next invoice automatically.</span> : <span className="text-ok">· full payment.</span>}
        </p>
      )}
      <div className="flex gap-2 mt-4">
        <button onClick={save} disabled={busy || amount === ""} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{busy ? "Saving…" : isShort ? "Log short payment" : "Log payment"}</button>
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
      </div>
    </div>
  );
}

function AddEventForm({ type, projectId, projectIdLabel, onClose, onSaved }) {
  const [f, setF] = useState({ amount: "", date: todayLocal(), dueDate: "", invoiceNumber: "", pounds: "", retentionWithheld: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [genning, setGenning] = useState(false);
  const [err, setErr] = useState(null);
  const isBill = type === "Bill";
  async function generateInvoiceNumber() {
    setGenning(true); setErr(null);
    try {
      const res = await fetch("/api/billing/next-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, projectIdLabel }) });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      setF((cur) => ({ ...cur, invoiceNumber: d.invoiceNumber }));
    } catch (e) { setErr(String(e.message || e)); }
    setGenning(false);
  }
  async function save() {
    setBusy(true); setErr(null);
    try {
      const n = (v) => (v === "" ? null : Number(v));
      const event = { projectId, type, amount: n(f.amount), date: f.date || null, notes: f.notes };
      if (isBill) { event.dueDate = f.dueDate || null; event.invoiceNumber = f.invoiceNumber; event.pounds = n(f.pounds); event.retentionWithheld = n(f.retentionWithheld); }
      const res = await fetch("/api/billing/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event }) });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      onSaved();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }
  return (
    <div className="rounded-lg border border-line p-4 mb-4" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-3">Log a {type.toLowerCase()}</p>
      {err && <div className="text-sm text-danger mb-3">{err}</div>}
      <div className="grid sm:grid-cols-2 gap-3">
        <Lbl text="Amount"><input type="number" className="inp" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></Lbl>
        <Lbl text="Date"><input type="date" className="inp" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Lbl>
        {isBill && <Lbl text="Due date" info="When this invoice is due (net 30/60). Drives the aging buckets."><input type="date" className="inp" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Lbl>}
        {isBill && <Lbl text="Invoice number" info="Auto-generates as ProjectID-INV-N (e.g. 26-18-INV-3). You can also type your own.">
          <div className="flex gap-2">
            <input className="inp" value={f.invoiceNumber} onChange={(e) => setF({ ...f, invoiceNumber: e.target.value })} placeholder="26-18-INV-1" />
            <button onClick={generateInvoiceNumber} disabled={genning} className="text-xs px-2.5 rounded border border-line text-rebar hover:text-concrete whitespace-nowrap disabled:opacity-40" title="Auto-generate invoice number">{genning ? "…" : "Generate"}</button>
          </div>
        </Lbl>}
        {isBill && <Lbl text="Pounds billed" info="Installed pounds this bill covers. Used for unbilled-in-field."><input type="number" className="inp" value={f.pounds} onChange={(e) => setF({ ...f, pounds: e.target.value })} /></Lbl>}
        {isBill && <Lbl text="Retention withheld" info="Retention held on THIS bill, if you track it per-bill. Leave blank to auto-calc from the % setting."><input type="number" className="inp" value={f.retentionWithheld} onChange={(e) => setF({ ...f, retentionWithheld: e.target.value })} placeholder="(optional)" /></Lbl>}
      </div>
      <div className="mt-3"><Lbl text="Notes"><input className="inp" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. extras e4-e5" /></Lbl></div>
      <div className="flex flex-wrap gap-2 mt-4 items-center">
        <button onClick={save} disabled={busy || f.amount === ""} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{busy ? "Saving…" : `Save ${type.toLowerCase()}`}</button>
        {isBill && (
          <span className="text-xs text-rebar/70 italic self-center">Save the invoice, then <span className="text-info not-italic">Download</span> it as Excel from its row below.</span>
        )}
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
      </div>
      <style jsx>{inpStyle}</style>
    </div>
  );
}

function Stat({ label, value, sub, accent, status, tone, tip }) {
  // #7: colour encodes URGENCY, not size. Outstanding is money someone owes you
  // (chase it). Remaining to bill is revenue still ahead (good news). They mean
  // opposite things — they shouldn't look alike.
  const c =
    tone === "warn" ? "text-warn"
    : tone === "attention" ? "text-warn"
    : tone === "info" ? "text-info"
    : accent ? "text-safety"
    : "text-concrete";
  return (
    <div className="rounded-lg border border-line px-3 py-3" style={{ background: "var(--surface)" }}>
      <p className="text-[11px] text-rebar mb-1 leading-tight flex items-center gap-1">
        {label}
        {tip && <InfoTip text={tip} />}
      </p>
      <p className={`text-base font-semibold ${c}`}>{value}</p>
      {sub && <p className="text-[11px] text-rebar mt-0.5">{sub}</p>}
    </div>
  );
}
function AddBtn({ label, onClick, primary }) {
  return <button onClick={onClick} className={`text-sm px-4 py-2 rounded-md font-medium ${primary ? "bg-safety text-steel" : "border border-line text-concrete hover:bg-graphite"}`}>{label}</button>;
}
function Lbl({ text, info, children }) {
  return (
    <label className="block">
      <span className="text-xs text-rebar mb-1 flex items-center gap-1">{text}{info && <InfoDot text={info} />}</span>
      {children}
    </label>
  );
}
function InfoDot({ text }) {
  return (
    <span className="relative group inline-flex">
      <span className="w-3.5 h-3.5 rounded-full border border-rebar text-rebar text-[9px] flex items-center justify-center cursor-help">i</span>
      <span className="absolute left-5 top-0 z-10 hidden group-hover:block w-56 text-[11px] leading-snug text-concrete p-2 rounded-md border border-line shadow-lg" style={{ background: "var(--surface-2)" }}>{text}</span>
    </span>
  );
}
const inpStyle = `.inp { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 11px; font-size: 14px; color: var(--text); outline: none; } .inp:focus { border-color: var(--accent); }`;

// -----------------------------------------------------------------------------
// Retention billing — the OTHER track. Retention was already counted as billed
// on the progress invoices and held back; this is where you collect it at
// closeout. Bill retention → draws down the held balance. Log retention payment
// → records the check. Both are their own event types, so they never touch the
// contract's billed / remaining totals (that would double-count the money).
function RetentionPanel({ data, b, refresh, setBusy, setErr, busy }) {
  const [mode, setMode] = useState(null); // "bill" | "payment" | null
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState(todayISO());
  const [inv, setInv] = useState("");
  const [note, setNote] = useState("");

  const held = b.retention || 0;
  const billed = b.retentionBilled || 0;
  const received = b.retentionReceived || 0;
  const due = b.retentionDue || 0;
  const toBill = b.retentionToBill || 0;

  function open(m) {
    setMode(m);
    setAmt(String(Math.round((m === "bill" ? toBill : due) || 0)));
    setDate(todayISO());
    setInv("");
    setNote("");
  }

  async function submit() {
    const amount = Number(amt);
    if (!amount || amount <= 0) { setErr("Enter a retention amount greater than zero."); return; }
    setBusy(true); setErr(null);
    try {
      const type = mode === "bill" ? "Retention Bill" : "Retention Payment";
      const event = {
        projectId: data.id, type, amount, date,
        invoiceNumber: inv || "",
        name: mode === "bill" ? "Retention billing" : "Retention payment",
        notes: note || (mode === "bill" ? "Retention billed" : "Retention payment received"),
      };
      const res = await fetch("/api/billing/event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      setMode(null);
      refresh();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-line mb-6 p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-concrete font-medium">Retention billing</span>
        <span className="text-[11px] text-rebar hidden sm:block">held all job · billed & collected at closeout</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <RetStat label="Held" value={money(held)} tip="Total withheld across the progress invoices — earned, held back." />
        <RetStat label="Billed" value={money(billed)} tip="Retention you've invoiced to collect." />
        <RetStat label="Received" value={money(received)} tip="Retention checks received." />
        <RetStat label="Still due" value={money(due)} tone={due > 0.5 ? "warn" : null} tip="Billed but not yet collected." />
        <RetStat label="Left to bill" value={money(toBill)} tone={toBill > 0.5 ? "info" : null} tip="Held retention not yet invoiced." />
      </div>
      {mode ? (
        <div className="rounded-md border border-line p-3 space-y-2" style={{ background: "var(--surface-2)" }}>
          <p className="text-xs text-concrete font-medium">{mode === "bill" ? "Bill retention" : "Log retention payment"}</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <input type="number" className="inp" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Amount" />
            <input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="inp" value={inv} onChange={(e) => setInv(e.target.value)} placeholder="Invoice # (optional)" />
            <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          </div>
          <p className="text-[11px] text-rebar">{mode === "bill"
            ? "Records a retention invoice. It draws down held retention and never touches the contract's billed or remaining totals."
            : "Records a retention check against what you've billed."}</p>
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy} className="text-sm px-3 py-1.5 rounded-md font-medium bg-safety text-steel disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => setMode(null)} disabled={busy} className="text-sm px-3 py-1.5 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => open("bill")} disabled={busy || toBill <= 0.5} title={toBill <= 0.5 ? "No held retention left to bill" : "Invoice the held retention"} className="text-sm px-3 py-1.5 rounded-md font-medium bg-safety text-steel disabled:opacity-40">Bill retention</button>
          <button onClick={() => open("payment")} disabled={busy || billed <= 0.5} title={billed <= 0.5 ? "Bill retention first" : "Record a retention check"} className="text-sm px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite disabled:opacity-40">Log retention payment</button>
        </div>
      )}
    </div>
  );
}

function RetStat({ label, value, tone, tip }) {
  const tc = tone === "warn" ? "text-warn" : tone === "info" ? "text-info" : "text-concrete";
  return (
    <div className="rounded-md border border-line px-3 py-2" style={{ background: "var(--surface-2)" }} title={tip || ""}>
      <p className="text-[10px] uppercase tracking-wider text-rebar mb-0.5">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${tc}`}>{value}</p>
    </div>
  );
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
