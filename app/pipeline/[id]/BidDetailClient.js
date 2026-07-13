"use client";

// =============================================================================
// BID DETAIL — view + amend-in-place. Edit any driver (LBS, productivity, wage,
// crew, rate, assumptions) and the economics recompute LIVE with the shared
// engine (identical math to the phone calculator). Save writes everything to
// the SAME bid — no new bids, no orphans, no stale money.
// This detail+edit pattern is the template the Billing workspace reuses.
// =============================================================================

import { useState, useMemo, useEffect } from "react";
import { BID_STATUSES } from "@/lib/rules/bidSchema";
import { priceBid, CALC_DEFAULTS } from "@/lib/rules/bidCostEngine";

const money = (n) => (typeof n !== "number" ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const pctFmt = (f) => (typeof f === "number" ? `${(f * 100).toFixed(1)}%` : "—");
const lbsFmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");

export default function BidDetailClient({ bid, lineItemCount = 0, linkedProject = null }) {
  const [editing, setEditing] = useState(false);
  const [w0, setW0] = useState(null);   // pristine copy, to detect real changes
  const [options, setOptions] = useState({});   // the real Notion option lists

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/notion-options?db=bids");
        const d = await res.json();
        if (alive && d.ok) setOptions(d.options || {});
      } catch {}
    })();
    return () => { alive = false; };
  }, []);
  const [state, setState] = useState({ saving: false, saved: false, error: null });

  // Build the working copy from the bid — used at init AND to restore on Cancel.
  const initialW = () => ({
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
    hoursPerDay: "",
    submissionDate: bid.submissionDate ?? "",
  });
  const [w, setW] = useState(initialW);
  const set = (k, v) => setW((s) => ({ ...s, [k]: v }));

  // Cancel: discard edits, restore original values, exit edit mode.
  function cancelEdit() {
    setW(initialW());
    setEditing(false);
    setState({ saving: false, saved: false, error: null });
  }

  // Live economics — recompute whenever drivers change (edit mode), or show the
  // stored/derived numbers in view mode. Only runs when LBS is present.
  const econ = useMemo(() => {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    if (!n(w.estimatedLbs)) return null;
    // CRITICAL: only pass fields that HAVE values — blanks must fall back to
    // the engine defaults, never override them to zero.
    const inputs = { weightLb: n(w.estimatedLbs), ptSpecialty: n(w.ptSpecialty) ?? 0 };
    const add = (k, v) => { if (v != null) inputs[k] = v; };
    add("outputLbPerMH", n(w.productivity));
    add("crewSize", n(w.crewSize));
    add("wageRate", n(w.baseWage));
    add("mobilizationHrs", n(w.mobilizationHrs));
    add("burdenPct", n(w.burdenPct));
    add("toolsPct", n(w.toolsPct));
    add("contingencyPct", n(w.contingencyPct));
    add("targetMarginPct", n(w.targetMarginPct));
    add("hoursPerDay", n(w.hoursPerDay));
    return priceBid(inputs, n(w.bidRate)); // hold the active rate; null -> recommended
  }, [w]);

  // "Save" only says Update once something has actually changed.
  const dirty = editing && JSON.stringify(w) !== JSON.stringify(w0);

  async function deleteBid() {
    const typed = window.prompt(
      `Delete "${bid.projectName}"?\n\nIts unbilled line items go with it. Blocked if it became a project or its lines have been billed — mark it Lost / No Bid instead.\n\nType DELETE to confirm.`
    );
    if (typed !== "DELETE") return;
    setState({ saving: true, saved: false, error: null });
    try {
      const res = await fetch(`/api/bids/${bid.id}/delete`, { method: "POST" });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      window.location.href = "/pipeline";
    } catch (e) { setState({ saving: false, saved: false, error: String(e.message || e) }); }
  }

  async function save() {
    setState({ saving: true, saved: false, error: null });
    try {
      const n = (v) => (v === "" || v == null ? null : Number(v));
      const changes = {
        projectName: w.projectName,
        status: w.status,
        bidDueDate: w.bidDueDate || null,
        submissionDate: w.submissionDate || null,
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
          <span className="ml-auto" />
          <a href={`/pipeline/${bid.id}/sheet`} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">{lineItemCount > 0 ? "View bid sheet" : "Create bid sheet"}</a>
          {lineItemCount > 0 && (
            <a
              href={`/api/bids/${bid.id}/proposal`}
              className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite"
              title="Downloads the proposal as the Ammex Excel template"
            >
              Download proposal
            </a>
          )}
          {linkedProject ? (
            <a href={`/projects/${linkedProject.id}`} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">Project: {linkedProject.projectId || linkedProject.name}</a>
          ) : bid.status === "Awarded" ? (
            <a href={`/projects/new?fromBid=${bid.id}&name=${encodeURIComponent(bid.projectName || "")}`} className="text-sm px-4 py-2 rounded-md bg-ok/20 border border-ok/50 text-ok font-medium">Create project</a>
          ) : null}
          {state.saved && !editing && <span className="text-xs text-ok">Saved ✓</span>}
          {!editing ? (
            <button onClick={() => { setW0(JSON.parse(JSON.stringify(w))); setEditing(true); setState({ saving: false, saved: false, error: null }); }} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Edit</button>
          ) : (
            <>
              <button onClick={save} disabled={state.saving} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{state.saving ? "Saving…" : dirty ? "Update" : "Save"}</button>
              <button onClick={cancelEdit} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
              <button onClick={deleteBid} disabled={state.saving} className="text-sm px-4 py-2 rounded-md border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40">Delete bid</button>
            </>
          )}
        </div>

        {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80">Couldn&apos;t save: {state.error}</div>}

        <Section title="Bid info">
          <Grid>
            <F label="Project name" edit={editing} value={w.projectName} onChange={(v) => set("projectName", v)} />
            <FSelect label="Status" edit={editing} value={w.status} options={BID_STATUSES} onChange={(v) => set("status", v)} />
            <FDate label="Bid due date" edit={editing} value={w.bidDueDate} onChange={(v) => set("bidDueDate", v)} />
            <FDate label="Submitted" edit={editing} value={w.submissionDate} onChange={(v) => set("submissionDate", v)} />
            <F label="City / County" edit={editing} value={w.cityCounty} onChange={(v) => set("cityCounty", v)} />
            <FChips label="GC" edit={editing} items={w.gc} onChange={(v) => set("gc", v)} options={options["GC"]} />
            <FChips label="Fabricator" edit={editing} items={w.fabricator} onChange={(v) => set("fabricator", v)} options={options["Fabricator"]} />
            <FChips label="Project type" edit={editing} items={w.projectType} onChange={(v) => set("projectType", v)} options={options["Project Type"]} />
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
                <FNum label="Hours per day" edit value={w.hoursPerDay} onChange={(v) => set("hoursPerDay", v)} placeholder="8" />
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
              <Row label={Number(w.bidRate) > 0 ? "Bid rate (yours)" : "Bid rate (recommended)"} value={`$${econ.bidRatePerLb}/lb`} big />
              <Row label="Contract value" value={money(econ.contractValue)} />
              <Row label="Operating profit" value={money(econ.operatingProfit)} tone="ok" />
              <Row label="Operating margin" value={pctFmt(econ.operatingMargin)} tone="ok" />
              <Row label="Fully-loaded cost" value={money(econ.fullyLoadedCost)} />
              <Row label="Burdened labor" value={money(econ.burdenedLaborCost)} />
              <Row label="Total man-hours" value={lbsFmt(Math.round(econ.totalMH))} />
              <div className="pt-2 mt-2 border-t border-line text-xs text-rebar leading-relaxed">
                {Number(w.bidRate) > 0 ? (
                  <>Using your rate of {(Number(w.bidRate) * 100).toFixed(2)}¢/lb. Clear the bid rate to use the recommended rate.</>
                ) : (
                  <>To hit the {(econ.assumptions.targetMarginPct * 100).toFixed(0)}% target margin, recommended {econ.recommendedCents.toFixed(2)}¢/lb → rounded to {econ.roundedCents}¢.</>
                )}
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
function Row({ label, value, big, tone }) {
  const c = tone === "ok" ? "text-ok" : "text-concrete";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-rebar text-xs">{label}</span>
      <span className={`${big ? "text-lg font-semibold" : "text-sm"} ${c} tabular-nums text-right`}>{value}</span>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (<section><h2 className="text-sm font-semibold text-concrete border-b border-line pb-2 mb-4">{title}{hint && <span className="text-xs text-safety font-normal ml-2">{hint}</span>}</h2><div className="space-y-4">{children}</div></section>);
}
function Grid({ children, className = "" }) { return <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>{children}</div>; }
function L({ children }) { return <span className="text-xs text-rebar block mb-1">{children}</span>; }
function V({ children }) { return <span className="text-sm text-concrete">{children || "—"}</span>; }

function F({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <input className="inp" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{value}</V>}</div>);
}
function FNum({ label, edit, value, onChange, step, placeholder, hint }) {
  return (<div><L>{label}{hint && edit && <span className="ml-1 text-rebar/70">· {hint}</span>}</L>{edit ? <input type="number" step={step || "any"} className="inp" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /> : <V>{value === "" || value == null ? "—" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })}</V>}</div>);
}
function FDate({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <input type="date" className="inp" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</V>}</div>);
}
function FSelect({ label, edit, value, options, onChange }) {
  return (<div><L>{label}</L>{edit ? <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select> : <V>{value}</V>}</div>);
}
function FArea({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <textarea className="inp min-h-[56px] w-full" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{value}</V>}</div>);
}
// Pick from the options that actually exist in Notion. Adding a genuinely new
// one is still possible — but it's a deliberate act, not a typo. (Notion creates
// the option on write, which is exactly why free text was breeding duplicates.)
function FChips({ label, edit, items, onChange, options = [] }) {
  const [adding, setAdding] = useState(false);
  const available = (options || []).filter((o) => !items.includes(o));

  const addNew = (e) => {
    const v = e.target.value.trim();
    if (e.key === "Enter" && v) {
      e.preventDefault();
      if (!items.includes(v)) onChange([...items, v]);
      e.target.value = "";
      setAdding(false);
    }
    if (e.key === "Escape") setAdding(false);
  };

  return (
    <div>
      <L>{label}</L>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {items.map((it, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs border border-line rounded-full px-2.5 py-0.5 text-concrete" style={{ background: "var(--surface-2)" }}>
              {it}
              {edit && <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-rebar hover:text-danger">✕</button>}
            </span>
          ))}
        </div>
      )}

      {edit ? (
        adding ? (
          <input
            autoFocus
            className="inp"
            placeholder="New name + Enter (creates a new option)"
            onKeyDown={addNew}
            onBlur={() => setAdding(false)}
          />
        ) : (
          <div className="flex gap-2">
            <select
              className="inp"
              value=""
              onChange={(e) => { if (e.target.value) onChange([...items, e.target.value]); }}
            >
              <option value="">{available.length ? "Add…" : "No options left"}</option>
              {available.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs px-2.5 rounded border border-line text-rebar hover:text-concrete whitespace-nowrap"
              title="Create an option that doesn't exist yet"
            >
              + New
            </button>
          </div>
        )
      ) : items.length === 0 ? <V /> : null}
    </div>
  );
}

