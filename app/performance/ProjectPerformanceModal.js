"use client";

// =============================================================================
// PROJECT PERFORMANCE — the popup behind a row click on /performance.
//
// Deliberately NOT project details (that lives in Active Work / the project
// page). This answers ONE question: how is this job performing, and what is
// that worth? Everything here reads straight off the performance row — no
// extra fetch, so it opens instantly and can never disagree with the table.
//
//   header     — running jobs: live burn indicator (on target / watch / below
//                target / missing). CLOSED trusted jobs: money leads — the pill
//                is the achieved margin vs the 12% floor; the productivity
//                verdict (beat / met / missed estimate, ±10% band) rides as the
//                secondary read. A finished job gets a verdict, not a trajectory.
//   signals    — the three that only tell the truth together (prior-chat view):
//                hours % · placed % · productivity bid → actual
//   $ line     — what the productivity gap is costing (or saving) on this job
//   context    — labeled chips: weight source · billed % · matched thru ·
//                projection/verdict · foreman — each fact self-explanatory
//   action     — "Go to project" (not "Edit project" — admin lives elsewhere)
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import HoursControl from "@/app/components/HoursControl";
import { PERF } from "@/lib/rules/performance";

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

// productivity verdict on closed jobs (derived in rules, ±10% band vs bid)
const VERDICT = {
  beat: { label: "Beat estimate", tone: "text-ok" },
  met: { label: "Met estimate", tone: "text-concrete" },
  missed: { label: "Missed estimate", tone: "text-warn" },
};

export default function ProjectPerformanceModal({ row, onClose }) {
  const router = useRouter(); // hooks stay above the early return
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!row) return null;
  const r = row;

  // header pill — CLOSED trusted jobs lead with the money: achieved margin vs
  // the 12% floor (below-floor is the hard red no matter how the crew ran).
  // Falls back to the productivity verdict when the bid carried no economics.
  // Running / needs-review jobs keep the live burn indicator — a trajectory
  // signal only means something while the job is still moving.
  const floorPct = Math.round(PERF.MARGIN_FLOOR * 100);
  const closedPill =
    r.state === "trusted"
      ? r.marginState === "below-floor"
        ? { label: `Margin ${pct(r.achievedMargin)} · below ${floorPct}% floor`, cls: INDICATOR["below-target"].cls }
        : typeof r.achievedMargin === "number"
        ? {
            label: `Margin ${pct(r.achievedMargin)}`,
            cls: r.marginState === "eroded" ? INDICATOR.watch.cls : INDICATOR["on-target"].cls,
          }
        : r.verdict
        ? {
            label: VERDICT[r.verdict].label,
            cls: r.verdict === "beat" ? INDICATOR["on-target"].cls : r.verdict === "missed" ? INDICATOR.watch.cls : "bg-graphite text-concrete border-line",
          }
        : { label: "Complete", cls: "bg-graphite text-rebar border-line" }
      : null;
  const ind = closedPill || INDICATOR[r.indicator] || INDICATOR.missing;
  const b = r.burn || {};

  // after a successful save the page data is stale — close, give Notion's
  // eventually-consistent reads a beat to catch up, then re-run the server
  // fetch in place (no full reload, scroll/sort survive). Same pattern will
  // simply get faster post-Postgres.
  const savedRefresh = () => {
    onClose();
    setTimeout(() => router.refresh(), 900);
  };
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
          {/* below-floor: money led the headline; this line lets productivity explain WHY */}
          {r.state === "trusted" && r.marginState === "below-floor" && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
              Finished at {pct(r.achievedMargin)} margin — below the {floorPct}% floor.{" "}
              {r.verdict === "beat"
                ? "Crews beat the productivity estimate — the bid was priced too thin."
                : r.verdict === "missed"
                ? `Productivity missed the estimate${typeof r.variancePct === "number" ? ` by ${Math.abs(Math.round(r.variancePct * 100))}%` : ""} — the labor overrun ate the margin.`
                : r.verdict === "met"
                ? "Crews hit the productivity estimate — the bid margin was too thin from the start."
                : ""}
            </div>
          )}

          {/* context chips — every fact labeled, nothing to decode */}
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Weight" value={r.weightSource === "billed" ? "Billed invoices" : "Placed to-date (manual)"} />
            {typeof r.billedPct === "number" && <Chip label="Billed" value={pct(r.billedPct)} />}
            {r.matched && <Chip label="Matched thru" value={dateStr(r.matched.throughDate)} />}
            {r.state === "in-progress" && <Chip label="Read" value="Projection — not a verdict" />}
            {r.state === "trusted" && r.verdict && (
              <Chip label="Estimate" value={VERDICT[r.verdict].label} tone={VERDICT[r.verdict].tone} />
            )}
            {r.foreman?.length > 0 && <Chip label="Foreman" value={r.foreman.join(", ")} />}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <HoursControl projectId={r.id} mode={r.hoursMode} timesheet={r.timesheetHours} payroll={r.payrollHours} baseline={r.combineBaseline} />
            <div className="ml-auto flex gap-2">
              <a href={`/projects/${r.id}`} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Go to project</a>
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Close</button>
            </div>
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
// One labeled context chip — a tiny uppercase label glued to its value, so
// "Placed to-date" and "Projection" never read as mystery words again.
function Chip({ label, value, tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-line bg-graphite/40">
      <span className="text-rebar uppercase tracking-wide text-[10px]">{label}</span>
      <span className={tone || "text-concrete"}>{value}</span>
    </span>
  );
}
