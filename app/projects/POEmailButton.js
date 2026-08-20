"use client";

// "Request material PO" — pick a supplier, then open a pre-filled email (mailto,
// so it lands in the user's default mail app / Outlook) that the supplier turns
// into a job PO for material-cost tracking. Also handles the close-out email for
// completed jobs. Address uses Site Street, falling back to Site Crossroads;
// if both are missing it warns instead of sending a blank address.
import { useState } from "react";
import { SUPPLIERS, resolvePOFields } from "@/lib/suppliers";

export default function POEmailButton({ project, mode = "open" }) {
  const [picking, setPicking] = useState(false);
  const fields = resolvePOFields(project);
  const isClose = mode === "close";

  const compose = async (supplier) => {
    const subject = isClose ? supplier.closeSubject(fields) : supplier.subject(fields);
    const body = isClose ? supplier.closeBody(fields) : supplier.body(fields);
    if (isClose && project.id) {
      try {
        await fetch(`/api/projects/${project.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: { supplierPoNotified: true } }),
        });
      } catch {}
    }
    openMail({ to: supplier.email, subject, body });
    setPicking(false);
  };

  const composeBoth = async () => {
    const s0 = SUPPLIERS[0];
    const subject = isClose ? s0.closeSubject(fields) : s0.subject(fields);
    const body = isClose ? s0.closeBody(fields) : s0.body(fields);
    if (isClose && project.id) {
      try {
        await fetch(`/api/projects/${project.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: { supplierPoNotified: true } }),
        });
      } catch {}
    }
    openMail({ to: SUPPLIERS[0].email, bcc: SUPPLIERS.slice(1).map((s) => s.email).join(","), subject, body });
    setPicking(false);
  };

  const openMail = ({ to, bcc, subject, body }) => {
    const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`];
    if (bcc) params.unshift(`bcc=${encodeURIComponent(bcc)}`);
    const href = `mailto:${to}?${params.join("&")}`;
    const a = document.createElement("a");
    a.href = href; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <>
      <button
        onClick={() => setPicking(true)}
        className={`text-sm px-3 py-1.5 rounded-md font-medium ${isClose ? "border border-line text-concrete hover:border-rebar" : "bg-safety text-steel"}`}
      >
        {isClose ? "Notify supplier of close-out" : "Request material PO"}
      </button>

      {picking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPicking(false)}>
          <div className="w-full max-w-md rounded-xl border border-line p-6 max-h-[85vh] overflow-y-auto" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            {/* header — ✕ pinned top-right, title gets full width so it doesn't wrap */}
            <div className="relative mb-4">
              <button onClick={() => setPicking(false)} className="absolute top-0 right-0 text-rebar hover:text-concrete">✕</button>
              <h3 className="text-concrete font-semibold text-lg leading-tight pr-8">{isClose ? "Notify supplier of close-out" : "Request material PO"}</h3>
              <p className="text-sm text-rebar mt-1 pr-8">{project.name || "This job"}{project.projectId ? ` · ${project.projectId}` : ""}</p>
            </div>

            <p className="text-sm text-rebar mb-4 leading-relaxed">
              {isClose ? "Emails the supplier to close the PO and send final billing." : "Emails the supplier to open a job PO for material-cost tracking."}
            </p>

            {fields._addressMissing && !isClose && (
              <div className="text-xs text-warn rounded-lg border border-warn/40 bg-warn/10 p-3 mb-4 leading-relaxed">
                <span className="font-medium">No job address yet.</span> Add a Site Street or Site Crossroads on this project first, or the email goes out without one.
              </div>
            )}

            <div className="text-[10px] uppercase tracking-wider text-rebar/60 mb-2">Supplier</div>
            <div className="space-y-2">
              {SUPPLIERS.map((s) => (
                <button key={s.id} onClick={() => compose(s)}
                  className="w-full rounded-lg border border-line px-4 py-3 text-left hover:border-safety hover:bg-graphite/40 transition-colors group">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-concrete">{s.name}</span>
                    <span className="text-[11px] text-rebar group-hover:text-safety shrink-0">Compose →</span>
                  </div>
                  <div className="text-[11px] text-rebar mt-0.5 truncate">{s.email}</div>
                </button>
              ))}
              {SUPPLIERS.length > 1 && (
                <button onClick={composeBoth}
                  className="w-full rounded-lg border border-line px-4 py-3 text-left hover:border-safety hover:bg-graphite/40 transition-colors group">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-concrete">Send to both</span>
                    <span className="text-[11px] text-rebar group-hover:text-safety shrink-0">Compose →</span>
                  </div>
                  <div className="text-[11px] text-rebar mt-0.5">One email — {SUPPLIERS[0].name} in To, others BCC'd (they won't see each other)</div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
