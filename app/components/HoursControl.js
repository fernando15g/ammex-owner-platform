"use client";

// =============================================================================
// HOURS SOURCE — the one control that decides which labor-hours source a job
// uses. Auto (timecards if any, else payroll) · Payroll (use the payroll number
// as-is; editable — also the close-out "final") · Combined (frozen payroll
// baseline + only timecard hours logged since the combine anchor).
//
// It writes Hours Mode (+ freezes Combine Baseline when Combined is picked, +
// the payroll number in Payroll mode) — the SAME fields the resolver reads, so
// wherever this control appears (Active panel, Performance modal) they stay in
// perfect lockstep. Selecting Combined freezes the current timesheet total so
// only new hours after that moment add on.
// =============================================================================

import { useState } from "react";

const n0 = (n) => (typeof n === "number" ? Math.round(n).toLocaleString() : "—");

export default function HoursControl({ projectId, mode = "auto", timesheet, payroll, baseline }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(payroll ?? "");

  const patch = async (changes) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Couldn't save");
      window.location.reload();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  const pick = (m) => {
    if (m === mode || busy) return;
    patch({ hoursMode: m === "payroll" ? "Payroll" : m === "combined" ? "Combined" : "Auto" });
  };

  const savePayroll = () => {
    const v = Number(val);
    if (val === "" || Number.isNaN(v) || v < 0) { setErr("Enter a number"); return; }
    patch({ payrollHours: v, hoursMode: "Payroll" });
  };

  const Btn = ({ m, label }) => (
    <button onClick={() => pick(m)} disabled={busy}
      className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${mode === m ? "bg-safety text-steel border-safety font-medium" : "border-line text-rebar hover:text-concrete"}`}>
      {label}
    </button>
  );

  const combinedTotal = (typeof payroll === "number" ? payroll : 0) + (typeof timesheet === "number" ? timesheet : 0);

  return (
    <div className="mt-3 rounded-md border border-line p-3" style={{ background: "var(--surface)" }}>
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-rebar mb-2.5">
        <span className="text-[10px] uppercase tracking-wider text-rebar/70">hours source</span>
        <span>timesheet <span className="text-concrete tabular-nums">{n0(timesheet)}</span></span>
        <span>payroll <span className="text-concrete tabular-nums">{n0(payroll)}</span></span>
        {mode === "combined" && <span>combined <span className="text-concrete tabular-nums">{n0(combinedTotal)}</span></span>}
      </div>
      <div className="flex items-center gap-1.5">
        <Btn m="auto" label="Auto" />
        <Btn m="payroll" label="Payroll" />
        <Btn m="combined" label="Combined" />
      </div>
      {mode === "payroll" && (
        <div className="mt-2.5 flex items-center gap-2">
          {editing ? (
            <>
              <span className="text-[11px] text-rebar">Payroll hours</span>
              <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") savePayroll(); if (e.key === "Escape") setEditing(false); }} inputMode="numeric" className="w-24 text-sm px-2 py-1 rounded border border-line bg-transparent text-concrete text-right focus:outline-none focus:border-rebar" />
              <button onClick={savePayroll} disabled={busy} className="text-xs px-2 py-1 rounded bg-safety text-steel font-medium disabled:opacity-40">Save</button>
              <button onClick={() => setEditing(false)} className="text-xs text-rebar hover:text-concrete px-1" aria-label="Cancel">✕</button>
            </>
          ) : (
            <button onClick={() => { setVal(payroll ?? ""); setErr(null); setEditing(true); }} className="text-[11px] text-info hover:underline">edit payroll hours →</button>
          )}
        </div>
      )}
      {err && <p className="text-[11px] text-danger mt-1.5">{err}</p>}
    </div>
  );
}
