"use client";
import { useState, useEffect } from "react";

// "Manage options" pencil for a select/multi-select field. Modal lists every
// option with its usage count; RENAME cascades to all records, DELETE removes
// the choice everywhere. Both edit the Notion database structure — so both show
// impact and delete confirms first.
export default function ManageOptions({ prop, onChanged }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title={`Manage ${prop} options (rename / delete)`}
        className="text-rebar hover:text-concrete text-xs ml-1.5 align-middle"
      >✎</button>
      {open && <OptionsModal prop={prop} onClose={() => setOpen(false)} onChanged={onChanged} />}
    </>
  );
}

function OptionsModal({ prop, onClose, onChanged }) {
  const [opts, setOpts] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");

  const load = async () => {
    setErr(null);
    try {
      const r = await fetch(`/api/manage-options?prop=${encodeURIComponent(prop)}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setOpts(d.options);
    } catch (e) { setErr(String(e.message || e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [prop]);

  const act = async (body, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/manage-options", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prop, ...body }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      setEditing(null);
      await load();
      onChanged && onChanged();
    } catch (e) { setErr(String(e.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-line p-4 max-h-[80vh] overflow-y-auto" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-concrete font-medium">Manage {prop} options</h3>
          <button onClick={onClose} className="text-rebar hover:text-concrete">✕</button>
        </div>
        <p className="text-[11px] text-rebar mb-3">Rename cascades to every record using it. Delete removes the choice everywhere.</p>
        {err && <div className="text-danger text-xs mb-2 rounded border border-danger/40 bg-danger/10 p-2">{err}</div>}
        {!opts ? (
          <div className="text-rebar text-sm py-6 text-center">Loading options…</div>
        ) : opts.length === 0 ? (
          <div className="text-rebar text-sm py-6 text-center">No options yet.</div>
        ) : (
          <div className="divide-y divide-line">
            {opts.map((o) => (
              <div key={o.id} className="py-2 flex items-center gap-2">
                {editing === o.id ? (
                  <>
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="inp-sm flex-1" />
                    <button disabled={busy} onClick={() => act({ action: "rename", optionId: o.id, newName: draft }, null)} className="text-xs px-2 py-1 rounded bg-safety text-steel font-medium disabled:opacity-50">Save</button>
                    <button onClick={() => setEditing(null)} className="text-xs px-2 py-1 rounded border border-line text-rebar">Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-concrete text-sm truncate">{o.name}</span>
                    <span className="text-[11px] text-rebar tabular-nums shrink-0">{o.count} {o.count === 1 ? "record" : "records"}</span>
                    <button onClick={() => { setEditing(o.id); setDraft(o.name); }} className="text-xs px-2 py-1 rounded border border-line text-rebar hover:text-concrete shrink-0">Rename</button>
                    <button
                      disabled={busy}
                      onClick={() => act({ action: "delete", optionId: o.id }, `Delete "${o.name}"? It's used on ${o.count} ${o.count === 1 ? "record" : "records"} — they'll lose this value.`)}
                      className="text-xs px-2 py-1 rounded border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50 shrink-0"
                    >Delete</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
