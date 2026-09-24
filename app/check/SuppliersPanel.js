"use client";

// Material suppliers — edit who PO requests go to without a code push.
// Reads from the Notion Suppliers table; if that is empty the built-in list is
// shown instead, with a one-click way to copy it into Notion so it becomes
// editable. The email templates themselves stay in code — only WHO is here.
import { useEffect, useState } from "react";

export default function SuppliersPanel() {
  const [rows, setRows] = useState([]);
  const [source, setSource] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [edit, setEdit] = useState({});

  const load = async () => {
    try {
      const d = await fetch("/api/suppliers").then((r) => r.json());
      setRows(d.suppliers || []);
      setSource(d.source || null);
    } catch (e) {
      setMsg(String(e?.message || e));
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (row) => {
    const e = edit[row.id] || {};
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/suppliers", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          changes: {
            name: e.name ?? row.name,
            emails: (e.emails ?? (row.emails || []).join(", ")).split(/[,;]/).map((x) => x.trim()).filter(Boolean),
          },
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "save failed");
      setEdit((s) => ({ ...s, [row.id]: undefined }));
      setMsg("Saved.");
      await load();
    } catch (err) {
      setMsg(String(err?.message || err));
    }
    setBusy(false);
  };

  // Copy the built-in list into Notion so it becomes editable.
  const seed = async () => {
    setBusy(true); setMsg(null);
    try {
      for (const r of rows) {
        await fetch("/api/suppliers", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ create: { name: r.name, emails: r.emails, template: r.template, active: true } }),
        });
      }
      // Notion has about a second of write lag, so an immediate read can still
      // come back empty and leave the panel looking like nothing happened.
      await new Promise((r) => setTimeout(r, 2000));
      await load();
      setMsg("Copied into Notion — they are editable now.");
    } catch (err) {
      setMsg(String(err?.message || err));
    }
    setBusy(false);
  };

  return (
    <div className="rounded-lg border border-line p-5" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-concrete">Material suppliers</h2>
        <span className="text-[11px] text-rebar">
          {source === "notion" ? "from Notion" : source === "built-in" ? "built-in defaults" : ""}
        </span>
      </div>
      <p className="text-[11px] text-rebar mt-1 leading-relaxed">
        Who the PO request emails go to. Several addresses per supplier — separate them with commas.
      </p>

      {source === "built-in" && (
        <div className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-3">
          <p className="text-[11px] text-warn leading-relaxed">
            The Notion Suppliers table is empty, so the built-in list is being used. Copy it into Notion to edit
            addresses without a code change.
          </p>
          <button onClick={seed} disabled={busy}
            className="mt-2 text-xs px-3 py-1.5 rounded-md bg-safety text-steel font-medium disabled:opacity-50">
            {busy ? "Copying…" : "Copy into Notion"}
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {rows.map((r) => {
          const e = edit[r.id] || {};
          const dirty = e.name !== undefined || e.emails !== undefined;
          const editable = source === "notion";
          return (
            <div key={r.id} className="rounded-md border border-line p-3" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <input
                  className="inp text-sm" disabled={!editable}
                  value={e.name ?? r.name}
                  onChange={(ev) => setEdit((s) => ({ ...s, [r.id]: { ...e, name: ev.target.value } }))}
                />
                <span className="text-[10px] uppercase tracking-wide text-rebar shrink-0 ml-2">{r.template}</span>
              </div>
              <input
                className="inp text-sm mt-2" disabled={!editable}
                value={e.emails ?? (r.emails || []).join(", ")}
                onChange={(ev) => setEdit((s) => ({ ...s, [r.id]: { ...e, emails: ev.target.value } }))}
                placeholder="name@supplier.com, second@supplier.com"
              />
              {editable && dirty && (
                <button onClick={() => save(r)} disabled={busy}
                  className="mt-2 text-xs px-3 py-1.5 rounded-md bg-safety text-steel font-medium disabled:opacity-50">
                  {busy ? "Saving…" : "Save"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {msg && <p className="text-[11px] text-rebar mt-3">{msg}</p>}
    </div>
  );
}
