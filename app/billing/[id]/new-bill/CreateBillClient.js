"use client";

// =============================================================================
// CREATE BILL — the admin's billing template, live.
// Start each invoice by either CONFIRMING THE BID SHEET (view it, use it, add
// to it) or STARTING BLANK from the fabricator's weight sheet. Paste whole
// rows from the weight sheet (Item No | Description | Qty | Unit Price) — rows
// matching an existing Item No update that line's to-date qty; new item numbers
// become new lines. Invoice 2+ carries forward from the last invoice
// automatically (Previous = what's been billed); a Last Invoice panel shows the
// prior bill and can undo it. Retention is a TOGGLE (off unless the job has it).
// =============================================================================

import { useState, useMemo } from "react";

const money = (n) => (typeof n !== "number" || isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const qf = (n) => (typeof n !== "number" || isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 1 }));
const num = (v) => (v === "" || v == null ? null : Number(v));

export default function CreateBillClient({ data }) {
  const priorBills = data.events.filter((e) => e.type === "Bill" && (e.amount || 0) > 0);
  const isFirstInvoice = priorBills.length === 0;
  const hasBidLines = data.lines.length > 0;

  // last invoice (for the panel + undo): newest bill with a snapshot
  const lastBill = priorBills.find((e) => (e.notes || "").includes("[snap]")) || null;
  const lastSnap = useMemo(() => {
    if (!lastBill) return null;
    const m = (lastBill.notes || "").match(/\[snap\](\{.*\})\s*$/s);
    try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
  }, [lastBill]);

  // start mode: first invoice with bid lines -> chooser; otherwise carry forward
  const [mode, setMode] = useState(isFirstInvoice && hasBidLines ? "choose" : "grid");

  // rows: existing lines (locked identity, enter to-date) + new rows (editable)
  const fromLines = () => data.lines.map((li) => ({
    lineId: li.id, itemNo: li.itemNo || "", description: li.description || "",
    estimateQty: li.quantity ?? "", unit: li.unit || "LBS", unitPrice: li.unitPrice ?? "",
    prevQty: li.qtyToDate || 0, toDateQty: "", furnInst: li.furnInst || null,
  }));
  const [rows, setRows] = useState(() => (isFirstInvoice && hasBidLines ? [] : fromLines()));
  const [head, setHead] = useState({
    invoiceNumber: "", date: new Date().toISOString().slice(0, 10), dueDate: "", notes: "",
    retentionEnabled: !!data.settings.retentionEnabled,
    retentionPct: data.settings.retentionPercent ?? "",
  });
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showLast, setShowLast] = useState(false);
  const [state, setState] = useState({ saving: false, genning: false, error: null });

  const setCell = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const addBlankRow = () => setRows((rs) => [...rs, { lineId: null, itemNo: "", description: "", estimateQty: "", unit: "LBS", unitPrice: "", prevQty: 0, toDateQty: "", furnInst: null }]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, j) => j !== i));

  // ---- live invoice math (mirrors the template) ------------------------------
  const pct = head.retentionEnabled ? Number(head.retentionPct) || 0 : 0;
  const calc = useMemo(() => {
    const out = rows.map((r) => {
      const prev = r.prevQty || 0;
      const toDate = num(r.toDateQty) != null ? Number(r.toDateQty) : prev;
      const price = num(r.unitPrice) || 0;
      const thisQty = toDate - prev;
      const thisAmt = thisQty * price;
      const ret = r.furnInst === "Furnish" ? 0 : Math.max(thisAmt, 0) * (pct / 100);
      return { ...r, toDate, price, thisQty, thisAmt, toDateAmt: toDate * price, prevAmt: prev * price, ret };
    });
    const gross = out.reduce((a, r) => a + r.thisAmt, 0);
    const retention = out.reduce((a, r) => a + r.ret, 0);
    return { rows: out, gross, retention, totalDue: gross - retention, toDateAmt: out.reduce((a, r) => a + r.toDateAmt, 0), prevAmt: out.reduce((a, r) => a + r.prevAmt, 0) };
  }, [rows, pct]);

  // ---- weight-sheet paste: whole rows, matched by Item No --------------------
  function applyPaste() {
    const lines = pasteText.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { setShowPaste(false); return; }
    setRows((rs) => {
      const next = [...rs];
      for (const raw of lines) {
        const cols = raw.split("\t").map((c) => c.trim());
        const [itemNo = "", description = "", qty = "", price = ""] = cols;
        const cleanQty = qty.replace(/[,]/g, "");
        const cleanPrice = price.replace(/[$,]/g, "");
        // match existing row by item no (grid first, then bid lines not yet in grid)
        const gi = next.findIndex((r) => r.itemNo && itemNo && r.itemNo === itemNo);
        if (gi >= 0) {
          next[gi] = { ...next[gi], toDateQty: cleanQty !== "" ? cleanQty : next[gi].toDateQty };
        } else {
          const li = data.lines.find((l) => l.itemNo && l.itemNo === itemNo);
          if (li) {
            next.push({ lineId: li.id, itemNo: li.itemNo, description: li.description || description, estimateQty: li.quantity ?? "", unit: li.unit || "LBS", unitPrice: li.unitPrice ?? "", prevQty: li.qtyToDate || 0, toDateQty: cleanQty, furnInst: li.furnInst || null });
          } else {
            next.push({ lineId: null, itemNo, description, estimateQty: cleanQty, unit: "LBS", unitPrice: cleanPrice, prevQty: 0, toDateQty: cleanQty, furnInst: null });
          }
        }
      }
      return next;
    });
    setPasteText(""); setShowPaste(false);
  }

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
          invoiceNumber: head.invoiceNumber, date: head.date, dueDate: head.dueDate || null, notes: head.notes,
          retentionEnabled: head.retentionEnabled, retentionPct: num(head.retentionPct) || 0,
          rows: rows.map((r) => ({ lineId: r.lineId, itemNo: r.itemNo, description: r.description, unit: r.unit, unitPrice: num(r.unitPrice), estimateQty: num(r.estimateQty), toDateQty: num(r.toDateQty) })),
        }),
      });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      window.location.href = `/billing/${data.id}`;
    } catch (e) { setState({ saving: false, genning: false, error: String(e.message || e) }); }
  }

  async function undoLast() {
    if (!lastBill) return;
    if (!window.confirm(`Undo ${lastBill.invoiceNumber || "the last invoice"}? Quantities reverse and the invoice is voided (kept for the record).`)) return;
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await fetch("/api/billing/undo-bill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: lastBill.id }) });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      window.location.reload();
    } catch (e) { setState((s) => ({ ...s, saving: false, error: String(e.message || e) })); }
  }

  // ---- START MODE CHOOSER (first invoice) ------------------------------------
  if (mode === "choose") {
    return (
      <div className="max-w-3xl">
        <BackLink id={data.id} />
        <p className="text-sm text-rebar mb-4">First invoice for this job — how do you want to start? The bid sheet is the proposal; weights can change, so confirm it or start from the fabricator&apos;s weight sheet.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <button onClick={() => { setRows(fromLines()); setMode("grid"); }} className="text-left rounded-lg border border-line p-5 hover:border-safety" style={{ background: "var(--surface)" }}>
            <p className="text-concrete font-medium mb-1">Use the bid sheet</p>
            <p className="text-xs text-rebar">Load the {data.lines.length} proposal line{data.lines.length === 1 ? "" : "s"} below to confirm — you can adjust and add more before billing.</p>
          </button>
          <button onClick={() => { setRows([]); setMode("grid"); }} className="text-left rounded-lg border border-line p-5 hover:border-safety" style={{ background: "var(--surface)" }}>
            <p className="text-concrete font-medium mb-1">Start blank (weight sheet)</p>
            <p className="text-xs text-rebar">Paste rows straight from the fabricator&apos;s weight sheet — matching item numbers update the bid lines automatically.</p>
          </button>
        </div>
        {/* bid sheet preview */}
        <div className="mt-6 rounded-lg border border-line overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium px-3 py-2">Item No.</th><th className="text-left font-medium px-3 py-2">Description</th>
              <th className="text-right font-medium px-3 py-2">Qty</th><th className="text-right font-medium px-3 py-2">Unit Price</th>
            </tr></thead>
            <tbody>{data.lines.map((li) => (
              <tr key={li.id} className="border-t border-line">
                <td className="px-3 py-2 text-concrete/70">{li.itemNo || "—"}</td>
                <td className="px-3 py-2 text-concrete">{li.description}</td>
                <td className="px-3 py-2 text-right tabular-nums text-concrete/80">{qf(li.quantity)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-concrete/80">{li.unitPrice ?? "—"}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- THE BILL GRID ----------------------------------------------------------
  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <BackLink id={data.id} />
        <span className="ml-auto" />
        {lastBill && <button onClick={() => setShowLast((s) => !s)} className="text-sm px-3 py-2 rounded-md border border-line text-rebar hover:text-concrete">{showLast ? "Hide" : "Last invoice"}</button>}
        <button onClick={() => setShowPaste((s) => !s)} className="text-sm px-3 py-2 rounded-md border border-line text-concrete hover:bg-graphite">Paste weight sheet</button>
        <button onClick={saveBill} disabled={state.saving || calc.gross <= 0} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{state.saving ? "Saving…" : "Save invoice"}</button>
      </div>

      {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">{state.error}</div>}

      {/* last invoice panel */}
      {showLast && lastBill && (
        <div className="rounded-lg border border-line p-4 mb-4" style={{ background: "var(--surface)" }}>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-sm text-concrete font-medium">{lastBill.invoiceNumber || lastBill.name} · {lastBill.date ? new Date(lastBill.date).toLocaleDateString() : ""}</p>
            <span className="text-xs text-rebar">billed {money(lastBill.amount)} · retention {money(lastBill.retentionWithheld || 0)}</span>
            <button onClick={undoLast} disabled={state.saving} className="ml-auto text-xs px-2.5 py-1 rounded border border-danger/50 text-danger hover:bg-danger/10 disabled:opacity-40">Undo this invoice</button>
          </div>
          {lastSnap && (
            <div className="text-xs text-rebar space-y-0.5">
              {lastSnap.lines.map((l, i) => {
                const line = data.lines.find((x) => x.id === l.id);
                return <div key={i} className="flex justify-between"><span>{line ? `${line.itemNo ? line.itemNo + " · " : ""}${line.description}` : "line"}</span><span className="tabular-nums">{qf(l.q)} @ {l.u} = {money(l.q * l.u)}</span></div>;
              })}
            </div>
          )}
        </div>
      )}

      {/* paste box */}
      {showPaste && (
        <div className="rounded-lg border border-line p-4 mb-4" style={{ background: "var(--surface)" }}>
          <p className="text-xs text-rebar mb-2">Copy rows from the weight sheet in Excel and paste here — columns: <span className="text-concrete">Item No · Description · Qty · Unit Price</span>. Matching item numbers update those lines&apos; to-date qty; new item numbers become new lines.</p>
          <textarea className="inp min-h-[100px] font-mono text-xs" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"28410\tAbut 1 & 2 Cap\t19936\t0.30"} />
          <div className="flex gap-2 mt-2">
            <button onClick={applyPaste} className="text-sm px-3 py-1.5 rounded-md bg-safety text-steel font-medium">Apply</button>
            <button onClick={() => { setPasteText(""); setShowPaste(false); }} className="text-sm px-3 py-1.5 rounded-md border border-line text-rebar">Cancel</button>
          </div>
        </div>
      )}

      {/* invoice header */}
      <div className="grid sm:grid-cols-5 gap-3 mb-4">
        <label className="block sm:col-span-2">
          <span className="text-xs text-rebar mb-1 block">Invoice number</span>
          <div className="flex gap-2">
            <input className="inp" value={head.invoiceNumber} onChange={(e) => setHead({ ...head, invoiceNumber: e.target.value })} placeholder={`${data.projectId || "26-XX"}-INV-${priorBills.length + 1}`} />
            <button onClick={generateInvoiceNumber} disabled={state.genning} className="text-xs px-2.5 rounded border border-line text-rebar hover:text-concrete whitespace-nowrap disabled:opacity-40">{state.genning ? "…" : "Generate"}</button>
          </div>
        </label>
        <label className="block"><span className="text-xs text-rebar mb-1 block">Bill date</span><input type="date" className="inp" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} /></label>
        <label className="block"><span className="text-xs text-rebar mb-1 block">Due date</span><input type="date" className="inp" value={head.dueDate} onChange={(e) => setHead({ ...head, dueDate: e.target.value })} /></label>
        <div className="block">
          <span className="text-xs text-rebar mb-1 block">Retention</span>
          <div className="flex items-center gap-2 pt-1.5">
            <label className="flex items-center gap-1.5 text-sm text-concrete"><input type="checkbox" checked={head.retentionEnabled} onChange={(e) => setHead({ ...head, retentionEnabled: e.target.checked })} /> held</label>
            {head.retentionEnabled && <input type="text" inputMode="decimal" className="inp" style={{ width: 64 }} value={head.retentionPct} onChange={(e) => setHead({ ...head, retentionPct: e.target.value })} placeholder="10" />}
            {head.retentionEnabled && <span className="text-xs text-rebar">%</span>}
          </div>
        </div>
      </div>

      {/* the template grid */}
      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 1020 }}>
          <thead>
            <tr className="bg-graphite text-rebar text-[10px] uppercase tracking-wider">
              <th className="text-left font-medium px-2 py-2 w-24" rowSpan={2}>Bid No.</th>
              <th className="text-left font-medium px-2 py-2" rowSpan={2}>Description</th>
              <th className="text-right font-medium px-2 py-2 w-24" rowSpan={2}>Estimate Qty</th>
              <th className="text-right font-medium px-2 py-2 w-24" rowSpan={2}>Unit Price</th>
              <th className="text-center font-medium px-2 py-1.5 border-l border-line" colSpan={2}>Total Work To Date</th>
              <th className="text-center font-medium px-2 py-1.5 border-l border-line" colSpan={2}>Previous Work</th>
              <th className="text-center font-medium px-2 py-1.5 border-l border-line" colSpan={2}>Work This Estimate</th>
              <th className="w-8" rowSpan={2}></th>
            </tr>
            <tr className="bg-graphite text-rebar text-[10px] uppercase tracking-wider">
              <th className="text-right font-medium px-2 py-1.5 border-l border-line w-28">Qty</th>
              <th className="text-right font-medium px-2 py-1.5 w-24">Amt</th>
              <th className="text-right font-medium px-2 py-1.5 border-l border-line w-24">Qty</th>
              <th className="text-right font-medium px-2 py-1.5 w-24">Amt</th>
              <th className="text-right font-medium px-2 py-1.5 border-l border-line w-24">Qty</th>
              <th className="text-right font-medium px-2 py-1.5 w-24">Amt</th>
            </tr>
          </thead>
          <tbody>
            {calc.rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-1.5 py-1">{r.lineId ? <span className="px-1.5 text-concrete/70">{r.itemNo || "—"}</span> : <input className="cell" value={r.itemNo} onChange={(e) => setCell(i, "itemNo", e.target.value)} placeholder="28410" />}</td>
                <td className="px-1.5 py-1">{r.lineId ? <span className="px-1.5 text-concrete">{r.description}</span> : <input className="cell" value={r.description} onChange={(e) => setCell(i, "description", e.target.value)} placeholder="Description" />}</td>
                <td className="px-1.5 py-1">{r.lineId ? <span className="block text-right px-1.5 tabular-nums text-concrete/70">{qf(num(r.estimateQty))}</span> : <input type="text" inputMode="decimal" className="cell text-right" value={r.estimateQty} onChange={(e) => setCell(i, "estimateQty", e.target.value)} />}</td>
                <td className="px-1.5 py-1">{r.lineId ? <span className="block text-right px-1.5 tabular-nums text-concrete/70">{r.unitPrice}</span> : <input type="text" inputMode="decimal" className="cell text-right" value={r.unitPrice} onChange={(e) => setCell(i, "unitPrice", e.target.value)} placeholder="0.30" />}</td>
                <td className="px-1.5 py-1 border-l border-line"><input type="text" inputMode="decimal" className="cell text-right" value={r.toDateQty} placeholder={String(r.prevQty)} onChange={(e) => setCell(i, "toDateQty", e.target.value)} /></td>
                <td className="px-2 py-1 text-right tabular-nums text-concrete/80">{money(r.toDateAmt)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-concrete/60 border-l border-line">{qf(r.prevQty)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-concrete/60">{money(r.prevAmt)}</td>
                <td className={`px-2 py-1 text-right tabular-nums border-l border-line ${r.thisQty < 0 ? "text-danger" : "text-concrete"}`}>{qf(r.thisQty)}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${r.thisAmt < 0 ? "text-danger" : "text-concrete"}`}>{money(r.thisAmt)}</td>
                <td className="px-1 py-1 text-center">{!r.lineId && <button onClick={() => removeRow(i)} className="text-rebar hover:text-danger text-xs">✕</button>}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line bg-graphite/40">
              <td colSpan={4} className="px-3 py-2 text-xs text-rebar text-right">TOTALS</td>
              <td className="border-l border-line"></td>
              <td className="px-2 py-2 text-right tabular-nums text-concrete/80">{money(calc.toDateAmt)}</td>
              <td className="border-l border-line"></td>
              <td className="px-2 py-2 text-right tabular-nums text-concrete/60">{money(calc.prevAmt)}</td>
              <td className="border-l border-line"></td>
              <td className="px-2 py-2 text-right tabular-nums font-medium text-concrete">{money(calc.gross)}</td>
              <td></td>
            </tr>
            {head.retentionEnabled && (
              <tr className="bg-graphite/40">
                <td colSpan={9} className="px-3 py-1.5 text-xs text-rebar text-right">Retention ({pct}% labor only)</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-warn">−{money(calc.retention)}</td>
                <td></td>
              </tr>
            )}
            <tr className="bg-graphite/40 border-t border-line">
              <td colSpan={9} className="px-3 py-2.5 text-xs text-concrete font-semibold text-right">TOTAL DUE</td>
              <td className="px-2 py-2.5 text-right tabular-nums font-bold text-safety text-base">{money(calc.totalDue)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button onClick={addBlankRow} className="text-sm px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite">+ Add row</button>
        <label className="block flex-1"><input className="inp" value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} placeholder="Notes — e.g. extras e4-e5" /></label>
      </div>
      <p className="text-xs text-rebar mt-3">Enter each line&apos;s new <span className="text-concrete">Total Work To Date</span> (from the weight sheet), or use Paste weight sheet. Blank = unchanged. This Estimate = To Date − Previous. Saving creates the invoice and carries these quantities into the next one.</p>

      <style jsx>{`
        .cell { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; font-size: 13px; color: var(--text); outline: none; }
        .cell:focus { border-color: var(--accent); }
      `}</style>
    </div>
  );
}

function BackLink({ id }) {
  return (
    <a href={`/billing/${id}`} className="inline-flex items-center gap-1.5 text-sm text-rebar hover:text-concrete">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      Project billing
    </a>
  );
}
