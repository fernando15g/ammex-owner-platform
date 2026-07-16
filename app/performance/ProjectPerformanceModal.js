"use client";

// =============================================================================
// PROJECT PERFORMANCE — the popup behind a row click on /performance.
//
// Deliberately NOT project details (that lives in Active Work / the project
// page). This answers ONE question: how is this job performing, and what is
// that worth? Everything here reads straight off the performance row — no
// extra fetch, so it opens instantly and can never disagree with the table.
//
//   header     — status indicator: on target / watch / below target / missing
//   signals    — the three that only tell the truth together (prior-chat view):
//                hours % · placed % · productivity bid → actual
//   $ line     — what the productivity gap is costing (or saving) on this job
//   context    — trust state · billing pace · job runway · foreman
//   action     — "Go to project" (not "Edit project" — admin lives elsewhere)
// =============================================================================

import { useEffect, useState } from "react";

const money = (n) =>
  typeof n !== "number" || isNaN(n) ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(Math.abs(n) / 1e3)}k` : Math.round(Math.abs(n)).toLocaleString()}`;
const pct = (f, signed = false) => (typeof f !== "number" ? "—" : `${signed && f > 0 ? "+" : ""}${Math.round(f * 100)}%`);
const lbs = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
const num = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
const rate = (n) => (typeof n === "number" ? `${Math.round(n)}` : "—");
const dateStr = (s) => {
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const INDICATOR = {
  "on-target": { label: "On target", cls: "bg-ok/15 text-ok border-ok/40" },
  watch: { label: "Watch", cls: "bg-warn/15 text-warn border-warn/40" },
  "below-target": { label: "Below target", cls: "bg-danger/15 text-danger border-danger/40" },
  missing: { label: "Missing weight / hours", cls: "bg-graphite text-rebar border-line" },
  mobilizing: { label: "Mobilizing", cls: "bg-graphite text-rebar border-line" },
};

export default function ProjectPerformanceModal({ row, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!row) return null;
  const r = row;
  const ind = INDICATOR[r.indicator] || INDICATOR.missing;
  const b = r.burn || {};
  const slow = typeof r.variancePct === "number" && r.variancePct < -0.05;
  const fast = typeof r.variancePct === "number" && r.variancePct > 0.05;

  // $ line: done jobs use the settled costSlip; running jobs get a PROJECTION
  // (full-job hours at current pace vs the bid's hours, burdened).
  let dollar = null;
  const burdened = ((typeof r.baseWage === "number" && r.baseWage > 0 ? r.baseWage : 32)) * 1.2;
  if (r.state !== "in-progress" && typeof r.costSlip === "number") {
    dollar = { amount: r.costSlip, kind: "settled" };
  } else if (
    r.state === "in-progress" && r.projectable &&
    typeof r.realized === "number" && r.realized > 0 &&
    typeof r.awardedLbs === "number" && typeof r.projectedHours === "number" && r.projectedHours > 0
  ) {
    const fullJobHours = r.awardedLbs / r.realized;
    dollar = { amount: (fullJobHours - r.projectedHours) * burdened, kind: "projected" };
  }
  // margin shift when the bid carries economics
  const marginShift =
    dollar && typeof r.operatingProfit === "number" && typeof r.contractValue === "number" && r.contractValue > 0 && typeof r.operatingMargin === "number"
      ? { from: r.operatingMargin, to: (r.operatingProfit - dollar.amount) / r.contractValue }
      : null;

  // job runway: steel left ÷ current pace = man-hours still needed
  const runwayMH =
    r.readablePace && typeof r.remainingLbs === "number" && r.remainingLbs > 0 && typeof r.realized === "number" && r.realized > 0
      ? r.remainingLbs / r.realized
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-10 overflow-y-auto" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl rounded-lg border border-line shadow-2xl" style={{ background: "var(--surface)" }}>
        {/* header — name + the indicator */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <div className="min-w-0">
            <p className="text-sm font-medium text-concrete truncate">{r.name || "—"}</p>
            <p className="text-xs text-rebar">{r.projectId || "no ID"} · Project performance</p>
          </div>
          <span className={`ml-auto shrink-0 text-xs px-2.5 py-1 rounded-full border ${ind.cls}`}>{ind.label}</span>
          <button onClick={onClose} className="text-rebar hover:text-concrete shrink-0" aria-label="Close">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* the three signals — only honest together */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border border-line p-3">
              <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">Hours</p>
              <p className="text-xl font-semibold text-concrete tabular-nums">{pct(b.hoursPct)}</p>
              <p className="text-xs text-rebar mt-0.5">{num(b.actualHours)} of {num(b.projectedHours)} hrs</p>
              <HoursSource r={r} onSaved={onClose} />
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">Placed</p>
              <p className="text-xl font-semibold text-concrete tabular-nums">{pct(r.placedFraction)}</p>
              <p className="text-xs text-rebar mt-0.5">{lbs(r.placedLbs)} of {lbs(r.awardedLbs)} lbs</p>
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">Productivity</p>
              {r.readablePace ? (
                <>
                  <p className="text-xl font-semibold tabular-nums">
                    <span className="text-rebar text-sm">{rate(r.bidProductivity)} → </span>
                    <span className={slow ? "text-danger" : fast ? "text-ok" : "text-concrete"}>{rate(r.realized)}</span>
                  </p>
                  <p className="text-xs text-rebar mt-0.5">
                    bid → actual lbs/MH
                    {r.matched && <> · matched thru {dateStr(r.matched.throughDate)}</>}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xl font-semibold text-rebar">—</p>
                  <p className="text-xs text-rebar mt-0.5">too early to read</p>
                </>
              )}
            </div>
            <div className="rounded-md border border-line p-3">
              <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">Runway</p>
              {runwayMH != null ? (
                <>
                  <p className="text-xl font-semibold text-concrete tabular-nums">{num(runwayMH)} <span className="text-sm font-normal text-rebar">MH</span></p>
                  <p className="text-xs text-rebar mt-0.5">{lbs(r.remainingLbs)} lbs left at pace</p>
                </>
              ) : r.remainingLbs === 0 ? (
                <>
                  <p className="text-xl font-semibold text-ok">Done</p>
                  <p className="text-xs text-rebar mt-0.5">steel fully placed</p>
                </>
              ) : (
                <>
                  <p className="text-xl font-semibold text-rebar">—</p>
                  <p className="text-xs text-rebar mt-0.5">needs a readable pace</p>
                </>
              )}
            </div>
          </div>

          {/* profit + margin sensitivity — two cards, bid → at this pace */}
          {r.sensitivity && (
            <div>
              <p className="text-xs text-rebar mb-2">
                At {r.state === "in-progress" ? "today\u2019s pace" : "the realized pace"} — <span className="text-concrete">{rate(r.sensitivity.pace)} lbs/MH</span> <span className="text-rebar">(bid {rate(r.sensitivity.bidProductivity)})</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <SensCard
                  label="Operating profit"
                  now={money(r.sensitivity.projProfit)}
                  was={`was ${money(r.sensitivity.bidProfit)}`}
                  delta={`${r.sensitivity.profitDelta >= 0 ? "▲" : "▼"} ${money(Math.abs(r.sensitivity.profitDelta))}`}
                  good={r.sensitivity.profitDelta >= 0}
                />
                <SensCard
                  label="Operating margin"
                  now={pct(r.sensitivity.projMargin)}
                  was={`was ${pct(r.sensitivity.bidMargin)}`}
                  delta={`${r.sensitivity.marginDeltaPts >= 0 ? "▲" : "▼"} ${Math.abs(r.sensitivity.marginDeltaPts).toFixed(1)} pts`}
                  good={r.sensitivity.marginDeltaPts >= 0}
                />
              </div>
              {r.state === "in-progress" && <p className="text-[11px] text-rebar mt-1.5">Projection if this pace holds — not a verdict.</p>}
            </div>
          )}

          {/* exceptions + one quiet source line */}
          {r.state === "needs-review" && (
            <div className="rounded-md border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
              Needs review — excluded from averages: {r.problems?.join("; ")}
            </div>
          )}
          {r.state === "in-progress" && r.billingLags && (
            <div className="rounded-md border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
              Hours running ahead of billed weight — billing may be behind the field.
            </div>
          )}
          <p className="text-xs text-rebar">
            {r.weightSource === "billed" ? "Billed weight (LBS lines on invoices)" : "Placed to-date"}
            {typeof r.billedPct === "number" && <> · {pct(r.billedPct)} billed</>}
            {r.matched && <> · matched thru {dateStr(r.matched.throughDate)}</>}
            {r.state === "in-progress" && <> · projection, not a verdict</>}
            {r.foreman?.length > 0 && <> · {r.foreman.join(", ")}</>}
          </p>

          <div className="flex gap-2 pt-1">
            <a href={`/projects/${r.id}`} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Go to project</a>
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SensCard({ label, now, was, delta, good }) {
  return (
    <div className="rounded-md border border-line p-3" style={{ background: "var(--surface)" }}>
      <p className="text-[11px] uppercase tracking-wider text-rebar mb-1">{label}</p>
      <p className="text-2xl font-semibold text-concrete tabular-nums leading-tight">{now}</p>
      <p className="text-xs text-rebar mt-1">
        {was} · <span className={good ? "text-ok" : "text-danger"}>{delta}</span>
      </p>
    </div>
  );
}

// Hours source control — appears ONLY when there's a payroll number to offer.
// Timesheet-era job with a differing payroll figure → "payroll shows N · Use".
// On payroll → "Payroll · Edit". No payroll number anywhere → nothing renders,
// and once the payroll era ends the control retires itself.
function HoursSource({ r, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(r.payrollHours != null ? String(r.payrollHours) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const ts = r.timesheetHours;
  const pay = r.payrollHours;
  const onPayroll = r.hoursOverridden;
  const hasPayroll = typeof pay === "number" && pay > 0;
  const differ = typeof ts === "number" && hasPayroll && Math.round(ts) !== Math.round(pay);

  // nothing to offer → render nothing (self-retiring)
  if (!onPayroll && !differ) return null;

  async function save(changes) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const d = await res.json(); if (!d.ok) throw new Error(d.error);
      onSaved(); // close → the page revalidates with the new hours
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  if (editing) {
    return (
      <div className="mt-1.5 flex items-center gap-1.5">
        <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal"
          className="w-20 text-xs px-1.5 py-1 rounded border border-line bg-transparent text-concrete" placeholder="hrs" />
        <button disabled={busy} onClick={() => save({ payrollHours: Number(val) || 0, manualHoursOverride: true })}
          className="text-[11px] px-2 py-1 rounded bg-safety text-steel font-medium disabled:opacity-40">{busy ? "…" : "Save"}</button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-rebar hover:text-concrete">Cancel</button>
        {err && <span className="text-[11px] text-danger">{err}</span>}
      </div>
    );
  }

  if (onPayroll) {
    return (
      <p className="text-[11px] text-rebar mt-1.5">
        <span className="text-safety uppercase tracking-wide">payroll</span> · <button onClick={() => setEditing(true)} className="underline hover:text-concrete">Edit</button>
      </p>
    );
  }

  // timesheet-era but a differing payroll number exists → offer it
  return (
    <p className="text-[11px] text-rebar mt-1.5">
      timesheet — payroll shows {num(pay)} · <button disabled={busy} onClick={() => save({ manualHoursOverride: true })} className="underline hover:text-concrete disabled:opacity-40">Use</button>
      {err && <span className="text-danger"> {err}</span>}
    </p>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <span className="text-rebar shrink-0 w-28">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}
