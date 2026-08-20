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
    // close-out marks the project notified so the dashboard alert clears
    if (isClose && project.id) {
      try {
        await fetch(`/api/projects/${project.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: { supplierPoNotified: true } }),
        });
      } catch {}
    }
    const href = `mailto:${encodeURIComponent(supplier.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setPicking(false);
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
          <div className="w-full max-w-sm rounded-lg border border-line p-4" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-concrete font-medium">{isClose ? "Close-out email" : "Material PO request"}</h3>
              <button onClick={() => setPicking(false)} className="text-rebar hover:text-concrete">✕</button>
            </div>
            <p className="text-xs text-rebar mb-3">Pick a supplier — opens a pre-filled email you review and send.</p>

            {fields._addressMissing && !isClose && (
              <div className="text-xs text-warn rounded border border-warn/40 bg-warn/10 p-2 mb-3">
                No site address or crossroads on this project. Add “Site Crossroads” (or a Site Street) on the project first, or the email will go out without a job address.
              </div>
            )}

            <div className="space-y-1.5">
              {SUPPLIERS.map((s) => (
                <button key={s.id} onClick={() => compose(s)}
                  className="w-full flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-left hover:border-rebar hover:bg-graphite/40">
                  <span className="text-sm text-concrete">{s.name}</span>
                  <span className="text-[11px] text-rebar">{s.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
