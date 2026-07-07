"use client";

// =============================================================================
// NEW BID FORM — simple TRACKING record. Metadata + the raw numbers, stored to
// Notion so a bid can be followed through its lifecycle. The OS does NOT price
// or reverse-solve — pricing lives in the calculator (a future estimator tab
// could add that separately). Enter what you know; blank fields stay blank.
// =============================================================================

import { useState } from "react";
import { BID_STATUSES } from "@/lib/rules/bidSchema";

export default function NewBidForm() {
  const [form, setForm] = useState({
    projectName: "", gc: [], fabricator: [], projectType: [],
    cityCounty: "", bidDueDate: "", status: "Reviewing", scope: "", notes: "",
    estimatedLbs: "", bidRate: "", productivity: "", crewSize: "", baseWage: "", ptSpecialty: "",
    operatingProfit: "", operatingMargin: "", fullyLoadedCost: "",
  });
  const [state, setState] = useState({ saving: false, result: null, error: null });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setState({ saving: true, result: null, error: null });
    try {
      const n = (v) => (v === "" ? null : Number(v));
      const metadata = {
        projectName: form.projectName, gc: form.gc, fabricator: form.fabricator, projectType: form.projectType,
        cityCounty: form.cityCounty, bidDueDate: form.bidDueDate || null, status: form.status,
        scope: form.scope, notes: form.notes,
        estimatedLbs: n(form.estimatedLbs), bidRate: n(form.bidRate), productivity: n(form.productivity),
        crewSize: n(form.crewSize), baseWage: n(form.baseWage), ptSpecialty: n(form.ptSpecialty),
        operatingProfit: n(form.operatingProfit),
        operatingMargin: form.operatingMargin === "" ? null : Number(form.operatingMargin) / 100, // enter % -> store ratio
        fullyLoadedCost: n(form.fullyLoadedCost),
      };
      const res = await fetch("/api/bids", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metadata }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");
      setState({ saving: false, result: data, error: null });
    } catch (e) {
      setState({ saving: false, result: null, error: String(e.message || e) });
    }
  }

  if (state.result) {
    return (
      <div className="max-w-lg rounded-lg border border-ok/40 bg-ok/10 p-6">
        <p className="text-ok font-medium mb-1">Bid saved</p>
        <p className="text-concrete/80 text-sm">&ldquo;{form.projectName}&rdquo; added to the Bid Tracker.</p>
        {state.result.softDuplicate && <p className="text-warn text-sm mt-3">Heads up: a similar bid already exists ({state.result.softDuplicate.name}).</p>}
        <div className="mt-5 flex gap-3">
          <button onClick={() => { setState({ saving: false, result: null, error: null }); setForm({ projectName: "", gc: [], fabricator: [], projectType: [], cityCounty: "", bidDueDate: "", status: "Reviewing", scope: "", notes: "", estimatedLbs: "", bidRate: "", productivity: "", crewSize: "", baseWage: "", ptSpecialty: "", operatingProfit: "", operatingMargin: "", fullyLoadedCost: "" }); }} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">Add another</button>
          <a href="/pipeline" className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:bg-graphite">Done</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80">Couldn&apos;t save: {state.error}</div>}

      <SectionTitle>Bid info</SectionTitle>
      <Field label="Project name" required><input className="inp" value={form.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="SR96 Santa Maria Bridge" /></Field>
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Bid status"><select className="inp" value={form.status} onChange={(e) => set("status", e.target.value)}>{BID_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        <Field label="Bid due date"><input type="date" className="inp" value={form.bidDueDate} onChange={(e) => set("bidDueDate", e.target.value)} /></Field>
      </div>
      <ChipField label="GC" items={form.gc} onAdd={(v) => set("gc", v)} placeholder="Type a GC, press Enter" />
      <ChipField label="Fabricator" items={form.fabricator} onAdd={(v) => set("fabricator", v)} placeholder="Type a fabricator, press Enter" />
      <ChipField label="Project type" items={form.projectType} onAdd={(v) => set("projectType", v)} placeholder="Bridge, Box Culvert…" />
      <Field label="City / County"><input className="inp" value={form.cityCounty} onChange={(e) => set("cityCounty", e.target.value)} placeholder="Phoenix" /></Field>

      <div className="pt-2"><SectionTitle>Numbers <span className="text-rebar font-normal text-xs">— enter what you have; all optional</span></SectionTitle></div>
      <div className="grid sm:grid-cols-2 gap-5">
        <Field label="Estimated LBS"><input type="number" className="inp" value={form.estimatedLbs} onChange={(e) => set("estimatedLbs", e.target.value)} /></Field>
        <Field label="Bid rate ($/lb)"><input type="number" step="0.0001" className="inp" value={form.bidRate} onChange={(e) => set("bidRate", e.target.value)} /></Field>
        <Field label="Productivity (LBS/MH)"><input type="number" className="inp" value={form.productivity} onChange={(e) => set("productivity", e.target.value)} /></Field>
        <Field label="Crew size"><input type="number" className="inp" value={form.crewSize} onChange={(e) => set("crewSize", e.target.value)} /></Field>
        <Field label="Base wage"><input type="number" className="inp" value={form.baseWage} onChange={(e) => set("baseWage", e.target.value)} /></Field>
        <Field label="PT / Specialty revenue"><input type="number" className="inp" value={form.ptSpecialty} onChange={(e) => set("ptSpecialty", e.target.value)} /></Field>
      </div>

      <div className="pt-2"><SectionTitle>Money <span className="text-rebar font-normal text-xs">— from your calculator; stored as-is</span></SectionTitle></div>
      <div className="grid sm:grid-cols-3 gap-5">
        <Field label="Operating profit ($)"><input type="number" className="inp" value={form.operatingProfit} onChange={(e) => set("operatingProfit", e.target.value)} /></Field>
        <Field label="Operating margin (%)"><input type="number" step="0.1" className="inp" value={form.operatingMargin} onChange={(e) => set("operatingMargin", e.target.value)} placeholder="17.5" /></Field>
        <Field label="Fully-loaded cost ($)"><input type="number" className="inp" value={form.fullyLoadedCost} onChange={(e) => set("fullyLoadedCost", e.target.value)} /></Field>
      </div>

      <Field label="Scope"><textarea className="inp min-h-[56px]" value={form.scope} onChange={(e) => set("scope", e.target.value)} /></Field>
      <Field label="Notes"><textarea className="inp min-h-[56px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

      <div className="flex gap-3 pt-2">
        <button onClick={submit} disabled={state.saving || !form.projectName.trim()} className="px-5 py-2.5 rounded-md bg-safety text-steel font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed">{state.saving ? "Saving…" : "Save bid"}</button>
        <a href="/pipeline" className="px-5 py-2.5 rounded-md border border-line text-rebar text-sm hover:bg-graphite">Cancel</a>
      </div>

      <style jsx>{`.inp { width: 100%; background: #272d35; border: 1px solid #39414c; border-radius: 8px; padding: 9px 12px; font-size: 14px; color: #f4f3f0; outline: none; } .inp:focus { border-color: #ff6a13; }`}</style>
    </div>
  );
}

function SectionTitle({ children }) { return <h2 className="text-sm font-semibold text-concrete border-b border-line pb-2">{children}</h2>; }
function Field({ label, hint, required, children }) {
  return (<label className="block"><span className="text-sm text-concrete/90 mb-1.5 block">{label}{required && <span className="text-safety ml-0.5">*</span>}{hint && <span className="text-rebar text-xs ml-2">{hint}</span>}</span>{children}</label>);
}
function ChipField({ label, items, onAdd, placeholder }) {
  const onKey = (e) => { if (e.key === "Enter" && e.target.value.trim()) { e.preventDefault(); onAdd([...items, e.target.value.trim()]); e.target.value = ""; } };
  return (<Field label={label}>{items.length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{items.map((it, i) => (<span key={i} className="inline-flex items-center gap-1 text-xs bg-steel border border-line rounded-full px-2.5 py-1 text-concrete">{it}<button onClick={() => onAdd(items.filter((_, j) => j !== i))} className="text-rebar hover:text-danger">✕</button></span>))}</div>}<input className="inp" placeholder={placeholder} onKeyDown={onKey} /></Field>);
}
