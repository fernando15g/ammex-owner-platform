"use client";

// Update the proposal template without a developer.
//
// The template is embedded in the app as code (Vercel's build prunes loose files
// — which is exactly how the download broke in production while working locally).
// So changing it means changing a code file, and Fern deploys by dragging files
// into GitHub with no terminal to run a script in.
//
// So: the app does the conversion. Download the current template, edit it in
// Excel, upload it back, and it hands you the two files to drop into GitHub.

import { useState } from "react";

export default function TemplatePanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [problems, setProblems] = useState([]);
  const [fileName, setFileName] = useState("");

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr(null); setResult(null); setProblems([]); setFileName(file.name);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/template", { method: "POST", body });
      const d = await res.json();
      if (!d.ok) {
        setErr(d.error);
        setProblems(d.problems || []);
      } else {
        setResult(d);
      }
    } catch (e2) {
      setErr(String(e2.message || e2));
    }
    setBusy(false);
    e.target.value = "";   // let the same file be picked again after a fix
  }

  function downloadCode() {
    const blob = new Blob([result.code], { type: "text/javascript" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "proposalTemplate.js";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-1">Proposal template</p>
      <p className="text-xs text-rebar mb-3">
        The Excel file every proposal is built from — logo, terms, licence numbers, number formats.
        Proposals are generated from this exact file, so they arrive at a GC looking the way they always have.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <a
          href="/api/admin/template"
          className="text-sm px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite"
        >
          Download current template
        </a>

        <label className={`text-sm px-3 py-1.5 rounded-md bg-safety text-steel font-medium cursor-pointer ${busy ? "opacity-50" : ""}`}>
          {busy ? "Checking…" : "Upload a new one"}
          <input type="file" accept=".xlsx" onChange={upload} disabled={busy} className="hidden" />
        </label>
      </div>

      {err && (
        <div className="rounded border border-danger/50 bg-danger/10 p-3 text-xs mb-2">
          <p className="text-concrete mb-1">{err}</p>
          {problems.length > 0 && (
            <ul className="list-disc pl-4 text-rebar space-y-0.5 mt-1.5">
              {problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          <p className="text-rebar mt-2">
            The layout is checked on purpose. A template with a column in the wrong place would produce
            proposals that look right and are wrong — which you&apos;d only discover after sending one.
          </p>
        </div>
      )}

      {result && (
        <div className="rounded border border-ok/40 bg-ok/10 p-3 text-xs">
          <p className="text-concrete font-medium mb-1">
            {fileName} checks out{result.hasLogo ? " — logo included" : " — no logo found"}.
          </p>
          <p className="text-rebar mb-2">Two files to drop into GitHub, then push:</p>
          <ol className="list-decimal pl-4 text-rebar space-y-1">
            <li>
              <button onClick={downloadCode} className="text-info underline hover:no-underline">
                Download proposalTemplate.js
              </button>{" "}
              → replaces <code className="text-concrete">lib/documents/proposalTemplate.js</code>
            </li>
            <li>
              Your Excel file → replaces <code className="text-concrete">templates/proposal-template.xlsx</code>{" "}
              (the master copy — not read by the app, but it&apos;s what you&apos;d edit next time)
            </li>
          </ol>
          <p className="text-rebar mt-2">
            Once that&apos;s deployed, every proposal uses the new template.
          </p>
        </div>
      )}
    </div>
  );
}
