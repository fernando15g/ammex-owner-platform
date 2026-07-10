"use client";

// =============================================================================
// PROJECT BILLING WORKSPACE — the admin's ONE place to work a project's money.
// See the full picture (contract, billed, paid, outstanding, retention, aging,
// unbilled-in-field), update installed pounds + contract settings, and log
// bills/payments/change-orders. Everything computed live from events.
// =============================================================================

import { useState } from "react";

const money = (n) => (typeof n !== "number" ? "—" : n < 0 ? `-$${Math.abs(Math.round(n)).toLocaleString()}` : `$${Math.round(n).toLocaleString()}`);
const lbs = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");
const dateStr = (s) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

export default function ProjectBillingClient({ data }) {
  const b = data.billing;
  const [showAdd, setShowAdd] = useState(null); // 'Bill' | 'Payment' | 'Change Order' | null
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [evaOpen, setEvaOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function refresh() { window.location.reload(); }

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
    <div className="max-w-4xl">
      <a href="/billing" className="inline-flex items-center gap-1.5 text-sm text-rebar hover:text-concrete mb-5">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        All billing
      </a>

      {err && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">{err}</div>}

      {/* The money picture */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Revised contract" value={money(b.revisedContract)} sub={b.changeOrders ? `incl. ${money(b.changeOrders)} change orders` : null} />
        <Stat label="Billed to date" value={money(b.billedToDate)} />
        <Stat label="Outstanding" value={money(b.outstanding)} accent />
        <Stat label="Remaining to bill" value={money(b.remainingToBill)} />
        <Stat label="Paid to date" value={money(b.paidToDate)} />
        <Stat label="Retention held" value={b.retentionEnabled ? money(b.retention) : "—"} sub={b.retentionEnabled ? null : "off"} />
        <Stat label="Unbilled in field" value={b.unbilledInFieldValue != null ? money(b.unbilledInFieldValue) : "—"} sub={`${lbs(b.unbilledPounds)} lbs`} accent />
        <Stat label="Status" value={b.status} status />
      </div>

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
          <span className="text-concrete font-medium">Contract & retention settings</span>
          <span className="text-rebar text-xs">installed: {lbs(data.installedPounds)} lbs · {settingsOpen ? "hide" : "edit"}</span>
        </button>
        {settingsOpen && <SettingsPanel data={data} setBusy={setBusy} setErr={setErr} onSaved={refresh} busy={busy} />}
      </div>

      {/* Log new event */}
      <div className="flex flex-wrap gap-2 mb-4">
        <a href={`/billing/${data.id}/new-bill`} className="text-sm px-4 py-2 rounded-md font-medium bg-safety text-steel">+ Create bill (itemized)</a>
        <AddBtn label="+ Log a payment" onClick={() => setShowAdd("Payment")} />
        <AddBtn label="+ Change order" onClick={() => setShowAdd("Change Order")} />
      </div>
      {showAdd === "Payment" ? (
        <PaymentForm projectId={data.id} bills={data.events.filter((e) => e.type === "Bill" && (e.amount || 0) > 0)} events={data.events} onClose={() => setShowAdd(null)} onSaved={refresh} />
      ) : showAdd ? (
        <AddEventForm type={showAdd} projectId={data.id} projectIdLabel={data.projectId} onClose={() => setShowAdd(null)} onSaved={refresh} />
      ) : null}

      {/* Estimate vs actual — line-item progress vs the bid */}
      {data.lines && data.lines.length > 0 && (() => {
        const rows = data.lines;
        const estTotal = rows.reduce((a, l) => a + (l.quantity || 0), 0);
        const actualTotal = rows.reduce((a, l) => a + (l.qtyToDate || 0), 0);
        const pct = estTotal > 0 ? (actualTotal / estTotal) * 100 : 0;
        return (
          <div className="rounded-lg border border-line mb-6" style={{ background: "var(--surface)" }}>
            <button onClick={() => setEvaOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-concrete font-medium">Estimate vs actual (line items)</span>
              <span className="text-rebar text-xs">{lbs(actualTotal)} / {lbs(estTotal)} lbs billed · {pct.toFixed(1)}% · {evaOpen ? "hide" : "show"}</span>
            </button>
            {evaOpen && (
              <div className="px-4 pb-4 border-t border-line pt-3 overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 620 }}>
                  <thead><tr className="text-rebar text-[11px] uppercase tracking-wider">
                    <th className="text-left font-medium px-2 py-1.5">Item</th>
                    <th className="text-left font-medium px-2 py-1.5">Description</th>
                    <th className="text-right font-medium px-2 py-1.5">Bid est.</th>
                    <th className="text-right font-medium px-2 py-1.5">Billed to date</th>
                    <th className="text-right font-medium px-2 py-1.5">Diff</th>
                    <th className="text-right font-medium px-2 py-1.5">% done</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((l) => {
                      const est = l.quantity || 0, act = l.qtyToDate || 0, diff = act - est;
                      const lp = est > 0 ? (act / est) * 100 : 0;
                      return (
                        <tr key={l.id} className="border-t border-line">
                          <td className="px-2 py-1.5 text-concrete/70">{l.itemNo || "—"}</td>
                          <td className="px-2 py-1.5 text-concrete">{l.description}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-concrete/70">{lbs(est)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-concrete">{lbs(act)}</td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${diff > 0 ? "text-warn" : diff < 0 ? "text-rebar" : "text-concrete/50"}`}>{diff > 0 ? "+" : ""}{lbs(diff)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-concrete/80">{lp.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-line bg-graphite/40">
                      <td colSpan={2} className="px-2 py-2 text-xs text-rebar">TOTAL</td>
                      <td className="px-2 py-2 text-right tabular-nums text-concrete/70">{lbs(estTotal)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-concrete">{lbs(actualTotal)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${actualTotal - estTotal > 0 ? "text-warn" : "text-rebar"}`}>{actualTotal - estTotal > 0 ? "+" : ""}{lbs(actualTotal - estTotal)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-concrete">{pct.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-[11px] text-rebar mt-2">Positive diff = billed more than the bid estimate (weights came in higher). Helps see drift from bid and how close to complete.</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Event history */}
      <div className="rounded-lg border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium px-4 py-2.5">Event</th>
              <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Date</th>
              <th className="text-right font-medium px-3 py-2.5">Amount</th>
              <th className="text-left font-medium px-4 py-2.5 hidden md:table-cell">Due / Notes</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="px-4 py-2.5">
                  <span className={`inline-block text-xs rounded-full px-2 py-0.5 border ${e.type === "Payment" ? "text-ok border-ok/40" : e.type === "Change Order" ? "text-info border-info/40" : "text-concrete border-line"}`}>{e.type}</span>
                  {e.invoiceNumber && <span className="text-xs text-rebar ml-2">#{e.invoiceNumber}</span>}
                </td>
                <td className="px-3 py-2.5 hidden sm:table-cell text-concrete/80">{dateStr(e.date)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-concrete">{money(e.amount)}</td>
                <td className="px-4 py-2.5 hidden md:table-cell text-rebar text-xs">
                  {e.dueDate ? `due ${dateStr(e.dueDate)}` : ""}{e.notes ? ` ${String(e.notes).split("[snap]")[0].split("[carry]")[0].replace(/\[short pay\][\s\S]*/, "").trim()}` : ""}
                  {e.type === "Bill" && <button onClick={() => shortPay(e)} disabled={busy} className="ml-2 text-[11px] px-2 py-0.5 rounded border border-warn/50 text-warn hover:bg-warn/10 disabled:opacity-40" title="They paid less than billed — adjust the record and roll the difference forward">Short pay</button>}
                </td>
              </tr>
            ))}
            {data.events.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-rebar">No events yet. Log the first bill above.</td></tr>}
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
    installedPounds: data.installedPounds ?? "",
  });
  async function save() {
    setBusy(true); setErr(null);
    try {
      const n = (v) => (v === "" ? null : Number(v));
      const res = await fetch("/api/billing/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: data.id, settings: { billingContractValue: n(s.billingContractValue), retentionEnabled: s.retentionEnabled, retentionPercent: n(s.retentionPercent), retentionFlatAmount: n(s.retentionFlatAmount), installedPounds: n(s.installedPounds) } }) });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      onSaved();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }
  return (
    <div className="px-4 pb-4 border-t border-line pt-4 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Lbl text="Contract value" info="The total contract for this job. You can pull the bid's contract value as a starting point, but it may differ if pounds changed or the price was negotiated — adjust as needed.">
          <div className="flex gap-2">
            <input type="number" className="inp" value={s.billingContractValue} onChange={(e) => setS({ ...s, billingContractValue: e.target.value })} />
            {data.bidContractValue != null && <button onClick={() => setS({ ...s, billingContractValue: Math.round(data.bidContractValue) })} className="text-xs px-2 rounded border border-line text-rebar hover:text-concrete whitespace-nowrap" title="Use the bid's contract value">use bid</button>}
          </div>
        </Lbl>
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
      <Lbl text="Installed pounds to date" info="Total rebar placed on this job so far. Drives the unbilled-in-field number. Update this as the field reports progress.">
        <input type="number" className="inp" value={s.installedPounds} onChange={(e) => setS({ ...s, installedPounds: e.target.value })} placeholder="0" />
      </Lbl>
      <button onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{busy ? "Saving…" : "Save settings"}</button>
      <style jsx>{inpStyle}</style>
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
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
  const [f, setF] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), dueDate: "", invoiceNumber: "", pounds: "", retentionWithheld: "", notes: "" });
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
          <button disabled title="Coming soon — generate a printable PDF invoice to send the GC" className="text-sm px-4 py-2 rounded-md border border-line text-rebar/60 cursor-not-allowed flex items-center gap-1.5">
            View / Print PDF
            <span className="text-[9px] uppercase tracking-wider bg-info/20 text-info rounded px-1 py-0.5">soon</span>
          </button>
        )}
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
      </div>
      <style jsx>{inpStyle}</style>
    </div>
  );
}

function Stat({ label, value, sub, accent, status }) {
  const c = accent ? "text-safety" : "text-concrete";
  return (<div className="rounded-lg border border-line px-3 py-3" style={{ background: "var(--surface)" }}><p className="text-[11px] text-rebar mb-1 leading-tight">{label}</p><p className={`text-base font-semibold ${c}`}>{value}</p>{sub && <p className="text-[11px] text-rebar mt-0.5">{sub}</p>}</div>);
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
