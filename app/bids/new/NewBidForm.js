"use client";

// =============================================================================
// NEW BID FORM — metadata + live-priced economics (same engine as the detail
// page, so create and edit behave identically). Defaults pre-filled (editable),
// assumptions hidden behind a toggle, driver cells outlined in blue.
// =============================================================================

import { useState, useMemo, useEffect } from "react";
import { BID_STATUSES } from "@/lib/rules/bidSchema";
import { priceBid, CALC_DEFAULTS } from "@/lib/rules/bidCostEngine";
import { computeSpecialtyRollup, SPECIALTY_TYPES, newSpecialtyLine } from "@/lib/rules/specialty";
import ChipSelect from "@/app/components/ChipSelect";

const DEFAULTS = {
  productivity: "200", baseWage: "32", crewSize: "",
  burdenPct: "0.20", toolsPct: "0.03", contingencyPct: "0.03",
  mobilizationHrs: "8", targetMarginPct: "0.25", hoursPerDay: "8",
};

export default function NewBidForm() {
  const [form, setForm] = useState({
    projectName: "", gc: [], fabricator: [], projectType: [],
    cityCounty: "", bidDueDate: "", status: "Reviewing", scope: "", notes: "",
    estimatedLbs: "", bidRate: "", ptSpecialty: "", ...DEFAULTS,
  });
  const [specialtyLines, setSpecialtyLines] = useState([]);
  const [specialtyOn, setSpecialtyOn] = useState(false);
  const toggleType = (t) => setSpecialtyLines((ls) => ls.some((l) => l.type === t) ? ls.filter((l) => l.type !== t) : [...ls, newSpecialtyLine(t)]);
  const updLine = (id, patch) => setSpecialtyLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id) => setSpecialtyLines((ls) => ls.filter((l) => l.id !== id));
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [state, setState] = useState({ saving: false, result: null, error: null });
  const [options, setOptions] = useState({});

  // The real option lists from Notion. Free text silently created a NEW option
  // for every typo — "CMC", "cmc" and "C.M.C." became three fabricators.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetch("/api/notion-options?db=bids").then((r) => r.json());
        if (alive && d.ok) setOptions(d.options || {});
      } catch {}
    })();
    return () => { alive = false; };
  }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const specRollup = useMemo(() => {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    const assumptions = {
      wageRate: n(form.baseWage) ?? CALC_DEFAULTS.wageRate,
      burdenPct: n(form.burdenPct) ?? CALC_DEFAULTS.burdenPct,
      toolsPct: n(form.toolsPct) ?? CALC_DEFAULTS.toolsPct,
      contingencyPct: n(form.contingencyPct) ?? CALC_DEFAULTS.contingencyPct,
      targetMarginPct: n(form.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct,
    };
    return computeSpecialtyRollup(specialtyOn ? specialtyLines : [], assumptions, { revenue: 0, cost: 0, hours: 0 });
  }, [specialtyLines, specialtyOn, form.baseWage, form.burdenPct, form.toolsPct, form.contingencyPct, form.targetMarginPct]);

  const econ = useMemo(() => {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    if (!n(form.estimatedLbs)) return null;
    // CRITICAL: only pass fields that HAVE values — blanks must fall back to
    // the engine defaults, never override them to zero.
    const assumptions = {
      wageRate: n(form.baseWage) ?? CALC_DEFAULTS.wageRate,
      burdenPct: n(form.burdenPct) ?? CALC_DEFAULTS.burdenPct,
      toolsPct: n(form.toolsPct) ?? CALC_DEFAULTS.toolsPct,
      contingencyPct: n(form.contingencyPct) ?? CALC_DEFAULTS.contingencyPct,
      targetMarginPct: n(form.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct,
    };
    const specRoll = computeSpecialtyRollup(specialtyOn ? specialtyLines : [], assumptions, { revenue: 0, cost: 0, hours: 0 });
    const inputs = { weightLb: n(form.estimatedLbs), specialtyRevenue: specRoll.specRevenue, specialtyCost: specRoll.specCost, specialtyHours: specRoll.specHours };
    const add = (k, v) => { if (v != null) inputs[k] = v; };
    add("outputLbPerMH", n(form.productivity));
    add("crewSize", n(form.crewSize));
    add("wageRate", n(form.baseWage));
    add("mobilizationHrs", n(form.mobilizationHrs));
    add("burdenPct", n(form.burdenPct));
    add("toolsPct", n(form.toolsPct));
    add("contingencyPct", n(form.contingencyPct));
    add("targetMarginPct", n(form.targetMarginPct));
    add("hoursPerDay", n(form.hoursPerDay));
    return priceBid(inputs, n(form.bidRate));
  }, [form, specialtyLines, specialtyOn]);

  async function submit() {
    setState({ saving: true, result: null, error: null });
    try {
      const n = (v) => (v === "" ? null : Number(v));
      const metadata = {
        projectName: form.projectName, gc: form.gc, fabricator: form.fabricator, projectType: form.projectType,
        cityCounty: form.cityCounty, bidDueDate: form.bidDueDate || null, status: form.status,
        scope: form.scope, notes: form.notes,
        estimatedLbs: n(form.estimatedLbs), productivity: n(form.productivity), crewSize: n(form.crewSize),
        baseWage: n(form.baseWage), ptSpecialty: n(form.ptSpecialty),
      };
      if (econ) {
        metadata.bidRate = econ.bidRatePerLb;
        metadata.operatingProfit = econ.operatingProfit;
        metadata.operatingMargin = econ.operatingMargin;
        metadata.fullyLoadedCost = econ.fullyLoadedCost;
        metadata.burdenedLaborCost = econ.burdenedLaborCost;
        metadata.burdenPct = econ.assumptions.burdenPct;
        metadata.toolsPct = econ.assumptions.toolsPct;
        metadata.contingencyPct = econ.assumptions.contingencyPct;
        metadata.mobilizationHrs = econ.assumptions.mobilizationHrs;
        metadata.targetMarginPct = econ.assumptions.targetMarginPct;
      } else if (n(form.bidRate) != null) {
        metadata.bidRate = n(form.bidRate);
      }
      metadata.specialtyTypes = specialtyOn ? [...new Set(specRollup.rows.map((r) => r.type))] : [];
      if (econ) {
        metadata.rebarRevenue = econ.rebarRevenue;
        metadata.specialtyRevenue = econ.specialtyRevenue;
        metadata.specialtyCost = econ.specialtyCost;
        metadata.specialtyHours = econ.specialtyHours;
      }
      const res = await fetch("/api/bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");

      // Now that the bid exists, persist specialty scope as billable line items.
      if (data.id) {
        const specPayload = specialtyOn ? specRollup.rows.map((r) => {
          const src = specialtyLines.find((l) => l.id === r.id) || {};
          if (r.type === "PT Building") return { type: r.type, qty: Number(src.lbs) || 0, unitPrice: (Number(src.rateCentsPerLb) || 0) / 100, productivity: src.prodLbPerMH };
          if (r.type === "Mesh") return { type: r.type, qty: Number(src.sqft) || 0, unitPrice: (Number(src.rateCentsPerSqft) || 0) / 100, productivity: src.prodSqftPerMH };
          return { type: r.type, qty: Number(src.hours) || 0, unitPrice: Number(src.ratePerHour) || 0, productivity: "" };
        }).filter((x) => x.qty > 0) : [];
        if (specPayload.length) {
          await fetch(`/api/bids/${data.id}/specialty`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: specPayload }) });
        }
      }
      setState({ saving: false, result: data, error: null });
    } catch (e) {
      setState({ saving: false, result: null, error: String(e.message || e) });
    }
  }

  if (state.result) {
    return (
      <div className="max-w-lg rounded-lg border border-ok/40 bg-ok/10 p-6">
        <p className="text-ok font-medium mb-1">Bid saved</p>
        <p className="text-concrete/80 text-sm">&ldquo;{form.projectName}&rdquo; added to the Bid Tracker{econ ? " with economics." : "."}</p>
        {state.result.softDuplicate && <p className="text-warn text-sm mt-3">Heads up: a similar bid already exists ({state.result.softDuplicate.name}).</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={() => { setState({ saving: false, result: null, error: null }); setForm({ projectName: "", gc: [], fabricator: [], projectType: [], cityCounty: "", bidDueDate: "", status: "Reviewing", scope: "", notes: "", estimatedLbs: "", bidRate: "", ptSpecialty: "", ...DEFAULTS }); }} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">Add another</button>
          {state.result?.id && (
            <a href={`/pipeline/${state.result.id}`} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Go to the bid →</a>
          )}
          <a href="/pipeline" className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:bg-graphite">Done</a>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:flex lg:gap-8 max-w-4xl">
      <div className="flex-1 min-w-0 space-y-5">
        {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80">Couldn&apos;t save: {state.error}</div>}

        <SectionTitle>Bid info</SectionTitle>
        <Field label="Project name" required><input className="inp" value={form.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="SR96 Santa Maria Bridge" /></Field>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Bid status"><select className="inp" value={form.status} onChange={(e) => set("status", e.target.value)}>{BID_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          <Field label="Bid due date"><input type="date" className="inp" value={form.bidDueDate} onChange={(e) => set("bidDueDate", e.target.value)} /></Field>
        </div>
        <ChipSelect label="GC" items={form.gc} options={options["GC"] || []} onChange={(v) => set("gc", v)} />
        <ChipSelect label="Fabricator" items={form.fabricator} options={options["Fabricator"] || []} onChange={(v) => set("fabricator", v)} />
        <ChipSelect label="Project type" items={form.projectType} options={options["Project Type"] || []} onChange={(v) => set("projectType", v)} />
        <Field label="City / County"><input className="inp" value={form.cityCounty} onChange={(e) => set("cityCounty", e.target.value)} placeholder="Phoenix" /></Field>

        <div className="pt-2"><SectionTitle>Numbers <span className="text-rebar font-normal text-xs">— blue fields drive economics; defaults pre-filled</span></SectionTitle></div>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Estimated LBS" required><input type="number" className="inp inp-need" value={form.estimatedLbs} onChange={(e) => set("estimatedLbs", e.target.value)} placeholder="234000" /></Field>
          <Field label="Bid rate ($/lb)" hint={Number(form.bidRate) > 0 ? "yours — clear to use the recommendation" : "recommended — type to override"}>
            <input
              type="number"
              step="0.0001"
              className="inp inp-need"
              value={form.bidRate}
              onChange={(e) => set("bidRate", e.target.value)}
              /* The recommendation fills the cell live as the drivers are typed,
                 so it's a number you can see and accept — not the word "auto". */
              placeholder={econ ? String(econ.bidRatePerLb) : ""}
            />
          </Field>
          <Field label="Productivity (LBS/MH)"><input type="number" className="inp inp-need" value={form.productivity} onChange={(e) => set("productivity", e.target.value)} /></Field>
          <Field label="Base wage"><input type="number" className="inp inp-need" value={form.baseWage} onChange={(e) => set("baseWage", e.target.value)} /></Field>
          <Field label="Crew size"><input type="number" className="inp inp-need" value={form.crewSize} onChange={(e) => set("crewSize", e.target.value)} placeholder="8" /></Field>
        </div>

        <button onClick={() => setShowAssumptions((s) => !s)} className="text-xs text-info hover:underline">
          {showAssumptions ? "− Hide" : "+ Show / edit"} assumptions (burden, tools, contingency, mobilization, target margin)
        </button>
        {showAssumptions && (
          <div className="grid sm:grid-cols-3 gap-4 p-4 rounded-lg border border-line" style={{ background: "var(--surface)" }}>
            <Field label="Burden %"><input type="number" step="0.01" className="inp inp-need" value={form.burdenPct} onChange={(e) => set("burdenPct", e.target.value)} /></Field>
            <Field label="Tools %"><input type="number" step="0.01" className="inp inp-need" value={form.toolsPct} onChange={(e) => set("toolsPct", e.target.value)} /></Field>
            <Field label="Contingency %"><input type="number" step="0.01" className="inp inp-need" value={form.contingencyPct} onChange={(e) => set("contingencyPct", e.target.value)} /></Field>
            <Field label="Mobilization hrs"><input type="number" className="inp inp-need" value={form.mobilizationHrs} onChange={(e) => set("mobilizationHrs", e.target.value)} /></Field>
            <Field label="Hours per day"><input type="number" className="inp inp-need" value={form.hoursPerDay} onChange={(e) => set("hoursPerDay", e.target.value)} /></Field>
            <Field label="Target margin %"><input type="number" step="0.01" className="inp inp-need" value={form.targetMarginPct} onChange={(e) => set("targetMarginPct", e.target.value)} /></Field>
          </div>
        )}

        <SpecialtyPanel
          on={specialtyOn} setOn={setSpecialtyOn}
          lines={specialtyLines} rows={specRollup.rows} rollup={specRollup}
          targetMargin={Number(form.targetMarginPct) || CALC_DEFAULTS.targetMarginPct}
          toggleType={toggleType} updLine={updLine} removeLine={removeLine}
        />

        <Field label="Scope"><textarea className="inp min-h-[56px]" value={form.scope} onChange={(e) => set("scope", e.target.value)} /></Field>
        <Field label="Notes"><textarea className="inp min-h-[56px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

        <div className="flex gap-3 pt-2">
          <button onClick={submit} disabled={state.saving || !form.projectName.trim()} className="px-5 py-2.5 rounded-md bg-safety text-steel font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed">{state.saving ? "Saving…" : "Save bid"}</button>
          <a href="/pipeline" className="px-5 py-2.5 rounded-md border border-line text-rebar text-sm hover:bg-graphite">Cancel</a>
        </div>
      </div>

      <div className="lg:w-72 shrink-0 mt-6 lg:mt-0">
        <div className="rounded-lg border border-line p-5 lg:sticky lg:top-24" style={{ background: "var(--surface)" }}>
          <p className="text-[11px] uppercase tracking-wider text-rebar mb-3">Economics <span className="text-safety normal-case">· live</span></p>
          {econ ? (
            <div className="space-y-2.5 text-sm">
              <PRow label={Number(form.bidRate) > 0 ? "Bid rate (yours)" : "Bid rate (recommended)"} value={`$${econ.bidRatePerLb}/lb`} big />
              <PRow label="Contract value" value={`$${econ.contractValue.toLocaleString()}`} />
              {specRollup.specRevenue > 0 && (
                <div className="pt-1.5 mt-1.5 border-t border-line space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-rebar text-[11px] uppercase tracking-wide">Rebar</span>
                    <span className="text-concrete/80 text-xs tabular-nums">${Math.round(econ.contractValue - specRollup.specRevenue).toLocaleString()} · {(((econ.operatingProfit - (specRollup.specRevenue - specRollup.specCost)) / (econ.contractValue - specRollup.specRevenue)) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-rebar text-[11px] uppercase tracking-wide">Specialty</span>
                    <span className="text-concrete/80 text-xs tabular-nums">${Math.round(specRollup.specRevenue).toLocaleString()} · {specRollup.specRevenue > 0 ? (specRollup.specMargin * 100).toFixed(1) : "0"}%</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 pt-0.5">
                    <span className="text-concrete text-[11px] uppercase tracking-wide font-medium">Combined</span>
                    <span className="text-concrete text-xs tabular-nums font-medium">${Math.round(econ.contractValue).toLocaleString()} · {(econ.operatingMargin * 100).toFixed(1)}%</span>
                  </div>
                </div>
              )}
              <PRow label="Operating profit" value={`$${econ.operatingProfit.toLocaleString()}`} tone="ok" />
              <PRow label="Operating margin" value={`${(econ.operatingMargin * 100).toFixed(1)}%`} tone="ok" />
              <PRow label="Fully-loaded cost" value={`$${econ.fullyLoadedCost.toLocaleString()}`} />
              <div className="pt-2 mt-2 border-t border-line text-xs text-rebar leading-relaxed">
                {Number(form.bidRate) > 0 ? (
                  <>Using your rate of {(Number(form.bidRate) * 100).toFixed(2)}¢/lb (${Number(form.bidRate).toFixed(4)}/lb). Leave bid rate blank to use the recommended rate instead.</>
                ) : (
                  <>To hit your {(econ.assumptions.targetMarginPct * 100).toFixed(0)}% target margin, the math recommends {econ.recommendedCents.toFixed(2)}¢/lb, rounded to {econ.roundedCents}¢ (= ${econ.bidRatePerLb}/lb). Type your own bid rate above to override.</>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-rebar">Enter Estimated LBS to see live economics. Same math as the calculator.</p>
          )}
        </div>
      </div>

      <style jsx>{`
        .inp { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px; font-size: 14px; color: var(--text); outline: none; }
        .inp:focus { border-color: var(--accent); }
        .inp-need { border-color: var(--info); box-shadow: 0 0 0 1px var(--info); }
        .inp-need:focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
      `}</style>
    </div>
  );
}

function SectionTitle({ children }) { return <h2 className="text-sm font-semibold text-concrete border-b border-line pb-2">{children}</h2>; }
function Field({ label, hint, required, children }) {
  return (<label className="block"><span className="text-sm text-concrete/90 mb-1.5 block">{label}{required && <span className="text-safety ml-0.5">*</span>}{hint && <span className="text-rebar text-xs ml-2">{hint}</span>}</span>{children}</label>);
}
function PRow({ label, value, big, tone }) {
  const c = tone === "ok" ? "text-ok" : "text-concrete";
  return (<div className="flex items-baseline justify-between gap-2"><span className="text-rebar text-xs">{label}</span><span className={`${big ? "text-lg font-semibold" : "text-sm"} ${c} tabular-nums`}>{value}</span></div>);
}

// Specialty pricing panel — same behavior as the bid detail editor, in the
// new-bid form so a full bid (rebar + PT/mesh) can be priced at creation.
function SpecialtyPanel({ on, setOn, lines, rows, rollup, targetMargin, toggleType, updLine, removeLine }) {
  const usd = (v) => `$${Math.round(v || 0).toLocaleString()}`;
  const pct = (v) => `${((v || 0) * 100).toFixed(1)}%`;
  const num = (v, d = 0) => (v || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  const rowFor = (id) => rows.find((r) => r.id === id) || {};
  return (
    <div className="rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
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
                        <NF label="Tons" value={l.tons} suffix="tn" onChange={(x) => updLine(l.id, { tons: x, lbs: x === "" ? "" : Number(x) * 2000 })} />
                        <NF label="Pounds" value={l.lbs} suffix="lb" onChange={(x) => updLine(l.id, { lbs: x, tons: x === "" ? "" : Number(x) / 2000 })} />
                        <NF label="Productivity" value={l.prodLbPerMH} suffix="lb/MH" onChange={(x) => updLine(l.id, { prodLbPerMH: x })} />
                        <NF label="Rate" value={l.rateCentsPerLb} suffix="¢/lb" onChange={(x) => updLine(l.id, { rateCentsPerLb: x })} hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : "add productivity"} />
                      </>)}
                      {l.type === "PT Bridge" && (<>
                        <NF label="Hours (fabricator)" value={l.hours} suffix="hrs" onChange={(x) => updLine(l.id, { hours: x })} />
                        <NF label="Rate" value={l.ratePerHour} prefix="$" suffix="/hr" onChange={(x) => updLine(l.id, { ratePerHour: x })} hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : ""} />
                      </>)}
                      {l.type === "Mesh" && (<>
                        <NF label="Square feet" value={l.sqft} suffix="sqft" onChange={(x) => updLine(l.id, { sqft: x })} />
                        <NF label="Productivity" value={l.prodSqftPerMH} suffix="sqft/MH" onChange={(x) => updLine(l.id, { prodSqftPerMH: x })} hint="blank = no cost" />
                        <NF label="Rate" value={l.rateCentsPerSqft} suffix="¢/sqft" onChange={(x) => updLine(l.id, { rateCentsPerSqft: x })} hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : "add productivity"} />
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

function NF({ label, value, onChange, prefix, suffix, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] text-rebar block mb-1">{label}</span>
      <div className="flex items-center gap-1 rounded border border-line px-2 py-1.5" style={{ background: "var(--surface)" }}>
        {prefix && <span className="text-xs text-rebar">{prefix}</span>}
        <input type="text" inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-sm text-concrete focus:outline-none tabular-nums" placeholder="0" />
        {suffix && <span className="text-[10px] text-rebar whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <span className="text-[10px] text-rebar/70 block mt-0.5">{hint}</span>}
    </label>
  );
}
