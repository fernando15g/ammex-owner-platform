"use client";

// =============================================================================
// BID DETAIL — view + amend-in-place. Edit any driver (LBS, productivity, wage,
// crew, rate, assumptions) and the economics recompute LIVE with the shared
// engine (identical math to the phone calculator). Save writes everything to
// the SAME bid — no new bids, no orphans, no stale money.
// This detail+edit pattern is the template the Billing workspace reuses.
// =============================================================================

import { useState, useMemo } from "react";
import { BID_STATUSES } from "@/lib/rules/bidSchema";
import { priceBid, CALC_DEFAULTS } from "@/lib/rules/bidCostEngine";

const money = (n) => (typeof n !== "number" ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const pctFmt = (f) => (typeof f === "number" ? `${(f * 100).toFixed(1)}%` : "—");
const lbsFmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");

export default function BidDetailClient({ bid }) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState({ saving: false, saved: false, error: null });

  // Editable working copy. Numbers held as strings for inputs; blank = unset.
  const [w, setW] = useState(() => ({
    projectName: bid.name || "",
    status: bid.status || "Reviewing",
    bidDueDate: bid.bidDueDate || "",
    cityCounty: bid.cityCounty || "",
    gc: bid.gc || [],
    fabricator: bid.fabricator || [],
    projectType: bid.projectType || [],
    scope: bid.scope || "",
    notes: bid.notes || "",
    estimatedLbs: bid.estimatedLbs ?? "",
    productivity: bid.productivity ?? "",
    crewSize: bid.crewSize ?? "",
    baseWage: bid.baseWage ?? "",
    bidRate: bid.bidRate ?? "",
    ptSpecialty: bid.ptSpecialtyRevenue ?? "",
    burdenPct: bid.burdenPct ?? "",
    toolsPct: bid.toolsPct ?? "",
    contingencyPct: bid.contingencyPct ?? "",
    mobilizationHrs: bid.mobilizationHrs ?? "",
    targetMarginPct: bid.targetMarginPct ?? "",
  }));
  const set = (k, v) => setW((s) => ({ ...s, [k]: v }));

  // Live economics — recompute whenever drivers change (edit mode), or show the
  // stored/derived numbers in view mode. Only runs when LBS is present.
  const econ = useMemo(() => {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    if (!n(w.estimatedLbs)) return null;
    return priceBid(
      {
        weightLb: n(w.estimatedLbs),
        outputLbPerMH: n(w.productivity) ?? "",
        crewSize: n(w.crewSize) ?? "",
        wageRate: n(w.baseWage) ?? "",
        ptSpecialty: n(w.ptSpecialty) ?? 0,
        mobilizationHrs: n(w.mobilizationHrs) ?? "",
        burdenPct: n(w.burdenPct) ?? "",
        toolsPct: n(w.toolsPct) ?? "",
        contingencyPct: n(w.contingencyPct) ?? "",
        targetMarginPct: n(w.targetMarginPct) ?? "",
      },
      n(w.bidRate) // hold the active rate; null → recommended
    );
  }, [w]);

  async function save() {
    setState({ saving: true, saved: false, error: null });
    try {
      const n = (v) => (v === "" || v == null ? null : Number(v));
      const changes = {
        projectName: w.projectName,
        status: w.status,
        bidDueDate: w.bidDueDate || null,
        cityCounty: w.cityCounty,
        gc: w.gc, fabricator: w.fabricator, projectType: w.projectType,
        scope: w.scope, notes: w.notes,
        estimatedLbs: n(w.estimatedLbs),
        productivity: n(w.productivity),
        crewSize: n(w.crewSize),
        baseWage: n(w.baseWage),
        ptSpecialty: n(w.ptSpecialty),
      };
      if (econ) {
        // amended economics — same engine as the calculator, saved to this bid
        changes.bidRate = econ.bidRatePerLb;
        changes.operatingProfit = econ.operatingProfit;
        changes.operatingMargin = econ.operatingMargin;
        changes.fullyLoadedCost = econ.fullyLoadedCost;
        changes.burdenedLaborCost = econ.burdenedLaborCost;
        changes.burdenPct = econ.assumptions.burdenPct;
        changes.toolsPct = econ.assumptions.toolsPct;
        changes.contingencyPct = econ.assumptions.contingencyPct;
        changes.mobilizationHrs = econ.assumptions.mobilizationHrs;
        changes.targetMarginPct = econ.assumptions.targetMarginPct;
      } else if (n(w.bidRate) != null) {
        changes.bidRate = n(w.bidRate);
      }
      const res = await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");
      setState({ saving: false, saved: true, error: null });
      setEditing(false);
    } catch (e) {
      setState({ saving: false, saved: false, error: String(e.message || e) });
    }
  }

  return (
    <div className="lg:flex lg:gap-8 max-w-5xl">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center gap-3">
          <a href="/pipeline" className="inline-flex items-center gap-1.5 text-sm text-rebar hover:text-concrete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Pipeline
          </a>
          <span className="ml-auto" />
          {state.saved && !editing && <span className="text-xs text-ok">Saved ✓</span>}
          {!editing ? (
            <button onClick={() => { setEditing(true); setState({ saving: false, saved: false, error: null }); }} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Edit</button>
          ) : (
            <>
              <button onClick={save} disabled={state.saving} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{state.saving ? "Saving…" : "Save"}</button>
              <button onClick={() => setEditing(false)} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
            </>
          )}
        </div>

        {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80">Couldn&apos;t save: {state.error}</div>}

        <Section title="Bid info">
          <Grid>
            <F label="Project name" edit={editing} value={w.projectName} onChange={(v) => set("projectName", v)} />
            <FSelect label="Status" edit={editing} value={w.status} options={BID_STATUSES} onChange={(v) => set("status", v)} />
            <FDate label="Bid due date" edit={editing} value={w.bidDueDate} onChange={(v) => set("bidDueDate", v)} />
            <F label="City / County" edit={editing} value={w.cityCounty} onChange={(v) => set("cityCounty", v)} />
            <FChips label="GC" edit={editing} items={w.gc} onChange={(v) => set("gc", v)} />
            <FChips label="Fabricator" edit={editing} items={w.fabricator} onChange={(v) => set("fabricator", v)} />
            <FChips label="Project type" edit={editing} items={w.projectType} onChange={(v) => set("projectType", v)} />
          </Grid>
          <FArea label="Scope" edit={editing} value={w.scope} onChange={(v) => set("scope", v)} />
          <FArea label="Notes" edit={editing} value={w.notes} onChange={(v) => set("notes", v)} />
        </Section>

        <Section title="Drivers" hint={editing ? "change any of these — economics recompute live →" : null}>
          <Grid>
            <FNum label="Estimated LBS" edit={editing} value={w.estimatedLbs} onChange={(v) => set("estimatedLbs", v)} />
            <FNum label="Productivity (LBS/MH)" edit={editing} value={w.productivity} onChange={(v) => set("productivity", v)} placeholder={String(CALC_DEFAULTS.outputLbPerMH)} />
            <FNum label="Bid rate ($/lb)" edit={editing} value={w.bidRate} onChange={(v) => set("bidRate", v)} step="0.0001" hint="blank = use recommended" />
            <FNum label="Crew size" edit={editing} value={w.crewSize} onChange={(v) => set("crewSize", v)} />
            <FNum label="Base wage" edit={editing} value={w.baseWage} onChange={(v) => set("baseWage", v)} placeholder={String(CALC_DEFAULTS.wageRate)} />
            <FNum label="PT / Specialty revenue" edit={editing} value={w.ptSpecialty} onChange={(v) => set("ptSpecialty", v)} />
          </Grid>
          {editing && (
            <details className="mt-3">
              <summary className="text-xs text-rebar cursor-pointer hover:text-concrete">Assumptions (burden, tools, contingency, target margin, mob hrs)</summary>
              <Grid className="mt-3">
                <FNum label="Burden %" edit value={w.burdenPct} onChange={(v) => set("burdenPct", v)} step="0.01" placeholder="0.20" />
                <FNum label="Tools %" edit value={w.toolsPct} onChange={(v) => set("toolsPct", v)} step="0.01" placeholder="0.03" />
                <FNum label="Contingency %" edit value={w.contingencyPct} onChange={(v) => set("contingencyPct", v)} step="0.01" placeholder="0.03" />
                <FNum label="Target margin %" edit value={w.targetMarginPct} onChange={(v) => set("targetMarginPct", v)} step="0.01" placeholder="0.25" />
                <FNum label="Mobilization hrs" edit value={w.mobilizationHrs} onChange={(v) => set("mobilizationHrs", v)} placeholder="8" />
              </Grid>
            </details>
          )}
        </Section>
      </div>

      {/* Economics — live, same engine as the calculator */}
      <div className="lg:w-80 shrink-0 mt-8 lg:mt-0">
        <div className="rounded-lg border border-line p-5 lg:sticky lg:top-24" style={{ background: "var(--surface)" }}>
          <p className="text-[11px] uppercase tracking-wider text-rebar mb-3">Economics {editing && <span className="text-safety normal-case">· live</span>}</p>
          {econ ? (
            <div className="space-y-2.5 text-sm">
              <Row label="Bid rate" value={`$${econ.bidRatePerLb}/lb`} big />
              <Row label="Contract value" value={money(econ.contractValue)} />
              <Row label="Operating profit" value={money(econ.operatingProfit)} tone="ok" />
              <Row label="Operating margin" value={pctFmt(econ.operatingMargin)} tone="ok" />
              <Row label="Fully-loaded cost" value={money(econ.fullyLoadedCost)} />
              <Row label="Burdened labor" value={money(econ.burdenedLaborCost)} />
              <Row label="Total man-hours" value={lbsFmt(Math.round(econ.totalMH))} />
              <div className="pt-2 mt-2 border-t border-line text-xs text-rebar">
                Recommended {econ.recommendedCents.toFixed(2)}¢ → rounds to {econ.roundedCents}¢
                {Number(w.bidRate) > 0 && ` · holding ${(Number(w.bidRate) * 100).toFixed(2)}¢`}
              </div>
            </div>
          ) : (
            <p className="text-sm text-rebar">No LBS on this bid — enter Estimated LBS to see economics. Stored money (if any): profit {money(bid.operatingProfit)}, margin {pctFmt(bid.operatingMargin)}.</p>
          )}
          <p className="text-[11px] text-rebar mt-4 leading-relaxed">Same math as the calculator — amendments recompute and save to this bid, never a new one.</p>
        </div>
      </div>
    </div>
  );
}

// ---- field components: render text in view mode, inputs in edit mode --------
function Section({ title, hint, children }) {
  return (<section><h2 className="text-sm font-semibold text-concrete border-b border-line pb-2 mb-4">{title}{hint && <span className="text-xs text-safety font-normal ml-2">{hint}</span>}</h2><div className="space-y-4">{children}</div></section>);
}
function Grid({ children, className = "" }) { return <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>{children}</div>; }
function L({ children }) { return <span className="text-xs text-rebar block mb-1">{children}</span>; }
function V({ children }) { return <span className="text-sm text-concrete">{children || "—"}</span>; }

function F({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <input className="inp" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{value}</V>}<style jsx>{inp}</style></div>);
}
function FNum({ label, edit, value, onChange, step, placeholder, hint }) {
  return (<div><L>{label}{hint && edit && <span className="ml-1 text-rebar/70">· {hint}</span>}</L>{edit ? <input type="number" step={step || "any"} className="inp" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /> : <V>{value === "" || value == null ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })}</V>}<style jsx>{inp}</style></div>);
}
function FDate({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <input type="date" className="inp" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</V>}<style jsx>{inp}</style></div>);
}
function FSelect({ label, edit, value, options, onChange }) {
  return (<div><L>{label}</L>{edit ? <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select> : <V>{value}</V>}<style jsx>{inp}</style></div>);
}
function FArea({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <textarea className="inp min-h-[56px] w-full" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{value}</V>}<style jsx>{inp}</style></div>);
}
function FChips({ label, edit, items, onChange }) {
  const onKey = (e) => { if (e.key === "Enter" && e.target.value.trim()) { e.preventDefault(); onChange([...items, e.target.value.trim()]); e.target.value = ""; } };
  return (
    <div><L>{label}</L>
      {items.length > 0 && <div className="flex flex-wrap gap-1.5 mb-1.5">{items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1 text-xs border border-line rounded-full px-2.5 py-0.5 text-concrete" style={{ background: "var(--surface-2)" }}>
          {it}{edit && <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-rebar hover:text-danger">✕</button>}
        </span>))}</div>}
      {edit ? <input className="inp" placeholder="Type + Enter" onKeyDown={onKey} /> : items.length === 0 ? <V /> : null}
      <style jsx>{inp}</style>
    </div>
  );
}
const inp = `.inp { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 11px; font-size: 14px; color: var(--text); outline: none; } .inp:focus { border-color: var(--accent); }`;
