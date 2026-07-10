"use client";

// =============================================================================
// CREATE BILL — the admin's billing template, live. For each line item she
// enters the new "Total Work To Date" quantity (verified against the weight
// sheet); the screen computes Previous / Work This Estimate per line, retention
// (10% labor-only, editable), and TOTAL DUE — exactly like her Excel.
// Saving creates the invoice record (ProjectID-INV-N) and advances the lines.
// =============================================================================

import { useState, useMemo } from "react";
import { computeInvoice } from "@/lib/rules/invoicing";

const money = (n) => (typeof n !== "number" || isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const qty = (n) => (typeof n !== "number" || isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 1 }));

export default function CreateBillClient({ data }) {
  const [newQty, setNewQty] = useState({});
  const [head, setHead] = useState({
    invoiceNumber: "",
    date: new Date().toISOString().slice(0, 10),
    dueDate: "",
    retentionPct: data.settings.retentionEnabled ? (data.settings.retentionPercent ?? 10) : 10,
    notes: "",
  });
  const [state, setState] = useState({ saving: false, genning: false, error: null });

  const inv = useMemo(() => computeInvoice(data.lines, newQty, Number(head.retentionPct) || 0), [data.lines, newQty, head.retentionPct]);

  async function generateInvoiceNumber() {
    setState((s) => ({ ...s, genning: true, error: null }));
    try {
      const res = await fetch("/api/billing/next-invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: data.id, projectIdLabel: data.projectId }) });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      setHead((h) => ({ ...h, invoiceNumber: d.invoiceNumber }));
    } catch (e) { setState((s) => ({ ...s, error: String(e.message || e) })); }
    setState((s) => ({ ...s, genning: false }));
  }

  async function saveBill() {
    setState({ saving: true, genning: false, error: null });
    try {
      const res = await fetch("/api/billing/create-bill", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: data.id, relatedBidId: data.relatedBidId,
          invoiceNumber: head.invoiceNumber, date: head.date, dueDate: head.dueDate || null,
          notes: head.notes, retentionPct: Number(head.retentionPct) || 0, newQty,
        }),
      });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      window.location.href = `/billing/${data.id}`;
    } catch (e) {
      setState({ saving: false, genning: false, error: String(e.message || e) });
    }
  }

  if (data.lines.length === 0) {
    return (
      <div className="max-w-lg rounded-lg border border-line p-6" style={{ background: "var(--surface)" }}>
        <p className="text-concrete font-medium mb-2">No line items yet</p>
        <p className="text-sm text-rebar mb-4">This project has no bid sheet line items to bill against. Create the bid sheet first — its lines become this billing schedule.</p>
        <a href={data.relatedBidId ? `/pipeline/${data.relatedBidId}/sheet` : "/pipeline"} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium inline-block">Open bid sheet</a>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-3 mb-4">
        <a href={`/billing/${data.id}`} className="inline-flex items-center gap-1.5 text-sm text-rebar hover:text-concrete">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Project billing
        </a>
        <span className="ml-auto" />
        <button onClick={saveBill} disabled={state.saving || inv.grossThisEstimate <= 0} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{state.saving ? "Saving…" : "Save invoice"}</button>
      </div>

      {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">{state.error}</div>}

      {/* Invoice header */}
      <div className="grid sm:grid-cols-4 gap-3 mb-4">
        <label className="block">
          <span className="text-xs text-rebar mb-1 block">Invoice number</span>
          <div className="flex gap-2">
            <input className="inp" value={head.invoiceNumber} onChange={(e) => setHead({ ...head, invoiceNumber: e.target.value })} placeholder={`${data.projectId || "26-XX"}-INV-1`} />
            <button onClick={generateInvoiceNumber} disabled={state.genning} className="text-xs px-2.5 rounded border border-line text-rebar hover:text-concrete whitespace-nowrap disabled:opacity-40">{state.genning ? "…" : "Generate"}</button>
          </div>
        </label>
        <label className="block"><span className="text-xs text-rebar mb-1 block">Bill date</span><input type="date" className="inp" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} /></label>
        <label className="block"><span className="text-xs text-rebar mb-1 block">Due date</span><input type="date" className="inp" value={head.dueDate} onChange={(e) => setHead({ ...head, dueDate: e.target.value })} /></label>
        <label className="block"><span className="text-xs text-rebar mb-1 block">Retention % <span className="text-rebar/70">(labor only)</span></span><input type="text" inputMode="decimal" className="inp" value={head.retentionPct} onChange={(e) => setHead({ ...head, retentionPct: e.target.value })} /></label>
      </div>

      {/* The template grid */}
      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 980 }}>
          <thead>
            <tr className="bg-graphite text-rebar text-[10px] uppercase tracking-wider">
              <th className="text-left font-medium px-3 py-2 w-20" rowSpan={2}>Bid No.</th>
              <th className="text-left font-medium px-3 py-2" rowSpan={2}>Description</th>
              <th className="text-right font-medium px-3 py-2 w-24" rowSpan={2}>Estimate Qty</th>
              <th className="text-right font-medium px-3 py-2 w-20" rowSpan={2}>Unit Price</th>
              <th className="text-center font-medium px-3 py-1.5 border-l border-line" colSpan={2}>Total Work To Date</th>
              <th className="text-center font-medium px-3 py-1.5 border-l border-line" colSpan={2}>Previous Work</th>
              <th className="text-center font-medium px-3 py-1.5 border-l border-line" colSpan={2}>Work This Estimate</th>
            </tr>
            <tr className="bg-graphite text-rebar text-[10px] uppercase tracking-wider">
              <th className="text-right font-medium px-3 py-1.5 border-l border-line w-28">Qty</th>
              <th className="text-right font-medium px-3 py-1.5 w-24">Amt</th>
              <th className="text-right font-medium px-3 py-1.5 border-l border-line w-24">Qty</th>
              <th className="text-right font-medium px-3 py-1.5 w-24">Amt</th>
              <th className="text-right font-medium px-3 py-1.5 border-l border-line w-24">Qty</th>
              <th className="text-right font-medium px-3 py-1.5 w-24">Amt</th>
            </tr>
          </thead>
          <tbody>
            {inv.rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2 text-concrete/70">{r.itemNo || "—"}</td>
                <td className="px-3 py-2 text-concrete">{r.description}</td>
                <td className="px-3 py-2 text-right tabular-nums text-concrete/70">{qty(r.estimateQty)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-concrete/70">{r.unitPrice}</td>
                <td className="px-1.5 py-1 border-l border-line">
                  <input type="text" inputMode="decimal" className="inp text-right" style={{ padding: "5px 8px", fontSize: 13 }} value={newQty[r.id] ?? ""} placeholder={String(r.prevQty)} onChange={(e) => setNewQty((m) => ({ ...m, [r.id]: e.target.value }))} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-concrete/80">{money(r.toDateAmt)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-concrete/60 border-l border-line">{qty(r.prevQty)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-concrete/60">{money(r.prevAmt)}</td>
                <td className={`px-3 py-2 text-right tabular-nums border-l border-line ${r.thisQty < 0 ? "text-danger" : "text-concrete"}`}>{qty(r.thisQty)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${r.thisAmt < 0 ? "text-danger" : "text-concrete"}`}>{money(r.thisAmt)}</td>
              </tr>
            ))}
            {/* totals block — like the bottom of her template */}
            <tr className="border-t-2 border-line bg-graphite/40">
              <td colSpan={4} className="px-3 py-2 text-xs text-rebar text-right">TOTALS</td>
              <td className="border-l border-line"></td>
              <td className="px-3 py-2 text-right tabular-nums text-concrete/80">{money(inv.toDateAmt)}</td>
              <td className="border-l border-line"></td>
              <td className="px-3 py-2 text-right tabular-nums text-concrete/60">{money(inv.prevAmt)}</td>
              <td className="border-l border-line"></td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-concrete">{money(inv.grossThisEstimate)}</td>
            </tr>
            <tr className="bg-graphite/40">
              <td colSpan={9} className="px-3 py-1.5 text-xs text-rebar text-right">Retention ({Number(head.retentionPct) || 0}% labor only)</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-warn">−{money(inv.retention)}</td>
            </tr>
            <tr className="bg-graphite/40 border-t border-line">
              <td colSpan={9} className="px-3 py-2.5 text-xs text-concrete font-semibold text-right">TOTAL DUE</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-bold text-safety text-base">{money(inv.totalDue)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-3 mt-3">
        <label className="block flex-1"><span className="text-xs text-rebar mb-1 block">Notes</span><input className="inp" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} placeholder="e.g. extras e4-e5" /></label>
      </div>
      <p className="text-xs text-rebar mt-3">Enter each line&apos;s new <span className="text-concrete">Total Work To Date</span> quantity (from the weight sheet). Blank = unchanged. This Estimate = To Date − Previous. Saving creates the invoice record and advances the lines.</p>
    </div>
  );
}
