"use client";

// Who you are, and whether history is recording. No login/logout yet — identity
// is by convention, so the audit log can say "Fern changed this" rather than
// "someone changed this".

import { useState } from "react";
import { useIdentity } from "@/app/components/identity";

export default function AuditSetupPanel({ configured }) {
  const { actor, change } = useIdentity();
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true); setCheck(null);
    try {
      const res = await fetch("/api/admin/verify-audit");
      setCheck(await res.json());
    } catch (e) {
      setCheck({ ok: false, error: String(e.message || e) });
    }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-2">History &amp; identity</p>

      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className="text-rebar">Signed in as</span>
        <span className="text-concrete font-medium">{actor || "—"}</span>
        <button onClick={change} className="text-xs px-2 py-0.5 rounded border border-line text-rebar hover:text-concrete">Change</button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <button onClick={verify} disabled={busy} className="text-xs px-2.5 py-1 rounded border border-line text-concrete hover:bg-graphite disabled:opacity-40">
          {busy ? "Checking…" : "Check history setup"}
        </button>
        <a href="/history" className="text-xs text-info hover:underline">View history →</a>
      </div>

      {check && (
        check.ok ? (
          <div className="rounded border border-ok/40 bg-ok/10 p-2.5 text-xs">
            <p className="text-concrete">Set up correctly — &ldquo;{check.title}&rdquo; is reachable and every property matches. History is recording.</p>
          </div>
        ) : (
          <div className="rounded border border-danger/50 bg-danger/10 p-2.5 text-xs">
            {check.error && <p className="text-concrete mb-1">{check.error}</p>}
            {check.problems?.length > 0 && (
              <>
                <p className="text-concrete mb-1">Not recording yet — fix these in Notion:</p>
                <ul className="list-disc pl-4 text-rebar space-y-0.5">
                  {check.problems.map((p, i) => (
                    <li key={i}><span className="text-concrete">{p.property}</span> — {p.issue}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}
