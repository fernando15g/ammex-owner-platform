"use client";

// One-time bulk merge of bid Project Types into the agreed 13-bucket set.
// Dry run first (writes nothing, shows exactly what would change), then execute.
import { useState } from "react";

export default function MergeTypesPanel() {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);

  async function run(dry) {
    setBusy(true); setErr(null);
    if (dry) { setDone(null); }
    try {
      const res = await fetch(`/api/admin/merge-project-types${dry ? "?dry=1" : ""}`, { method: "POST" });
      const d = await res.json();
      if (d.ok === false) throw new Error(d.error);
      if (dry) setPreview(d); else { setDone(d); setPreview(null); }
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-1">Merge Project Types</p>
      <p className="text-xs text-rebar mb-3">
        Collapses the messy Project Type list into the agreed 13 buckets by rewriting each affected bid's value
        (e.g. Footing → Foundation/Footing, Tank → Water Treatment Plant). Only touches Project Type — nothing else
        on the bid. <span className="text-concrete">Dry run first</span> to see exactly what changes; it writes nothing until you execute.
        Afterward, the old names sit at 0 records — delete those empty options in Notion.
      </p>

      {err && <div className="text-danger text-xs mb-3 rounded border border-danger/40 bg-danger/10 p-2">{err}</div>}

      <div className="flex gap-2 mb-3">
        <button onClick={() => run(true)} disabled={busy} className="text-sm px-3 py-1.5 rounded-md border border-line text-concrete hover:border-rebar disabled:opacity-50">
          {busy ? "Working…" : "Dry run (preview)"}
        </button>
        {preview && preview.affected > 0 && (
          <button onClick={() => run(false)} disabled={busy} className="text-sm px-3 py-1.5 rounded-md bg-safety text-steel font-medium disabled:opacity-50">
            Execute — rewrite {preview.affected} bids
          </button>
        )}
      </div>

      {preview && (
        <div className="text-xs text-concrete rounded border border-line p-3 mb-2" style={{ background: "var(--surface-2)" }}>
          <div className="font-medium mb-1">{preview.affected} bids would change:</div>
          {Object.entries(preview.tally || {}).sort().map(([k, n]) => (
            <div key={k} className="text-rebar">{k} <span className="text-concrete">({n})</span></div>
          ))}
          {preview.affected === 0 && <div className="text-ok">Nothing to merge — types are already clean.</div>}
        </div>
      )}

      {done && (
        <div className="text-xs rounded border border-ok/40 bg-ok/10 p-3 text-concrete">
          Rewrote {done.rewrote} bids{done.failed > 0 ? `, ${done.failed} failed` : ""}.
          {done.failed > 0 && <div className="text-danger mt-1">{done.failures.map((f, i) => <div key={i}>{f.name}: {f.error}</div>)}</div>}
          <div className="text-rebar mt-1">Now delete the empty (0-record) options in Notion: Water Treatment Facility, Tank, Building w/ PT, Multifamily, Parking Garage, Commercial Structure, Industrial Structure, Data Center, Self Storage Facility, Foundation, Footing, Pad, Spread Footing, Substation, Light Pole, Transportation, Cage Basin — plus Barrier and Well.</div>
        </div>
      )}
    </div>
  );
}
