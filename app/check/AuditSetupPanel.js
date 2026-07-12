"use client";

// Who you are, and whether history is recording. No login/logout yet — identity
// is by convention, so the audit log can say "Fern changed this" rather than
// "someone changed this".

import { useIdentity } from "@/app/components/identity";

export default function AuditSetupPanel({ configured }) {
  const { actor, change } = useIdentity();

  return (
    <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-2">History &amp; identity</p>

      <div className="flex items-center gap-2 mb-3 text-sm">
        <span className="text-rebar">Signed in as</span>
        <span className="text-concrete font-medium">{actor || "—"}</span>
        <button onClick={change} className="text-xs px-2 py-0.5 rounded border border-line text-rebar hover:text-concrete">Change</button>
      </div>

      {configured ? (
        <p className="text-xs text-ok">
          History is recording — every change is stamped with who made it.{" "}
          <a href="/history" className="underline">View it →</a>
        </p>
      ) : (
        <p className="text-xs text-warn">
          The audit log database isn&apos;t reachable. Check that the Audit Log database in Notion has been
          shared with the integration (⋯ → Connections).
        </p>
      )}
    </div>
  );
}
