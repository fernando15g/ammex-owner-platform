"use client";

// =============================================================================
// BULK UPDATE — a spreadsheet-style grid for fast weekly updates across all
// active jobs. Columns: placed-to-date, labor hours (editable ONLY on payroll-
// era jobs; timesheet-era jobs are locked because their hours come from the
// timecard app), and notes. Changed cells highlight amber. Nothing writes until
// "Save all" — then only the changed cells go, per job, and a failed row flags
// itself while the rest still save.
// =============================================================================

import { useState } from "react";

const CELL = "w-full bg-transparent text-sm px-2 py-1.5 text-concrete focus:outline-none focus:ring-1 focus:ring-rebar rounded-sm";
const TD = "border border-line align-middle";

export default function BulkUpdate({ rows, onClose }) {
  const orig = {};
  rows.forEach((r) => {
    orig[r.id] = {
      placedLbs: r.placedLbs != null ? String(r.placedLbs) : "",
      hours: r.detail?.hoursEra === "payroll"
        ? (r.payrollHours != null ? String(r.payrollHours) : "")
        : (r.burn?.actualHours != null ? String(Math.round(r.burn.actualHours)) : ""),
      notes: r.notes || "",
    };
  });

  const [draft, setDraft] = useState(orig);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (id, field, val) => setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: val } }));
  const dirty = (id, field) => draft[id][field] !== orig[id][field];
  const rowDirty = (id) => ["placedLbs", "hours", "notes"].some((f) => dirty(id, f));
  const dirtyCount = rows.filter((r) => rowDirty(r.id)).length;

  async function saveAll() {
    setBusy(true); setErrors({});
    const toSave = rows.filter((r) => rowDirty(r.id));
    const results = await Promise.allSettled(toSave.map(async (r) => {
      const changes = {};
      if (dirty(r.id, "placedLbs")) { const n = Number(draft[r.id].placedLbs); if (!Number.isNaN(n)) changes.placedLbs = n; }
      if (dirty(r.id, "notes")) changes.notes = draft[r.id].notes;
      if (dirty(r.id, "hours") && r.detail?.hoursEra === "payroll") {
        const n = Number(draft[r.id].hours);
        if (!Number.isNaN(n)) { changes.payrollHours = n; changes.manualHoursOverride = true; }
      }
      if (Object.keys(changes).length === 0) return;
      const res = await fetch(`/api/projects/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "save failed");
    }));
    const errs = {};
    results.forEach((res, i) => { if (res.status === "rejected") errs[toSave[i].id] = String(res.reason?.message || res.reason); });
    if (Object.keys(errs).length) { setErrors(errs); setBusy(false); }
    else window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-5xl rounded-lg border border-line overflow-hidden flex flex-col" style={{ background: "var(--surface)", maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-rebar">Bulk update · active jobs</div>
            <h3 className="text-lg font-semibold text-concrete mt-0.5">Quick edits</h3>
          </div>
          <button onClick={onClose} className="ml-auto text-rebar hover:text-concrete text-sm px-1" aria-label="Close">✕</button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10" style={{ background: "var(--surface-2)" }}>
              <tr className="text-[11px] uppercase tracking-wider text-rebar">
                <th className="text-left font-normal px-4 py-2 min-w-[180px] border border-line">Job</th>
                <th className="text-left font-normal px-2 py-2 w-32 border border-line">Placed lbs</th>
                <th className="text-left font-normal px-2 py-2 w-36 border border-line">Labor hours</th>
                <th className="text-left font-normal px-2 py-2 min-w-[220px] border border-line">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const payroll = r.detail?.hoursEra === "payroll";
                return (
                  <tr key={r.id} className="border-t border-line">
                    <td className={`${TD} px-4 py-1.5 align-top`}>
                      <div className="text-concrete truncate max-w-[220px]">{r.name}</div>
                      <div className="text-[11px] text-rebar">{r.projectId}</div>
                      {errors[r.id] && <div className="text-[11px] text-danger mt-0.5">{errors[r.id]}</div>}
                    </td>
                    <td className={`${TD} ${dirty(r.id, "placedLbs") ? "bg-warn/15" : ""}`}>
                      <input value={draft[r.id].placedLbs} onChange={(e) => set(r.id, "placedLbs", e.target.value)} inputMode="numeric" className={CELL} placeholder="—" />
                    </td>
                    <td className={`${TD} ${dirty(r.id, "hours") ? "bg-warn/15" : ""}`}>
                      {payroll ? (
                        <input value={draft[r.id].hours} onChange={(e) => set(r.id, "hours", e.target.value)} inputMode="numeric" className={CELL} placeholder="—" />
                      ) : (
                        <div className="px-2 py-1.5 text-rebar/60 flex items-baseline gap-1.5" title="Hours come from the timecard app for this job">
                          <span className="tabular-nums">{draft[r.id].hours || "—"}</span><span className="text-[10px] uppercase tracking-wider">timecards</span>
                        </div>
                      )}
                    </td>
                    <td className={`${TD} ${dirty(r.id, "notes") ? "bg-warn/15" : ""}`}>
                      <input value={draft[r.id].notes} onChange={(e) => set(r.id, "notes", e.target.value)} className={CELL} placeholder="—" />
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-rebar">No active jobs.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t border-line">
          <span className="text-[11px] text-rebar">
            {dirtyCount > 0 ? `${dirtyCount} job${dirtyCount === 1 ? "" : "s"} changed` : "No changes yet"}
            {Object.keys(errors).length > 0 && " · some rows failed — fix and retry"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
            <button onClick={saveAll} disabled={busy || dirtyCount === 0} className="text-sm px-4 py-1.5 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{busy ? "Saving…" : "Save all"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
