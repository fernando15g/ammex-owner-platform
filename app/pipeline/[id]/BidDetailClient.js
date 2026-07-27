"use client";
import { confirmDialog } from "@/app/components/Dialog";

// =============================================================================
// BID DETAIL — view + amend-in-place. Edit any driver (LBS, productivity, wage,
// crew, rate, assumptions) and the economics recompute LIVE with the shared
// engine (identical math to the phone calculator). Save writes everything to
// the SAME bid — no new bids, no orphans, no stale money.
// This detail+edit pattern is the template the Billing workspace reuses.
// =============================================================================

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BID_STATUSES } from "@/lib/rules/bidSchema";
import ProposalButton from "@/app/pipeline/ProposalButton";
import { priceBid, CALC_DEFAULTS } from "@/lib/rules/bidCostEngine";
import { computeSpecialtyRollup, SPECIALTY_TYPES, SPECIALTY_DEFAULT_PRODUCTIVITY, newSpecialtyLine } from "@/lib/rules/specialty";

const money = (n) => (typeof n !== "number" ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const pctFmt = (f) => (typeof f === "number" ? `${(f * 100).toFixed(1)}%` : "—");
const lbsFmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");

export default function BidDetailClient({ bid, lineItemCount = 0, linkedProject = null, specialty = null }) {
  const router = useRouter();
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
  const num0 = (v) => (v === "" || v == null ? null : Number(v)); // component-scope numeric coerce (render-safe)
  // Rebuild editable specialty lines from the bid's saved scope so an existing
  // PT bid opens ready to edit. Guarded: no specialty → empty, panel stays off.
  const seedSpecialty = (specialty?.rows || []).map((r) => {
    const base = newSpecialtyLine(r.type);
    if (r.type === "PT Building") return { ...base, lbs: r.lbs ?? "", tons: r.lbs ? r.lbs / 2000 : "", prodLbPerMH: r.prodLbPerMH ?? SPECIALTY_DEFAULT_PRODUCTIVITY["PT Building"], rateCentsPerLb: r.rateCentsPerLb ?? "" };
    if (r.type === "Mesh") return { ...base, sqft: r.sqft ?? "", prodSqftPerMH: r.prodSqftPerMH ?? "", rateCentsPerSqft: r.rateCentsPerSqft ?? "" };
    return { ...base, hours: r.hours ?? "", ratePerHour: r.ratePerHour ?? "" };
  });
  const [specialtyLines, setSpecialtyLines] = useState(seedSpecialty);
  const [specialtyOn, setSpecialtyOn] = useState(seedSpecialty.length > 0);
  const toggleType = (t) => setSpecialtyLines((ls) => ls.some((l) => l.type === t) ? ls.filter((l) => l.type !== t) : [...ls, newSpecialtyLine(t)]);
  const updLine = (id, patch) => setSpecialtyLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id) => setSpecialtyLines((ls) => ls.filter((l) => l.id !== id));
  const set = (k, v) => setW((s) => ({ ...s, [k]: v }));

  // Cancel: discard edits, restore original values, exit edit mode.
  function cancelEdit() {
    setW(initialW());
    setEditing(false);
    setState({ saving: false, saved: false, error: null });
  }

  // Live economics — recompute whenever drivers change (edit mode), or show the
  // stored/derived numbers in view mode. Only runs when LBS is present.
  const specRollup = useMemo(() => {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    const assumptions = {
      wageRate: n(w.baseWage) ?? CALC_DEFAULTS.wageRate,
      burdenPct: n(w.burdenPct) ?? CALC_DEFAULTS.burdenPct,
      toolsPct: n(w.toolsPct) ?? CALC_DEFAULTS.toolsPct,
      contingencyPct: n(w.contingencyPct) ?? CALC_DEFAULTS.contingencyPct,
      targetMarginPct: n(w.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct,
    };
    return computeSpecialtyRollup(specialtyOn ? specialtyLines : [], assumptions, { revenue: 0, cost: 0, hours: 0 });
  }, [specialtyLines, specialtyOn, w.baseWage, w.burdenPct, w.toolsPct, w.contingencyPct, w.targetMarginPct]);

  const econ = useMemo(() => {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    if (!n(w.estimatedLbs)) return null;
    // CRITICAL: only pass fields that HAVE values — blanks must fall back to
    // the engine defaults, never override them to zero.
    // Specialty rides along so the profit/margin SAVED back to the bid are the
    // combined rebar+specialty totals — otherwise editing a PT bid here would
    // overwrite the calculator's combined figures with rebar-only ones.
    // Price specialty LIVE from the form's lines (this is what makes the OS act
    // like the calculator). Uses the same assumptions the rebar side uses.
    const assumptions = {
      wageRate: n(w.baseWage) ?? CALC_DEFAULTS.wageRate,
      burdenPct: n(w.burdenPct) ?? CALC_DEFAULTS.burdenPct,
      toolsPct: n(w.toolsPct) ?? CALC_DEFAULTS.toolsPct,
      contingencyPct: n(w.contingencyPct) ?? CALC_DEFAULTS.contingencyPct,
      targetMarginPct: n(w.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct,
    };
    const specRoll = computeSpecialtyRollup(specialtyOn ? specialtyLines : [], assumptions, { revenue: 0, cost: 0, hours: 0 });
    const inputs = {
      weightLb: n(w.estimatedLbs),
      specialtyRevenue: specRoll.specRevenue,
      specialtyCost: specRoll.specCost,
      specialtyHours: specRoll.specHours,
    };
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
  }, [w, specialtyLines, specialtyOn]);

  // "Save" only says Update once something has actually changed.
  const dirty = editing && JSON.stringify(w) !== JSON.stringify(w0);

  async function deleteBid() {
    const ok = await confirmDialog({
      title: `Delete "${bid.projectName}"?`,
      message: "Its line items go with it. All records are archived (recoverable in Notion).",
      confirmLabel: "Delete bid",
      danger: true,
      typeToConfirm: "DELETE",
    });
    if (!ok) return;
    setState({ saving: true, saved: false, error: null });
    try {
      let res = await fetch(`/api/bids/${bid.id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      let d = await res.json();
      // Blocked (it became a project, or its lines were billed). Offer to force —
      // useful for clearing test data without opening Notion.
      if (!d.ok && d.blocked && d.forceable) {
        const forced = await confirmDialog({
          title: "Delete anyway?",
          message: `${d.error}\nForcing removes the bid and ALL of its line items.`,
          confirmLabel: "Force delete",
          danger: true,
          typeToConfirm: "DELETE",
        });
        if (!forced) { setState({ saving: false, saved: false, error: null }); return; }
        res = await fetch(`/api/bids/${bid.id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
        d = await res.json();
      }
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
        // Keep the bid's specialty rollup in step with its line items, so
        // performance and realized economics read the same figure the bid shows.
        changes.rebarRevenue = econ.rebarRevenue;
        changes.specialtyRevenue = econ.specialtyRevenue;
        changes.specialtyCost = econ.specialtyCost;
        changes.specialtyHours = econ.specialtyHours;
      } else if (n(w.bidRate) != null) {
        changes.bidRate = n(w.bidRate);
      }
      // 1) persist specialty scope as billable line items (mirrors the calc, but
      //    the OS owns billing). Priced values come straight from the rows.
      const specPayload = specialtyOn ? specRollup.rows.map((r) => {
        const src = specialtyLines.find((l) => l.id === r.id) || {};
        if (r.type === "PT Building") return { type: r.type, qty: Number(src.lbs) || 0, unitPrice: (Number(src.rateCentsPerLb) || 0) / 100, productivity: src.prodLbPerMH };
        if (r.type === "Mesh") return { type: r.type, qty: Number(src.sqft) || 0, unitPrice: (Number(src.rateCentsPerSqft) || 0) / 100, productivity: src.prodSqftPerMH };
        return { type: r.type, qty: Number(src.hours) || 0, unitPrice: Number(src.ratePerHour) || 0, productivity: "" };
      }).filter((x) => x.qty > 0) : [];
      await fetch(`/api/bids/${bid.id}/specialty`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: specPayload }),
      });
      changes.specialtyTypes = specialtyOn ? [...new Set(specRollup.rows.map((r) => r.type))] : [];

      // 2) save the bid + its combined rollup
      const res = await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");
      setState({ saving: false, saved: true, error: null });
      setEditing(false);
      // re-fetch server data in place (Notion is eventually consistent — give it
      // a beat). Keeps the page canonical instead of optimistic. Same pattern as
      // the Performance modal; gets faster post-Postgres.
      setTimeout(() => router.refresh(), 900);
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
            <ProposalButton
              bidId={bid.id}
              bidName={bid.name}
              status={bid.status}
              submissionDate={bid.submissionDate}
            />
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
            <FDate label="Submitted" edit={editing} value={w.submissionDate} onChange={(v) => set("submissionDate", v)} />
            <FDate label="Bid due date" edit={editing} value={w.bidDueDate} onChange={(v) => set("bidDueDate", v)} />
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
            {!editing && num0(w.ptSpecialty) ? <FNum label="PT / Specialty revenue (legacy)" edit={false} value={w.ptSpecialty} onChange={() => {}} /> : null}
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

          <SpecialtyEditor
            editing={editing}
            on={specialtyOn}
            setOn={setSpecialtyOn}
            lines={specialtyLines}
            rows={specRollup.rows}
            targetMargin={num0(w.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct}
            toggleType={toggleType}
            updLine={updLine}
            removeLine={removeLine}
            rollup={specRollup}
          />
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

        {specialty && <SpecialtyPanel specialty={specialty} econ={econ} />}
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


// -----------------------------------------------------------------------------
// SPECIALTY SCOPE — PT and mesh, priced labor-only alongside the rebar.
// Shown beside (not inside) the rebar economics: PT runs ~98 lb/MH against
// rebar's 180-330, so blending them would misread both. The combined line is
// what the job is actually worth.
function SpecialtyPanel({ specialty, econ }) {
  const money = (v) => (typeof v === "number" ? `$${Math.round(v).toLocaleString()}` : "—");
  const pct = (v) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "—");
  const rebarRev = econ?.contractValue != null ? econ.contractValue - (specialty.revenue || 0) : null;
  const rebarCost = econ?.fullyLoadedCost ?? null;
  const specProfit = specialty.cost > 0 ? specialty.revenue - specialty.cost : null;
  const specMargin = specProfit != null && specialty.revenue > 0 ? specProfit / specialty.revenue : null;
  const combRev = econ?.contractValue ?? null;
  const combCost = rebarCost != null ? rebarCost + (specialty.cost || 0) : null;
  const combProfit = combRev != null && combCost != null ? combRev - combCost : null;
  const combMargin = combProfit != null && combRev > 0 ? combProfit / combRev : null;

  const srcLabel = specialty.source === "lines" ? "from this bid\u2019s line items"
    : specialty.source === "calc" ? "from the bid calculator"
    : "legacy PT/Specialty column";

  return (
    <div className="rounded-lg border border-line p-5 mt-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline gap-2 mb-3">
        <p className="text-[11px] uppercase tracking-wider text-rebar">Specialty scope</p>
        {specialty.types?.length > 0 && (
          <span className="text-[10px] text-concrete/70">{specialty.types.join(" \u00b7 ")}</span>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-rebar">
            <th className="text-left font-medium pb-1"></th>
            <th className="text-right font-medium pb-1">Revenue</th>
            <th className="text-right font-medium pb-1">Margin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <tr>
            <td className="py-1.5 text-rebar">Rebar</td>
            <td className="py-1.5 text-right text-concrete tabular-nums">{money(rebarRev)}</td>
            <td className="py-1.5 text-right text-concrete/80 tabular-nums">{pct(econ?.operatingMargin)}</td>
          </tr>
          <tr>
            <td className="py-1.5 text-rebar">Specialty</td>
            <td className="py-1.5 text-right text-concrete tabular-nums">{money(specialty.revenue)}</td>
            <td className="py-1.5 text-right tabular-nums">
              {specMargin != null ? <span className="text-concrete/80">{pct(specMargin)}</span> : <span className="text-warn text-xs">no cost basis</span>}
            </td>
          </tr>
          <tr>
            <td className="py-1.5 text-concrete font-medium">Combined</td>
            <td className="py-1.5 text-right text-concrete font-medium tabular-nums">{money(combRev)}</td>
            <td className="py-1.5 text-right font-medium tabular-nums text-concrete">{pct(combMargin)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 pt-2 border-t border-line text-[11px] text-rebar leading-relaxed">
        {specialty.hours > 0 && <>Specialty adds {Math.round(specialty.hours).toLocaleString()} man-hours at {money(specialty.cost)} cost. </>}
        {specialty.missingBasis > 0 && (
          <span className="text-warn">\u25b2 {specialty.missingBasis} line{specialty.missingBasis === 1 ? "" : "s"} book revenue with no cost basis \u2014 combined margin reads high until productivity is entered. </span>
        )}
        <span className="text-rebar/70">Labor only, material rides in the price \u2014 {srcLabel}. Kept out of the rebar lbs/MH figures.</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SPECIALTY EDITOR — price PT and mesh right here, like the calculator, so a bid
// can be built entirely in the OS. Each line computes revenue/cost/hours/margin
// live and saves as a billable line item. Same three types, same cost stack.
// -----------------------------------------------------------------------------
function SpecialtyEditor({ editing, on, setOn, lines, rows, targetMargin, toggleType, updLine, removeLine, rollup }) {
  const usd = (v) => `$${Math.round(v || 0).toLocaleString()}`;
  const pct = (v) => `${((v || 0) * 100).toFixed(1)}%`;
  const num = (v, d = 0) => (v || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  const rowFor = (id) => rows.find((r) => r.id === id) || {};

  // Read-only summary when not editing (and there IS specialty)
  if (!editing) {
    if (!on || lines.length === 0) return null;
    return (
      <div className="mt-4 rounded-lg border border-line p-4" style={{ background: "var(--surface)" }}>
        <p className="text-[11px] uppercase tracking-wider text-rebar mb-2">Specialty scope</p>
        <div className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <div key={r.id} className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-wide text-safety">{r.type}</span>
              <span className="text-rebar text-xs">{r.qtyLabel}</span>
              <span className="ml-auto text-concrete tabular-nums">{usd(r.revenue)}</span>
              <span className="text-concrete/70 tabular-nums text-xs w-14 text-right">{r.hasCostBasis ? pct(r.margin) : "—"}</span>
            </div>
          ))}
          <div className="flex items-baseline gap-2 pt-1.5 border-t border-line">
            <span className="text-concrete font-medium text-xs">Specialty total</span>
            <span className="ml-auto text-concrete font-medium tabular-nums">{usd(rollup.specRevenue)}</span>
            <span className="text-concrete/70 tabular-nums text-xs w-14 text-right">{rollup.specRevenue > 0 ? pct(rollup.specMargin) : "—"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm font-medium text-concrete">Add specialty scope (PT / mesh)</span>
        </label>
        {on && (
          <div className="flex flex-wrap gap-1.5">
            {SPECIALTY_TYPES.map((t) => {
              const active = lines.some((l) => l.type === t);
              return (
                <button key={t} type="button" onClick={() => toggleType(t)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${active ? "border-safety bg-safety/15 text-safety" : "border-line text-rebar hover:text-concrete"}`}>
                  {active ? "✓ " : "+ "}{t}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {on && (
        <div className="border-t border-line p-4">
          {lines.length === 0 ? (
            <p className="text-sm text-rebar">Tap a type above to price PT or mesh alongside the rebar.</p>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => {
                const r = rowFor(l.id);
                return (
                  <div key={l.id} className="rounded-md border border-line p-3" style={{ background: "var(--surface-2)" }}>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[10px] uppercase tracking-wide text-safety font-medium">{l.type}</span>
                      <button type="button" onClick={() => removeLine(l.id)} className="text-[11px] text-rebar hover:text-danger">Remove</button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {l.type === "PT Building" && (<>
                        <SF label="Tons" value={l.tons} suffix="tn" onChange={(x) => updLine(l.id, { tons: x, lbs: x === "" ? "" : Number(x) * 2000 })} />
                        <SF label="Pounds" value={l.lbs} suffix="lb" onChange={(x) => updLine(l.id, { lbs: x, tons: x === "" ? "" : Number(x) / 2000 })} />
                        <SF label="Productivity" value={l.prodLbPerMH} suffix="lb/MH" onChange={(x) => updLine(l.id, { prodLbPerMH: x })} />
                        <SF label="Rate" value={l.rateCentsPerLb} suffix="¢/lb" onChange={(x) => updLine(l.id, { rateCentsPerLb: x })}
                          hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : "add productivity"} />
                      </>)}
                      {l.type === "PT Bridge" && (<>
                        <SF label="Hours (fabricator)" value={l.hours} suffix="hrs" onChange={(x) => updLine(l.id, { hours: x })} />
                        <SF label="Rate" value={l.ratePerHour} prefix="$" suffix="/hr" onChange={(x) => updLine(l.id, { ratePerHour: x })}
                          hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : ""} />
                      </>)}
                      {l.type === "Mesh" && (<>
                        <SF label="Square feet" value={l.sqft} suffix="sqft" onChange={(x) => updLine(l.id, { sqft: x })} />
                        <SF label="Productivity" value={l.prodSqftPerMH} suffix="sqft/MH" onChange={(x) => updLine(l.id, { prodSqftPerMH: x })} hint="blank = no cost" />
                        <SF label="Rate" value={l.rateCentsPerSqft} suffix="¢/sqft" onChange={(x) => updLine(l.id, { rateCentsPerSqft: x })}
                          hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : "add productivity"} />
                      </>)}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-rebar">
                      <span className="tabular-nums">{r.qtyLabel}</span>
                      {r.hasCostBasis ? (<>
                        <span className="tabular-nums">{num(r.hours, 1)} MH</span>
                        <span className="tabular-nums">cost {usd(r.cost)}</span>
                        <span className="tabular-nums text-concrete">rev {usd(r.revenue)}</span>
                        <span className={`tabular-nums font-medium ${r.margin >= targetMargin ? "text-ok" : "text-warn"}`}>{pct(r.margin)} margin</span>
                      </>) : (<>
                        <span className="tabular-nums text-concrete">rev {usd(r.revenue)}</span>
                        <span className="text-warn font-medium">▲ no cost basis — add productivity</span>
                      </>)}
                    </div>
                  </div>
                );
              })}

              {rollup.specRevenue > 0 && (
                <div className="flex items-baseline gap-2 px-1 pt-1 text-sm">
                  <span className="text-concrete font-medium">Specialty total</span>
                  <span className="ml-auto text-concrete font-medium tabular-nums">{usd(rollup.specRevenue)}</span>
                  <span className="text-rebar text-xs tabular-nums">{num(rollup.specHours, 0)} MH · {pct(rollup.specMargin)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// small specialty field
function SF({ label, value, onChange, prefix, suffix, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] text-rebar block mb-1">{label}</span>
      <div className="flex items-center gap-1 rounded border border-line px-2 py-1.5" style={{ background: "var(--surface)" }}>
        {prefix && <span className="text-xs text-rebar">{prefix}</span>}
        <input type="text" inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-concrete focus:outline-none tabular-nums" placeholder="0" />
        {suffix && <span className="text-[10px] text-rebar whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <span className="text-[10px] text-rebar/70 block mt-0.5">{hint}</span>}
    </label>
  );
}
