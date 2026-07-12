"use client";

// One-time migration prep, run from the UI so it needs no terminal.
// Dry run first — it reports exactly what it WOULD change, and writes nothing.
import { useState } from "react";

export default function BackfillPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  async function run(dry) {
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await fetch(`/api/admin/backfill-ids${dry ? "?dry=1" : ""}`, { method: "POST" });
      const d = await res.json();
      if (d.ok === false) throw new Error(d.error);
      setResult(d);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-1">Application-owned IDs</p>
      <p className="text-xs text-rebar mb-3">
        Gives every line item and billing event an ID the app owns (LI-000001 / EV-000001), and rewrites the
        money snapshots inside your invoices so they reference those instead of Notion page IDs. Without this,
        every invoice identifies the work it billed by a Notion page — a reference that dies the moment the data
        lives anywhere else. Safe to run more than once.
      </p>

      {err && <div className="rounded border border-danger/50 bg-danger/10 p-2 text-sm text-concrete/80 mb-3">{err}</div>}

      {result && (
        <div className={`rounded border p-3 mb-3 text-sm ${result.dryRun ? "border-info/40 bg-info/10" : "border-ok/40 bg-ok/10"}`}>
          <p className="text-concrete">{result.summary}</p>
          {result.warning && <p className="text-warn text-xs mt-2">{result.warning}</p>}
          {result.unresolved?.length > 0 && (
            <ul className="text-xs text-rebar mt-1 list-disc pl-4">
              {result.unresolved.slice(0, 8).map((u, i) => <li key={i}>{u.event} ({u.tag}) → missing line</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => run(true)} disabled={busy} className="text-sm px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite disabled:opacity-40">
          {busy ? "Running…" : "Dry run"}
        </button>
        <button onClick={() => run(false)} disabled={busy} className="text-sm px-3 py-1.5 rounded-md bg-safety text-steel font-medium disabled:opacity-40">
          Run backfill
        </button>
      </div>
    </div>
  );
}
