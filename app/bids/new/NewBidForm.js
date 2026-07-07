"use client";

// =============================================================================
// NEW BID FORM — the first WRITE screen. Back-office staff create/track bids
// here (metadata only; pricing stays in the calculator). Submits to /api/bids
// which runs the shared write path (bid_number, version, audit, void-ready).
// =============================================================================

import { useState } from "react";
import { BID_STATUSES } from "@/lib/rules/bidSchema";

const chipInput = (val, set) => (e) => {
  if (e.key === "Enter" && e.target.value.trim()) {
    e.preventDefault();
    set([...val, e.target.value.trim()]);
    e.target.value = "";
  }
};

export default function NewBidForm() {
  const [form, setForm] = useState({
    projectName: "",
    gc: [],
    fabricator: [],
    projectType: [],
    cityCounty: "",
    bidDueDate: "",
    status: "Reviewing",
    scope: "",
    notes: "",
  });
  const [state, setState] = useState({ saving: false, result: null, error: null });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setState({ saving: true, result: null, error: null });
    try {
      const metadata = {
        ...form,
        bidDueDate: form.bidDueDate || null,
      };
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor: "admin", metadata }),
      });
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
        <p className="text-ok font-medium mb-1">Bid created</p>
        <p className="text-concrete/80 text-sm">
          &ldquo;{form.projectName}&rdquo; saved to the Bid Tracker.
        </p>
        {state.result.softDuplicate && (
          <p className="text-warn text-sm mt-3">
            Heads up: a similar bid already exists ({state.result.softDuplicate.name}).
            You may have wanted to edit that one instead.
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <a href="/bids/new" className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">Add another</a>
          <a href="/active" className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:bg-graphite">Done</a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {state.error && (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-5">
          Couldn&apos;t save: {state.error}
        </div>
      )}

      <div className="space-y-5">
        <Field label="Project name" required>
          <input className="inp" value={form.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="SR96 Santa Maria Bridge" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Bid due date">
            <input type="date" className="inp" value={form.bidDueDate} onChange={(e) => set("bidDueDate", e.target.value)} />
          </Field>
        </div>

        <ChipField label="GC" items={form.gc} onAdd={(v) => set("gc", v)} placeholder="Type a GC, press Enter" />
        <ChipField label="Fabricator" items={form.fabricator} onAdd={(v) => set("fabricator", v)} placeholder="Type a fabricator, press Enter" />
        <ChipField label="Project type" items={form.projectType} onAdd={(v) => set("projectType", v)} placeholder="Bridge, Box Culvert, Warehouse…" />

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="City / County">
            <input className="inp" value={form.cityCounty} onChange={(e) => set("cityCounty", e.target.value)} placeholder="Phoenix" />
          </Field>
          <Field label="Bid status">
            <select className="inp" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {BID_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Scope"><textarea className="inp min-h-[64px]" value={form.scope} onChange={(e) => set("scope", e.target.value)} placeholder="Bridge reinforcing, approach slab…" /></Field>
        <Field label="Notes"><textarea className="inp min-h-[64px]" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>

        <div className="flex gap-3 pt-2">
          <button onClick={submit} disabled={state.saving || !form.projectName.trim()}
            className="px-5 py-2.5 rounded-md bg-safety text-steel font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            {state.saving ? "Saving…" : "Create bid"}
          </button>
          <a href="/active" className="px-5 py-2.5 rounded-md border border-line text-rebar text-sm hover:bg-graphite">Cancel</a>
        </div>
      </div>

      <style jsx>{`
        .inp {
          width: 100%;
          background: #272d35;
          border: 1px solid #39414c;
          border-radius: 8px;
          padding: 9px 12px;
          font-size: 14px;
          color: #f4f3f0;
          outline: none;
        }
        .inp:focus { border-color: #ff6a13; }
      `}</style>
    </div>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <label className="block">
      <span className="text-sm text-concrete/90 mb-1.5 block">
        {label}{required && <span className="text-safety ml-0.5">*</span>}
        {hint && <span className="text-rebar text-xs ml-2">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function ChipField({ label, items, onAdd, placeholder }) {
  return (
    <Field label={label}>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {items.map((it, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs bg-steel border border-line rounded-full px-2.5 py-1 text-concrete">
              {it}
              <button onClick={() => onAdd(items.filter((_, j) => j !== i))} className="text-rebar hover:text-danger">✕</button>
            </span>
          ))}
        </div>
      )}
      <input className="inp" placeholder={placeholder} onKeyDown={chipInput(items, onAdd)} />
    </Field>
  );
}
