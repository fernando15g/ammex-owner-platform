"use client";
import { confirmDialog } from "@/app/components/Dialog";

import ProposalButton from "@/app/pipeline/ProposalButton";

// =============================================================================
// BID SHEET — mimics the admin's Excel proposal template TO THE T:
//   Item No | Description | Quantity | Unit | Unit Price | Extended | Furn/Inst
// Excel-like: paste rows straight from Excel, Enter moves down (adds a row at
// the bottom), arrow keys move up/down, Tab moves across. Extended
// auto-computes; TOTAL at the bottom. Lines save as "Proposed".
// =============================================================================

import { useState, useRef, useMemo } from "react";
import ManageOptions from "@/app/components/ManageOptions";

const money = (n) => (typeof n !== "number" || isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

const FURN_OPTIONS = ["", "Furnish", "Install", "Furnish+Install"];
// PT LBS is deliberately its own unit: it bills by weight like rebar, but the
// weight test matches only "LBS" exactly, so PT stays out of the lbs/MH numbers.
const UNIT_OPTIONS = ["LBS", "PT LBS", "SF", "HRS", "LF", "EA", "LS"];
// column order for keyboard nav + Excel paste (matches her template order)
const COLS = ["itemNo", "description", "quantity", "unit", "unitPrice", "furnInst"];

const blankRow = () => ({ id: null, itemNo: "", description: "", quantity: "", unit: "LBS", unitPrice: "", furnInst: "", _dirty: true });

// Numbers pasted or typed from Excel arrive dressed up: "$0.4175", "296,593",
// "1,234.56", stray spaces. Number() chokes on all of them and returns NaN,
// which the extended-price math reads as 0 — so a whole line silently drops out
// of the bid total (a real underpricing risk, not cosmetic). cleanNumStr strips
// the currency symbol, thousands commas and spaces, leaving a clean parseable
// value; kept as a STRING so the field still shows what the user has and an
// in-progress entry like "0." or "-" isn't clobbered mid-type.
const NUMERIC_COLS = new Set(["quantity", "unitPrice"]);

// Units: type-to-match against known units (case-insensitive), so "lbs" resolves
// to "LBS" instead of breeding a duplicate. Genuinely new units are added
// DELIBERATELY via the reconcile bar, never silently by typing. Mappings you
// define ("sq ft" means "SF") are remembered per browser so a bulk paste from
// the same Excel sheet auto-corrects next time.
const UNIT_MAP_KEY = "ammex-unit-map";
const loadUnitMap = () => {
  try { return JSON.parse(localStorage.getItem(UNIT_MAP_KEY) || "{}"); } catch { return {}; }
};
const saveUnitMap = (m) => { try { localStorage.setItem(UNIT_MAP_KEY, JSON.stringify(m)); } catch {} };
const canonUnit = (v, known, map) => {
  const t = String(v || "").trim();
  if (!t) return "";
  const mapped = map[t.toLowerCase()];
  if (mapped) return mapped;
  const hit = known.find((k) => k.toLowerCase() === t.toLowerCase());
  return hit || t; // unknown stays as typed (flagged in the reconcile bar)
};
const cleanNumStr = (v) => {
  if (typeof v !== "string") return v;
  const stripped = v.replace(/[$,\s]/g, "");
  const m = stripped.match(/^-?\d*\.?\d*/);
  return m ? m[0] : "";
};
const num = (v) => {
  const c = typeof v === "string" ? cleanNumStr(v) : v;
  return c === "" || c == null ? null : Number(c);
};

export default function BidSheetClient({ data, linkedProject = null }) {
  const { bid, items } = data;
  const [rows, setRows] = useState(() =>
    items.length > 0
      ? items.map((li) => ({ id: li.id, itemNo: li.itemNo || "", description: li.description || "", quantity: li.quantity ?? "", unit: li.unit || "LBS", unitPrice: li.unitPrice ?? "", furnInst: li.furnInst || "", _dirty: false }))
      : [blankRow(), blankRow(), blankRow()]
  );
  const [state, setState] = useState({ saving: false, saved: false, error: null });
  const [extraUnits, setExtraUnits] = useState([]);           // deliberately-added new units (this session)
  const [unitMap, setUnitMap] = useState(loadUnitMap);         // your remembered "means" mappings
  const knownUnits = useMemo(() => {
    const fromItems = (items || []).map((li) => li.unit).filter(Boolean);
    return [...new Set([...UNIT_OPTIONS, ...fromItems, ...extraUnits])];
  }, [items, extraUnits]);
  // distinct units currently on the sheet that aren't known — drive the reconcile bar
  const unknownUnits = useMemo(() => {
    const seen = new Set();
    for (const r of rows) {
      const u = String(r.unit || "").trim();
      if (u && !knownUnits.some((k) => k.toLowerCase() === u.toLowerCase())) seen.add(u);
    }
    return [...seen];
  }, [rows, knownUnits]);
  const resolveUnknown = (raw, target) => {
    // target = a known unit to map to, or "__new__" to add raw as a new unit
    if (target === "__new__") { setExtraUnits((xs) => [...new Set([...xs, raw])]); return; }
    setRows((rs) => rs.map((r) => (String(r.unit || "").trim().toLowerCase() === raw.toLowerCase() ? { ...r, unit: target, _dirty: true } : r)));
    const next = { ...unitMap, [raw.toLowerCase()]: target };
    setUnitMap(next); saveUnitMap(next);
  };
  const [editing, setEditing] = useState(items.length === 0); // no sheet yet -> straight to entry
  const tableRef = useRef(null);

  const setCell = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: NUMERIC_COLS.has(k) ? cleanNumStr(v) : v, _dirty: true } : r)));
  // Furn/Inst is almost always one value for a whole job. Track a default so new
  // rows inherit it, and "set all" stamps every row at once (the fill-down move).
  const [furnDefault, setFurnDefault] = useState(() => {
    const counts = {};
    for (const li of items) { const f = li.furnInst; if (f) counts[f] = (counts[f] || 0) + 1; }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "";
  });
  const setAllFurnInst = (v) => { setFurnDefault(v); setRows((rs) => rs.map((r) => ({ ...r, furnInst: v, _dirty: true }))); };
  const addRow = () => setRows((rs) => [...rs, { ...blankRow(), furnInst: furnDefault }]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i));

  async function deleteSavedRow(i) {
    const r = rows[i];
    if (!r.id) { removeRow(i); return; }
    if (!(await confirmDialog({ title: `Delete "${r.description || r.itemNo || "this line"}"?`, message: "Unbilled lines delete cleanly. Billed lines will be blocked (close them instead).", confirmLabel: "Delete line", danger: true }))) return;
    setState((st) => ({ ...st, saving: true, error: null }));
    try {
      let res = await fetch(`/api/line-items/${r.id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      let d = await res.json();
      if (!d.ok && d.blocked) {
        if (await confirmDialog({ title: "Close this line instead?", message: d.error, confirmLabel: "Close line" })) {
          res = await fetch(`/api/line-items/${r.id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "close" }) });
          d = await res.json();
          if (!d.ok) throw new Error(d.error);
          // a closed line is NOT deleted — it stays as a closed line. Reload so it
          // reappears in its true state instead of vanishing like a clean delete.
          window.location.reload();
          return;
        } else { setState((st) => ({ ...st, saving: false })); return; }
      } else if (!d.ok) throw new Error(d.error);
      removeRow(i);
      setState((st) => ({ ...st, saving: false }));
    } catch (e) { setState((st) => ({ ...st, saving: false, error: String(e.message || e) })); }
  }

  const ext = (r) => (num(r.quantity) || 0) * (num(r.unitPrice) || 0);
  const filled = rows.filter((r) => r.description.trim() !== "" || r.itemNo.trim() !== "");
  const savedLineCount = rows.filter((r) => r.id).length;
  const total = filled.reduce((a, r) => a + ext(r), 0);
  const totalQty = filled.reduce((a, r) => a + (num(r.quantity) || 0), 0);

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
          if (col === "furnInst") { updated[col] = FURN_OPTIONS.includes(v.trim()) ? v.trim() : updated.furnInst; }
          else if (NUMERIC_COLS.has(col)) { updated[col] = cleanNumStr(v.trim()); }
          else if (col === "unit") { updated[col] = canonUnit(v, knownUnits, unitMap); }
          else { updated[col] = v.trim(); }
        });
        next[r] = updated;
      });
      return next;
    });
  }

  async function saveSheet() {
    setState({ saving: true, saved: false, error: null });
    try {
      const toCreate = [], toUpdate = [];
      for (const r of filled) {
        if (!r._dirty) continue;
        const payload = {
          description: r.description, itemNo: r.itemNo,
          quantity: num(r.quantity), unit: r.unit, unitPrice: num(r.unitPrice),
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
        {editing && <span className="text-xs text-rebar hidden sm:inline">· paste rows from Excel · Enter moves down</span>}
        <span className="ml-auto" />
        {/* The next step only appears once there IS a next step — i.e. after a
            successful save. Offering it beside Save, on an unsaved sheet, made it
            look like an alternative action and let you leave work behind. */}
        {state.saved && (
          <>
            <span className="text-xs text-ok">Saved ✓</span>
            {/* Always offer the way back to the bid — the sheet is a detour from it.
                The project link only appears when there's a project to go to. */}
            <a href={`/pipeline/${data.bid.id}`} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">
              ← Back to bid
            </a>
            {linkedProject ? (
              <a href={`/billing/${linkedProject.id}`} className="text-sm px-4 py-2 rounded-md border border-ok/50 text-ok hover:bg-ok/10 font-medium">
                Go to project →
              </a>
            ) : data.bid?.status === "Awarded" ? (
              <a href={`/projects/new?fromBid=${data.bid.id}&name=${encodeURIComponent(data.bid.name || "")}`} className="text-sm px-4 py-2 rounded-md border border-ok/50 text-ok hover:bg-ok/10 font-medium">
                Create project →
              </a>
            ) : null}
          </>
        )}
        {!editing ? (
          <>
            <a href={`/pipeline/${data.bid.id}`} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">← Back to bid</a>
            {linkedProject && (
              <a href={`/billing/${linkedProject.id}`} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Go to project →</a>
            )}
            <button onClick={() => setEditing(true)} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Edit</button>
          </>
        ) : (
          <>
            <button onClick={saveSheet} disabled={state.saving || filled.length === 0} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{state.saving ? "Saving…" : "Save sheet"}</button>
            {/* The proposal IS this sheet — the real Excel template, so it lands
                at the GC looking the way it always has. */}
            {savedLineCount > 0 && (
              <ProposalButton
                bidId={data.bid.id}
                bidName={data.bid.name}
                status={data.bid.status}
                submissionDate={data.bid.submissionDate}
              />
            )}
            {items.length > 0 && <button onClick={() => { setRows(items.map((li) => ({ id: li.id, itemNo: li.itemNo || "", description: li.description || "", quantity: li.quantity ?? "", unit: li.unit || "LBS", unitPrice: li.unitPrice ?? "", furnInst: li.furnInst || "", _dirty: false }))); setEditing(false); }} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>}
          </>
        )}
      </div>

      {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">Couldn&apos;t save: {state.error}</div>}

      <datalist id="unit-options">{knownUnits.map((u) => <option key={u} value={u} />)}</datalist>

      {/* Unrecognized units after a paste or typo: decide once, in bulk — map each
          to an existing unit (remembered for future pastes) or add it as new. */}
      {editing && unknownUnits.length > 0 && (
        <div className="rounded-lg border border-warn/50 bg-warn/10 p-3 mb-4 text-sm">
          <div className="text-concrete/90 font-medium mb-2">Unrecognized unit{unknownUnits.length > 1 ? "s" : ""}: decide what to do with each</div>
          <div className="space-y-1.5">
            {unknownUnits.map((u) => (
              <div key={u} className="flex items-center gap-2">
                <span className="text-warn font-medium w-24 truncate">&ldquo;{u}&rdquo;</span>
                <select
                  className="inp-sm"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) resolveUnknown(u, e.target.value); }}
                >
                  <option value="" disabled>Choose…</option>
                  {knownUnits.map((k) => <option key={k} value={k}>Map to {k}</option>)}
                  <option value="__new__">➕ Add &ldquo;{u}&rdquo; as a new unit</option>
                </select>
              </div>
            ))}
          </div>
          <div className="text-xs text-rebar mt-2">Mapping is remembered — next time you paste a sheet using that wording, it corrects automatically.</div>
        </div>
      )}

      <div className="rounded-lg border border-line overflow-x-auto" ref={tableRef}>
        <table className="w-full text-sm" style={{ minWidth: 780 }}>
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium px-3 py-2.5 w-24">Item No.</th>
              <th className="text-left font-medium px-3 py-2.5">Description</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Quantity</th>
              <th className="text-left font-medium px-3 py-2.5 w-20">Unit<ManageOptions prop="Unit" /></th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Unit Price</th>
              <th className="text-right font-medium px-3 py-2.5 w-28">Extended</th>
              <th className="text-left font-medium px-3 py-2.5 w-36">
                Furn/Inst
                {editing && rows.length > 1 && (
                  <select
                    value=""
                    onChange={(e) => { if (e.target.value !== "__") setAllFurnInst(e.target.value === "__blank" ? "" : e.target.value); }}
                    title="Set every line to one value"
                    className="ml-2 text-[10px] bg-transparent border border-line rounded px-1 py-0.5 text-rebar hover:text-concrete cursor-pointer normal-case tracking-normal font-normal"
                  >
                    <option value="__">set all…</option>
                    {FURN_OPTIONS.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                    <option value="__blank">— (clear)</option>
                  </select>
                )}
              </th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {!editing && rows.map((r, i) => (
              <tr key={"v" + i} className="border-t border-line">
                <td className="px-3 py-2.5 text-concrete/80">{r.itemNo || "—"}</td>
                <td className="px-3 py-2.5 text-concrete">{r.description}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-concrete">{r.quantity === "" ? "—" : (num(r.quantity) ?? 0).toLocaleString()}</td>
                <td className="px-3 py-2.5 text-concrete/70">{r.unit}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-concrete/80">{r.unitPrice === "" ? "—" : `$${(num(r.unitPrice) ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`}</td>
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
                <td className="px-1.5 py-1">
                  <input
                    data-r={i} data-c={3} list="unit-options"
                    onKeyDown={(e) => onKeyDown(e, i, 3)} onPaste={(e) => onPaste(e, i, 3)}
                    className={`cell ${r.unit && !knownUnits.some((k) => k.toLowerCase() === String(r.unit).trim().toLowerCase()) ? "border border-warn/60" : ""}`}
                    value={r.unit}
                    onChange={(e) => setCell(i, "unit", e.target.value)}
                    onBlur={(e) => setCell(i, "unit", canonUnit(e.target.value, knownUnits, unitMap))}
                    placeholder="LBS"
                  />
                </td>
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
