"use client";

// Stand up the audit log, and change who you are — both live here so there's no
// need for a real login yet.

import { useState } from "react";
import { useIdentity } from "@/app/components/identity";

export default function AuditSetupPanel({ configured }) {
  const { actor, change } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  async function setup() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const res = await fetch("/api/admin/setup-audit", { method: "POST" });
      const d = await res.json();
      if (!d.ok) { setErr(d.error); setResult(d.manual ? d : null); }
      else setResult(d);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-1">History &amp; identity</p>

      {/* who you are */}
      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className="text-rebar">Signed in as</span>
        <span className="text-concrete font-medium">{actor || "—"}</span>
        <button onClick={change} className="text-xs px-2 py-0.5 rounded border border-line text-rebar hover:text-concrete">Change</button>
      </div>

      {configured ? (
        <p className="text-xs text-ok">History is recording. <a href="/history" className="underline">View it →</a></p>
      ) : (
        <>
          <p className="text-xs text-rebar mb-3">
            The audit log records who changed what, and when. It can&apos;t be added retroactively — anything that
            happens before it&apos;s switched on is gone for good. This creates its Notion database.
          </p>

          {err && <div className="rounded border border-danger/50 bg-danger/10 p-2 text-xs text-concrete/80 mb-2">{err}</div>}

          {result?.databaseId && (
            <div className="rounded border border-ok/40 bg-ok/10 p-3 text-xs mb-2">
              <p className="text-concrete mb-1">Database created. Now finish it off:</p>
              <ol className="list-decimal pl-4 text-rebar space-y-0.5">
                <li>In Vercel → Settings → Environment Variables, add <code className="text-concrete">AUDIT_DB_ID</code></li>
                <li>Paste this value: <code className="text-concrete break-all">{result.databaseId}</code></li>
                <li>Redeploy</li>
              </ol>
            </div>
          )}

          {result?.spec && (
            <div className="rounded border border-warn/40 bg-warn/10 p-3 text-xs mb-2">
              <p className="text-concrete mb-1">Create a database called <strong>Audit Log</strong> in Notion with these properties, share it with the integration, then set its ID as AUDIT_DB_ID in Vercel:</p>
              <ul className="list-disc pl-4 text-rebar">
                {result.spec.map((f) => (
                  <li key={f.name}><span className="text-concrete">{f.name}</span> — {f.type}{f.options ? ` (${f.options.join(", ")})` : ""}</li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={setup} disabled={busy} className="text-sm px-3 py-1.5 rounded-md bg-safety text-steel font-medium disabled:opacity-40">
            {busy ? "Setting up…" : "Set up history"}
          </button>
        </>
      )}
    </div>
  );
}
