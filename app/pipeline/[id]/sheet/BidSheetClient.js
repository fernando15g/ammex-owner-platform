"use client";

// =============================================================================
// BID SHEET — mimics the admin's Excel proposal template TO THE T:
//   Item No | Description | Quantity | Unit | Unit Price | Extended | Furn/Inst
// Spreadsheet-style rows: type into cells, Extended auto-computes, total at the
// bottom. Add rows as needed, save the sheet. Lines are born "Proposed"; they
// become the billing schedule when the bid is won.
// =============================================================================

import { useState } from "react";

const money = (n) => (typeof n !== "number" || isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

const FURN_OPTIONS = ["", "Furnish", "Install", "Furnish+Install"];
const TYPE_OPTIONS = ["Standard", "CO", "PA", "SE", "PC"];

const blankRow = () => ({ id: null, itemNo: "", description: "", quantity: "", unit: "LBS", unitPrice: "", furnInst: "", lineType: "Standard", _dirty: true });

export default function BidSheetClient({ data }) {
  const { bid, items } = data;
  const [rows, setRows] = useState(() =>
    items.length > 0
      ? items.map((li) => ({ id: li.id, itemNo: li.itemNo || "", description: li.description || "", quantity: li.quantity ?? "", unit: li.unit || "LBS", unitPrice: li.unitPrice ?? "", furnInst: li.furnInst || "", lineType: li.lineType || "Standard", _dirty: false }))
      : [blankRow(), blankRow(), blankRow()]
  );
  const [state, setState] = useState({ saving: false, saved: false, error: null });

  const setCell = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v, _dirty: true } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i));

  const ext = (r) => (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
  const filled = rows.filter((r) => r.description.trim() !== "" || r.itemNo.trim() !== "");
  const total = filled.reduce((a, r) => a + ext(r), 0);
  const totalQty = filled.reduce((a, r) => a + (Number(r.quantity) || 0), 0);

  async function saveSheet() {
    setState({ saving: true, saved: false, error: null });
    try {
      const n = (v) => (v === "" || v == null ? null : Number(v));
      const toCreate = [], toUpdate = [];
      for (const r of filled) {
        if (!r._dirty) continue;
        const payload = {
          description: r.description, itemNo: r.itemNo,
          quantity: n(r.quantity), unit: r.unit, unitPrice: n(r.unitPrice),
          furnInst: r.furnInst || null, lineType: r.lineType || "Standard",
        };
        if (r.id) toUpdate.push({ id: r.id, changes: payload });
        else toCreate.push({ ...payload, bidId: bid.id, status: "Proposed" });
      }
      if (toCreate.length) {
        const res = await fetch("/api/line-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: toCreate }) });
        const d = await res.json(); if (!d.ok) throw new Error(d.error);
      }
      for (const u of toUpdate) {
        const res = await fetch(`/api/line-items/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: u.changes }) });
        const d = await res.json(); if (!d.ok) throw new Error(d.error);
      }
      setState({ saving: false, saved: true, error: null });
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setState({ saving: false, saved: false, error: String(e.message || e) });
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-5">
        <a href={`/pipeline/${bid.id}`} className="inline-flex items-center gap-1.5 text-sm text-rebar hover:text-concrete">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Bid
        </a>
        <span className="text-xs text-rebar">· itemized proposal — lines become the billing schedule when won</span>
        <span className="ml-auto" />
        {state.saved && <span className="text-xs text-ok">Saved ✓</span>}
        <button onClick={saveSheet} disabled={state.saving || filled.length === 0} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{state.saving ? "Saving…" : "Save sheet"}</button>
      </div>

      {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">Couldn&apos;t save: {state.error}</div>}

      {/* The sheet — mimics the Excel template */}
      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 820 }}>
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium px-3 py-2.5 w-24">Item No.</th>
              <th className="text-left font-medium px-3 py-2.5">Description</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Quantity</th>
              <th className="text-left font-medium px-3 py-2.5 w-20">Unit</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Unit Price</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Extended</th>
              <th className="text-left font-medium px-3 py-2.5 w-36">Furn/Inst</th>
              <th className="text-left font-medium px-2 py-2.5 w-20">Type</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-1.5 py-1"><input className="cell" value={r.itemNo} onChange={(e) => setCell(i, "itemNo", e.target.value)} placeholder="28410" /></td>
                <td className="px-1.5 py-1"><input className="cell" value={r.description} onChange={(e) => setCell(i, "description", e.target.value)} placeholder="Bridge Deck" /></td>
                <td className="px-1.5 py-1"><input type="number" className="cell text-right" value={r.quantity} onChange={(e) => setCell(i, "quantity", e.target.value)} placeholder="0" /></td>
                <td className="px-1.5 py-1"><input className="cell" value={r.unit} onChange={(e) => setCell(i, "unit", e.target.value)} /></td>
                <td className="px-1.5 py-1"><input type="number" step="0.0001" className="cell text-right" value={r.unitPrice} onChange={(e) => setCell(i, "unitPrice", e.target.value)} placeholder="0.30" /></td>
                <td className="px-3 py-1 text-right tabular-nums text-concrete/80">{money(ext(r))}</td>
                <td className="px-1.5 py-1">
                  <select className="cell" value={r.furnInst} onChange={(e) => setCell(i, "furnInst", e.target.value)}>
                    {FURN_OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                  </select>
                </td>
                <td className="px-1.5 py-1">
                  <select className="cell" value={r.lineType} onChange={(e) => setCell(i, "lineType", e.target.value)}>
                    {TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1 text-center">
                  {!r.id && <button onClick={() => removeRow(i)} className="text-rebar hover:text-danger text-xs" title="Remove row">✕</button>}
                </td>
              </tr>
            ))}
            {/* totals row — like the bottom of the template */}
            <tr className="border-t-2 border-line bg-graphite/40">
              <td className="px-3 py-2.5 text-xs text-rebar" colSpan={2}>TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-concrete">{totalQty.toLocaleString()}</td>
              <td></td><td></td>
              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-concrete">{money(total)}</td>
              <td colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button onClick={addRow} className="text-sm px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite">+ Add row</button>
        <span className="text-xs text-rebar">{filled.length} line item{filled.length === 1 ? "" : "s"} · new lines save as <span className="text-concrete">Proposed</span></span>
      </div>

      <style jsx>{`
        .cell { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 13px; color: var(--text); outline: none; }
        .cell:focus { border-color: var(--accent); }
      `}</style>
    </div>
  );
}
