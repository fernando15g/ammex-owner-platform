"use client";

// =============================================================================
// A MULTI-SELECT, backed by the options that actually exist in Notion.
//
// These fields (GC, Fabricator, Project Type, Foreman) were free-text boxes.
// Notion CREATES an option for any name it hasn't seen — so "CMC", "cmc" and
// "C.M.C." quietly became three different fabricators, and grouping or filtering
// by them silently broke.
//
// Adding a genuinely new name is still possible. It's just a deliberate act now,
// rather than a typo.
// =============================================================================

import { useState } from "react";

export default function ChipSelect({ label, items = [], options = [], onChange, hint }) {
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
      {label && <span className="text-xs text-rebar mb-1 block">{label}</span>}

      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {items.map((it, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs border border-line rounded-full px-2.5 py-0.5 text-concrete"
              style={{ background: "var(--surface-2)" }}
            >
              {it}
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-rebar hover:text-danger">✕</button>
            </span>
          ))}
        </div>
      )}

      {adding ? (
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
      )}

      {hint && <span className="text-[11px] text-rebar mt-1 block">{hint}</span>}
    </div>
  );
}
