"use client";

// =============================================================================
// BID SHEET — mimics the admin's Excel proposal template TO THE T:
//   Item No | Description | Quantity | Unit | Unit Price | Extended | Furn/Inst
// Excel-like: paste rows straight from Excel, Enter moves down (adds a row at
// the bottom), arrow keys move up/down, Tab moves across. Extended
// auto-computes; TOTAL at the bottom. Lines save as "Proposed".
// =============================================================================

import { useState, useRef } from "react";

const money = (n) => (typeof n !== "number" || isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

const FURN_OPTIONS = ["", "Furnish", "Install", "Furnish+Install"];
// column order for keyboard nav + Excel paste (matches her template order)
const COLS = ["itemNo", "description", "quantity", "unit", "unitPrice", "furnInst"];

const blankRow = () => ({ id: null, itemNo: "", description: "", quantity: "", unit: "LBS", unitPrice: "", furnInst: "", _dirty: true });

export default function BidSheetClient({ data }) {
  const { bid, items } = data;
  const [rows, setRows] = useState(() =>
    items.length > 0
      ? items.map((li) => ({ id: li.id, itemNo: li.itemNo || "", description: li.description || "", quantity: li.quantity ?? "", unit: li.unit || "LBS", unitPrice: li.unitPrice ?? "", furnInst: li.furnInst || "", _dirty: false }))
      : [blankRow(), blankRow(), blankRow()]
  );
  const [state, setState] = useState({ saving: false, saved: false, error: null });
  const [editing, setEditing] = useState(items.length === 0); // no sheet yet -> straight to entry
  const tableRef = useRef(null);

  const setCell = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v, _dirty: true } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i));

  async function deleteSavedRow(i) {
    const r = rows[i];
    if (!r.id) { removeRow(i); return; }
    if (!window.confirm(`Delete "${r.description || r.itemNo || "this line"}" from the bid sheet?\n\nUnbilled lines delete cleanly. Billed lines will be blocked (close them instead).`)) return;
    setState((st) => ({ ...st, saving: true, error: null }));
    try {
      let res = await fetch(`/api/line-items/${r.id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      let d = await res.json();
      if (!d.ok && d.blocked) {
        if (window.confirm(`${d.error}\n\nClose this line instead?`)) {
          res = await fetch(`/api/line-items/${r.id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "close" }) });
          d = await res.json();
          if (!d.ok) throw new Error(d.error);
        } else { setState((st) => ({ ...st, saving: false })); return; }
      } else if (!d.ok) throw new Error(d.error);
      removeRow(i);
      setState((st) => ({ ...st, saving: false }));
    } catch (e) { setState((st) => ({ ...st, saving: false, error: String(e.message || e) })); }
  }

  const ext = (r) => (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0);
  const filled = rows.filter((r) => r.description.trim() !== "" || r.itemNo.trim() !== "");
  const total = filled.reduce((a, r) => a + ext(r), 0);
  const totalQty = filled.reduce((a, r) => a + (Number(r.quantity) || 0), 0);

  // ---- Excel-like: keyboard navigation --------------------------------------
  function focusCell(row, col) {
    const el = tableRef.current?.querySelector(`[data-r="${row}"][data-c="${col}"]`);
    if (el) { el.focus(); if (el.select) el.select(); }
  }
  function onKeyDown(e, i, ci) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (i === rows.length - 1) { addRow(); setTimeout(() => focusCell(i + 1, ci), 30); }
      else focusCell(i + 1, ci);
    } else if (e.key === "ArrowDown") { e.preventDefault(); focusCell(i + 1, ci); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(i - 1, ci); }
  }

  // ---- Excel-like: paste rows straight from Excel ----------------------------
  // Excel copies as tab-separated columns, newline-separated rows. If the
  // clipboard has tabs/newlines, spread it across the grid starting at the
  // cell where it was pasted (columns map in template order).
  function onPaste(e, i, ci) {
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!text.includes("\t") && !text.includes("\n")) return; // single value — normal paste
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    setRows((rs) => {
      const next = [...rs];
      lines.forEach((line, li) => {
        const r = i + li;
        while (r >= next.length) next.push(blankRow());
        const vals = line.split("\t");
        const updated = { ...next[r], _dirty: true };
        vals.forEach((v, vi) => {
          const col = COLS[ci + vi];
          if (!col) return;
          updated[col] = col === "furnInst" && !FURN_OPTIONS.includes(v.trim()) ? updated.furnInst : v.trim();
        });
        next[r] = updated;
      });
      return next;
    });
  }

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
          furnInst: r.furnInst || null, lineType: "Standard",
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
        {editing && <span className="text-xs text-rebar hidden sm:inline">· paste rows from Excel · Enter moves down</span>}
        <span className="ml-auto" />
        {state.saved && <span className="text-xs text-ok">Saved ✓</span>}
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Edit</button>
        ) : (
          <>
            <button onClick={saveSheet} disabled={state.saving || filled.length === 0} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{state.saving ? "Saving…" : "Save sheet"}</button>
            {items.length > 0 && <button onClick={() => { setRows(items.map((li) => ({ id: li.id, itemNo: li.itemNo || "", description: li.description || "", quantity: li.quantity ?? "", unit: li.unit || "LBS", unitPrice: li.unitPrice ?? "", furnInst: li.furnInst || "", _dirty: false }))); setEditing(false); }} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>}
          </>
        )}
      </div>

      {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">Couldn&apos;t save: {state.error}</div>}

      <div className="rounded-lg border border-line overflow-x-auto" ref={tableRef}>
        <table className="w-full text-sm" style={{ minWidth: 780 }}>
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium px-3 py-2.5 w-24">Item No.</th>
              <th className="text-left font-medium px-3 py-2.5">Description</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Quantity</th>
              <th className="text-left font-medium px-3 py-2.5 w-20">Unit</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Unit Price</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Extended</th>
              <th className="text-left font-medium px-3 py-2.5 w-36">Furn/Inst</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {!editing && rows.map((r, i) => (
              <tr key={"v" + i} className="border-t border-line">
                <td className="px-3 py-2.5 text-concrete/80">{r.itemNo || "—"}</td>
                <td className="px-3 py-2.5 text-concrete">{r.description}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-concrete">{r.quantity === "" ? "—" : Number(r.quantity).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-concrete/70">{r.unit}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-concrete/80">{r.unitPrice === "" ? "—" : `$${Number(r.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-concrete/80">{money(ext(r))}</td>
                <td className="px-3 py-2.5 text-concrete/70">{r.furnInst || "—"}</td>
                <td></td>
              </tr>
            ))}
            {editing && rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-1.5 py-1"><input data-r={i} data-c={0} onKeyDown={(e) => onKeyDown(e, i, 0)} onPaste={(e) => onPaste(e, i, 0)} className="cell" value={r.itemNo} onChange={(e) => setCell(i, "itemNo", e.target.value)} placeholder="28410" /></td>
                <td className="px-1.5 py-1"><input data-r={i} data-c={1} onKeyDown={(e) => onKeyDown(e, i, 1)} onPaste={(e) => onPaste(e, i, 1)} className="cell" value={r.description} onChange={(e) => setCell(i, "description", e.target.value)} placeholder="Bridge Deck" /></td>
                <td className="px-1.5 py-1"><input data-r={i} data-c={2} onKeyDown={(e) => onKeyDown(e, i, 2)} onPaste={(e) => onPaste(e, i, 2)} type="text" inputMode="decimal" className="cell text-right" value={r.quantity} onChange={(e) => setCell(i, "quantity", e.target.value)} placeholder="0" /></td>
                <td className="px-1.5 py-1"><input data-r={i} data-c={3} onKeyDown={(e) => onKeyDown(e, i, 3)} onPaste={(e) => onPaste(e, i, 3)} className="cell" value={r.unit} onChange={(e) => setCell(i, "unit", e.target.value)} /></td>
                <td className="px-1.5 py-1"><input data-r={i} data-c={4} onKeyDown={(e) => onKeyDown(e, i, 4)} onPaste={(e) => onPaste(e, i, 4)} type="text" inputMode="decimal" className="cell text-right" value={r.unitPrice} onChange={(e) => setCell(i, "unitPrice", e.target.value)} placeholder="0.30" /></td>
                <td className="px-3 py-1 text-right tabular-nums text-concrete/80">{money(ext(r))}</td>
                <td className="px-1.5 py-1">
                  <select data-r={i} data-c={5} onKeyDown={(e) => onKeyDown(e, i, 5)} className="cell" value={r.furnInst} onChange={(e) => setCell(i, "furnInst", e.target.value)}>
                    {FURN_OPTIONS.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1 text-center">
                  <button onClick={() => deleteSavedRow(i)} className="text-rebar hover:text-danger text-xs" title={r.id ? "Delete line item" : "Remove row"}>✕</button>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-line bg-graphite/40">
              <td className="px-3 py-2.5 text-xs text-rebar" colSpan={2}>TOTAL</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-concrete">{totalQty.toLocaleString()}</td>
              <td></td><td></td>
              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-concrete">{money(total)}</td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3">
        {!editing && <span className="text-xs text-rebar">{filled.length} line item{filled.length === 1 ? "" : "s"} · saved as the itemized proposal — becomes the billing schedule when the job is won</span>}
        {editing && <button onClick={addRow} className="text-sm px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite">+ Add row</button>}
        {editing && <span className="text-xs text-rebar">{filled.length} line item{filled.length === 1 ? "" : "s"} · new lines save as <span className="text-concrete">Proposed</span> · copy rows in Excel and paste into any cell</span>}
      </div>

      <style jsx>{`
        .cell { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; font-size: 13px; color: var(--text); outline: none; }
        .cell:focus { border-color: var(--accent); }
      `}</style>
    </div>
  );
}
