"use client";

// =============================================================================
// PROJECT FORM — create or edit a project, including the bid it's attached to.
//
// The bid link matters more than it looks: a project resolves its line items
// through its related bid, so a project with no bid attached has no line items,
// no contract value, and every downstream number reads zero. That link could
// previously only be made in Notion.
// =============================================================================

import { useState, useEffect } from "react";

const PROJECT_STATUSES = [
  "Bidding", "Awarded", "Mobilizing", "Active",
  "Punchlist", "Waiting on billing", "Closed", "Paid",
];

export default function ProjectForm({ project = null, bidOptions = [], takenBidIds = [], presetBidId = null, presetName = "", modal = false, onSaved = null, onClose = null }) {
  const isNew = !project;
  const taken = new Set(takenBidIds);

  const [f, setF] = useState({
    name: project?.name || presetName || "",
    projectId: project?.projectId || "",
    status: project?.status || "Awarded",
    actualStartDate: (project?.actualStartDate || "").slice(0, 10),
    foreman: (project?.foreman || []).join(", "),
    relatedBidId: project?.relatedBidId || presetBidId || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Suggest the next Project ID by following whatever pattern is already in use.
  useEffect(() => {
    if (!isNew || f.projectId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/projects/suggest-id", { method: "POST" });
        const d = await res.json();
        if (alive && d.ok && d.projectId) setF((s) => (s.projectId ? s : { ...s, projectId: d.projectId }));
      } catch {}
    })();
    return () => { alive = false; };
  }, [isNew, f.projectId]);

  async function save() {
    if (!f.name.trim()) { setErr("A project needs a name."); return; }
    setBusy(true); setErr(null);
    const payload = {
      name: f.name.trim(),
      projectId: f.projectId.trim(),
      status: f.status,
      actualStartDate: f.actualStartDate || null,
      foreman: f.foreman ? f.foreman.split(",").map((x) => x.trim()).filter(Boolean) : [],
      relatedBidId: f.relatedBidId || null,
    };
    try {
      const res = await fetch(isNew ? "/api/projects" : `/api/projects/${project.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? { project: payload } : { changes: payload }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      if (modal) { setBusy(false); onSaved?.(); return; }
      window.location.href = isNew ? `/billing/${d.id}` : `/projects/${project.id}`;
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  async function remove() {
    const typed = window.prompt(
      `Delete "${project.name}"?\n\nOnly projects with no billing history can be deleted. The record is archived (recoverable).\n\nType DELETE to confirm.`
    );
    if (typed !== "DELETE") { if (typed != null) setErr("Delete cancelled — you must type DELETE exactly."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/delete`, { method: "POST" });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      window.location.href = "/active";
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  return (
    <div className={modal ? "" : "max-w-3xl"}>
      {err && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">{err}</div>}

      <div className={modal ? "" : "rounded-lg border border-line p-5"} style={modal ? undefined : { background: "var(--surface)" }}>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block sm:col-span-2">
            <span className="text-xs text-rebar mb-1 block">Project name</span>
            <input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Peoria Ave Bridge" />
          </label>

          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Project ID</span>
            <input className="inp" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} placeholder="26-05" />
            <span className="text-[11px] text-rebar mt-1 block">Suggested from your existing numbering. Change it if you like.</span>
          </label>

          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Status</span>
            <select className="inp" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs text-rebar mb-1 block">Attached bid</span>
            <select className="inp" value={f.relatedBidId} onChange={(e) => setF({ ...f, relatedBidId: e.target.value })}>
              <option value="">— none —</option>
              {bidOptions.map((b) => (
                <option key={b.id} value={b.id} disabled={taken.has(b.id) && b.id !== project?.relatedBidId}>
                  {b.name}{b.gc?.length ? ` · ${b.gc.join(", ")}` : ""}{b.status ? ` · ${b.status}` : ""}
                  {taken.has(b.id) && b.id !== project?.relatedBidId ? " (already on another project)" : ""}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-rebar mt-1 block">
              The project gets its line items — and therefore its contract value — through this bid. With no bid attached, its contract reads $0.
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Start date</span>
            <input type="date" className="inp" value={f.actualStartDate} onChange={(e) => setF({ ...f, actualStartDate: e.target.value })} />
          </label>

          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Foreman</span>
            <input className="inp" value={f.foreman} onChange={(e) => setF({ ...f, foreman: e.target.value })} placeholder="comma separated" />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          <button onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">
            {busy ? "Saving…" : isNew ? "Create project" : "Save changes"}
          </button>
          {!isNew && !modal && (
            <a href={`/billing/${project.id}`} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">Billing</a>
          )}
          {modal ? (
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
          ) : (
            <a href="/active" className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</a>
          )}
          {!isNew && (
            <button onClick={remove} disabled={busy} className="ml-auto text-sm px-4 py-2 rounded-md border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40">
              Delete project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
