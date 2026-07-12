"use client";

// PROJECT DETAILS — the same editor as the project page, in a dialog.
// Point: from Billing you can glance at (or fix) the project without losing your
// place. One form serves both surfaces, so they can't drift apart.

import { useEffect, useState } from "react";
import ProjectForm from "@/app/projects/ProjectForm";

export default function ProjectDetailsModal({ projectId, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/admin`);
        const d = await res.json();
        if (!d.ok) throw new Error(d.error);
        if (alive) setData(d);
      } catch (e) { if (alive) setErr(String(e.message || e)); }
    })();
    return () => { alive = false; };
  }, [projectId]);

  // Escape closes, like any dialog should.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-lg border border-line shadow-2xl"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line">
          <p className="text-sm font-medium text-concrete">Project details</p>
          <button onClick={onClose} className="ml-auto text-rebar hover:text-concrete" aria-label="Close">✕</button>
        </div>

        <div className="p-5">
          {err ? (
            <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80">{err}</div>
          ) : !data ? (
            <p className="text-sm text-rebar">Loading…</p>
          ) : (
            <ProjectForm
              project={data.project}
              bidOptions={data.bidOptions}
              takenBidIds={data.takenBidIds}
              modal
              onClose={onClose}
              onSaved={() => { onSaved?.(); onClose(); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
