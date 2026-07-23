"use client";

// =============================================================================
// PROJECT EDIT — the project's own form, in a pop-up.
//
// It opens READ-ONLY on purpose. Most of the time you're here to look at the job
// or bump its stage, not to change data — so the fields come up grayed, and you
// unlock them deliberately with "Edit project". That way a stray click can't
// quietly alter a live job.
//
// The stage chevron is the exception: it stays live at all times, because moving
// a job along is the one thing you do constantly and it's already guarded by its
// own confirmation.
// =============================================================================

import { useEffect, useState } from "react";
import StagePath from "@/app/components/StagePath";
import ProjectForm from "@/app/projects/ProjectForm";

export default function ProjectEditModal({ projectId, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [locked, setLocked] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetch(`/api/projects/${projectId}`).then((r) => r.json());
        if (!d.ok) throw new Error(d.error);
        if (alive) setData(d);
      } catch (e) { if (alive) setErr(String(e.message || e)); }
    })();
    return () => { alive = false; };
  }, [projectId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-lg border border-line shadow-2xl flex flex-col"
        style={{ background: "var(--surface)", maxHeight: "90vh" }}
      >
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-concrete truncate">{data?.project?.name || "Project"}</p>
            {data?.project?.projectId && <p className="text-xs text-rebar">{data.project.projectId}</p>}
          </div>
          <button onClick={onClose} className="ml-auto text-rebar hover:text-concrete" aria-label="Close">✕</button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {err && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">{err}</div>}
          {!data && !err && <p className="text-sm text-rebar">Loading…</p>}

          {data?.project && (
            <>
              {/* always live — moving a job along is guarded by its own confirm */}
              <div className="mb-4">
                <StagePath status={data.project.status} projectId={projectId} onChanged={() => window.location.reload()} />
              </div>

              {locked && (
                <p className="text-xs text-rebar mb-3">Viewing only — the stage above can still be changed. Use <span className="text-concrete">Edit project</span> below to change the rest.</p>
              )}

              <ProjectForm
                project={data.project}
                bidOptions={data.bidOptions || []}
                modal
                readOnly={locked}
                onSaved={() => window.location.reload()}
                onClose={onClose}
              />
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line shrink-0 flex gap-2">
          {locked ? (
            <button onClick={() => setLocked(false)} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Edit project</button>
          ) : (
            <button onClick={() => setLocked(true)} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Stop editing</button>
          )}
          <button onClick={onClose} className="ml-auto text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Close</button>
        </div>
      </div>
    </div>
  );
}
