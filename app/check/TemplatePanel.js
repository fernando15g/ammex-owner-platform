"use client";

// Change the proposal template without a developer.
//
// Before: download a JavaScript file, drop it into GitHub, push. Which means in
// practice the template never gets changed — it becomes a thing you ask someone
// else for. Now: upload it here and the next proposal uses it.

import { useState, useEffect } from "react";

export default function TemplatePanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [problems, setProblems] = useState([]);
  const [done, setDone] = useState(null);

  async function refresh() {
    try {
      const d = await fetch("/api/admin/template/status").then((r) => r.json());
      setStatus(d);
    } catch {}
  }
  useEffect(() => { refresh(); }, []);

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr(null); setProblems([]); setDone(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const d = await fetch("/api/admin/template", { method: "POST", body }).then((r) => r.json());
      if (!d.ok) { setErr(d.error); setProblems(d.problems || []); }
      else { setDone(`${file.name} is live${d.hasLogo ? " — logo included" : ""}. Every proposal from now on uses it.`); refresh(); }
    } catch (e2) { setErr(String(e2.message || e2)); }
    setBusy(false);
    e.target.value = "";
  }

  async function revert() {
    if (!window.confirm("Go back to the template built into the app?\n\nYour uploaded one is removed.")) return;
    setBusy(true); setErr(null); setDone(null);
    try {
      const d = await fetch("/api/admin/template", { method: "DELETE" }).then((r) => r.json());
      if (!d.ok) throw new Error(d.error);
      setDone("Back to the built-in template.");
      refresh();
    } catch (e2) { setErr(String(e2.message || e2)); }
    setBusy(false);
  }

  const uploaded = status?.source === "uploaded";

  return (
    <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-1">Proposal template</p>
      <p className="text-xs text-rebar mb-3">
        The Excel file every proposal is built from — logo, terms, licence numbers, number formats. Proposals
        are generated from this exact file, so they reach a GC looking the way they always have.
      </p>

      {status && (
        <div className="rounded-md border border-line px-3 py-2 mb-3 text-xs" style={{ background: "var(--surface-2)" }}>
          <span className="text-rebar">In use: </span>
          <span className="text-concrete font-medium">
            {uploaded ? "your uploaded template" : "the built-in template"}
          </span>
          {uploaded && status.uploadedAt && (
            <span className="text-rebar"> · uploaded {new Date(status.uploadedAt).toLocaleDateString()}</span>
          )}
        </div>
      )}

      {status && !status.storageReady && (
        <div className="rounded border border-warn/40 bg-warn/10 p-3 text-xs mb-3">
          <p className="text-concrete font-medium mb-1.5">Uploads aren&apos;t switched on yet.</p>
          <p className="text-rebar mb-2">
            Proposals still work — they use the built-in template. To be able to replace it from here, Vercel
            needs somewhere to keep it:
          </p>
          <ol className="list-decimal pl-4 text-rebar space-y-1">
            <li>Open your project in Vercel</li>
            <li>Go to the <span className="text-concrete">Storage</span> tab</li>
            <li>Click <span className="text-concrete">Create Database</span> → choose <span className="text-concrete">Blob</span></li>
            <li>Name it anything, and connect it to this project</li>
            <li>Redeploy</li>
          </ol>
          <p className="text-rebar mt-2">Vercel adds the token itself — there&apos;s nothing to copy or type.</p>
        </div>
      )}

      {err && (
        <div className="rounded border border-danger/50 bg-danger/10 p-3 text-xs mb-3">
          <p className="text-concrete mb-1">{err}</p>
          {problems.length > 0 && (
            <>
              <ul className="list-disc pl-4 text-rebar space-y-0.5 mt-1.5">
                {problems.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
              <p className="text-rebar mt-2">
                The layout is checked on purpose. A template with a column out of place would produce proposals
                that look right and are wrong — which you&apos;d only find out after sending one.
              </p>
            </>
          )}
        </div>
      )}

      {done && <div className="rounded border border-ok/40 bg-ok/10 p-3 text-xs text-concrete mb-3">{done}</div>}

      <div className="flex flex-wrap gap-2">
        <a href="/api/admin/template" className="text-sm px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite">
          Download current template
        </a>

        <label
          className={`text-sm px-3 py-1.5 rounded-md font-medium ${
            status?.storageReady ? "bg-safety text-steel cursor-pointer" : "border border-line text-rebar/50 cursor-not-allowed"
          } ${busy ? "opacity-50" : ""}`}
        >
          {busy ? "Checking…" : "Upload a new one"}
          <input type="file" accept=".xlsx" onChange={upload} disabled={busy || !status?.storageReady} className="hidden" />
        </label>

        {uploaded && (
          <button onClick={revert} disabled={busy} className="text-sm px-3 py-1.5 rounded-md border border-line text-rebar hover:text-concrete disabled:opacity-40">
            Revert to built-in
          </button>
        )}
      </div>

      <p className="text-[11px] text-rebar mt-2.5">
        Download it, change it in Excel, upload it back. That&apos;s the whole update.
      </p>
    </div>
  );
}
