"use client";

// "Request material PO" — pick a supplier, then open a pre-filled email (mailto,
// so it lands in the user's default mail app / Outlook) that the supplier turns
// into a job PO for material-cost tracking. Also handles the close-out email for
// completed jobs. Address uses Site Street, falling back to Site Crossroads;
// if both are missing it warns instead of sending a blank address.
import { useState } from "react";
import { SUPPLIERS as BUILT_IN, TEMPLATES, TEMPLATES_NEEDING_SALES_AMOUNT, resolvePOFields } from "@/lib/suppliers";
import { fmtDateLocal } from "@/lib/format/dates";

export default function POEmailButton({ project, mode = "open" }) {
  const [picking, setPicking] = useState(false);
  // Contacts come from Notion so they can change without a push; the built-in
  // list is the fallback so a PO is never blocked by a settings read. Loaded
  // lazily when the picker opens — no cost on a page that never sends one.
  const [suppliers, setSuppliers] = useState(BUILT_IN);
  const loadSuppliers = async () => {
    try {
      const d = await fetch("/api/suppliers").then((r) => r.json());
      if (d?.ok && Array.isArray(d.suppliers) && d.suppliers.length) {
        setSuppliers(d.suppliers.map((x) => ({ ...x, ...(TEMPLATES[x.template] || TEMPLATES.standard) })));
      }
    } catch {}
  };
  // Atlas asks for an estimated sales amount. Preselected on big jobs (over 1M
  // lbs is always over $2,500); below that it must be chosen deliberately.
  const bigJob = (Number(project?.estimatedLbs ?? project?.awardedLbs ?? project?.bid?.estimatedLbs) || 0) > 1_000_000;
  const [salesAmount, setSalesAmount] = useState(bigJob ? "MORE THAN $2500" : null);
  // "Supplier PO Notified" is already written to Notion when an email is sent —
  // this just surfaces it. Local state so the tick appears immediately after
  // sending, without waiting for a reload.
  // Two different events, deliberately kept on separate fields:
  //   close-out notification -> supplierPoNotified (the dashboard close-out alert
  //     fires on COMPLETE && !supplierPoNotified, so the PO request must not set it)
  //   material PO request    -> supplierPoSentDate / supplierPoSentTo
  const isCloseMode = mode === "close";
  const [sentAt, setSentAt] = useState(project?.supplierPoSentDate ?? null);
  const [sentTo, setSentTo] = useState(project?.supplierPoSentTo ?? null);
  const [closeNotified, setCloseNotified] = useState(!!project?.supplierPoNotified);
  const sent = isCloseMode ? closeNotified : !!sentAt;
  const fields = resolvePOFields(project);
  const isClose = mode === "close";

  // Phoenix-local date, not the server's: a late-evening send must not record
  // tomorrow. Compared as a "YYYY-MM-DD" string like every other date here.
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });

  const markSent = async (label) => {
    if (!project?.id) return;
    const changes = isClose
      ? { supplierPoNotified: true }
      : { supplierPoSentDate: today(), supplierPoSentTo: label };
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      if (isClose) setCloseNotified(true);
      else { setSentAt(today()); setSentTo(label); }
    } catch {}
  };

  const compose = async (supplier) => {
    const f = { ...fields, salesAmount, today: fmtDateLocal(today()) };
    const subject = isClose ? supplier.closeSubject(f) : supplier.subject(f);
    const body = isClose ? supplier.closeBody(f) : supplier.body(f);
    await markSent(supplier.name || supplier.label || "supplier");
    openMail({ to: (supplier.emails || [supplier.email]).filter(Boolean).join(","), subject, body });
    setPicking(false);
  };

  const composeBoth = async () => {
    const s0 = suppliers[0];
    const f = { ...fields, salesAmount, today: fmtDateLocal(today()) };
    const subject = isClose ? s0.closeSubject(f) : s0.subject(f);
    const body = isClose ? s0.closeBody(f) : s0.body(f);
    await markSent(suppliers.map((x) => x.name).join(", "));
    openMail({
      to: (s0.emails || [s0.email]).filter(Boolean).join(","),
      bcc: suppliers.slice(1).flatMap((x) => x.emails || [x.email]).filter(Boolean).join(","),
      subject, body,
    });
    setPicking(false);
  };

  const openMail = ({ to, bcc, subject, body }) => {
    const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`];
    if (bcc) params.unshift(`bcc=${encodeURIComponent(bcc)}`);
    const href = `mailto:${to}?${params.join("&")}`;
    const a = document.createElement("a");
    a.href = href; a.style.display = "none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setSent(true);
  };

  return (
    <>
      <button
        onClick={() => { setPicking(true); loadSuppliers(); }}
        className={`text-sm px-3 py-1.5 rounded-md font-medium ${isClose ? "border border-line text-concrete hover:border-rebar" : "bg-safety text-steel"}`}
      >
        {isClose ? "Notify supplier of close-out" : "Request material PO"}
        {/* Sent already — the button stays live so a second supplier can be
            emailed or the request re-sent. */}
        {sent && (
          <span className="ml-1.5 text-[11px] align-middle"
            title={isCloseMode
              ? "Close-out notification sent"
              : `PO requested${sentTo ? ` · ${sentTo}` : ""}${sentAt ? ` · ${fmtDateLocal(sentAt)}` : ""}`}>
            ✓
          </span>
        )}
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

            {/* Atlas's form asks for this; the others do not. Preselected on jobs
                over 1M lbs, otherwise it has to be chosen before composing. */}
            {!isClose && suppliers.some((s) => TEMPLATES_NEEDING_SALES_AMOUNT.includes(s.template)) && (
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-wider text-rebar/60 mb-2">Project estimated sales amount</div>
                <div className="flex gap-2">
                  {["LESS THAN $2500", "MORE THAN $2500"].map((opt) => (
                    <button key={opt} onClick={() => setSalesAmount((cur) => (cur === opt ? null : opt))}
                      className={`flex-1 text-xs px-3 py-2 rounded-md border ${salesAmount === opt ? "bg-safety text-steel border-safety font-medium" : "border-line text-rebar hover:text-concrete"}`}>
                      {opt.replace("$2500", "$2,500")}
                    </button>
                  ))}
                </div>
                {!salesAmount && <p className="text-[11px] text-warn mt-1.5">Pick one — Atlas asks for it on their form.</p>}
              </div>
            )}

            <div className="text-[10px] uppercase tracking-wider text-rebar/60 mb-2">Supplier</div>
            <div className="space-y-2">
              {suppliers.map((s) => (
                <button key={s.id} onClick={() => compose(s)}
                  disabled={!isClose && TEMPLATES_NEEDING_SALES_AMOUNT.includes(s.template) && !salesAmount}
                  className="w-full rounded-lg border border-line px-4 py-3 text-left hover:border-safety hover:bg-graphite/40 transition-colors group disabled:opacity-40 disabled:hover:border-line disabled:cursor-not-allowed">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-concrete">{s.name}</span>
                    <span className="text-[11px] text-rebar group-hover:text-safety shrink-0">Compose →</span>
                  </div>
                  <div className="text-[11px] text-rebar mt-0.5 truncate">{(s.emails || [s.email]).filter(Boolean).join(", ")}</div>
                </button>
              ))}
              {suppliers.length > 1 && (
                <button onClick={composeBoth}
                  disabled={!isClose && suppliers.some((x) => TEMPLATES_NEEDING_SALES_AMOUNT.includes(x.template)) && !salesAmount}
                  className="w-full rounded-lg border border-line px-4 py-3 text-left hover:border-safety hover:bg-graphite/40 transition-colors group disabled:opacity-40 disabled:cursor-not-allowed">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-concrete">Send to both</span>
                    <span className="text-[11px] text-rebar group-hover:text-safety shrink-0">Compose →</span>
                  </div>
                  <div className="text-[11px] text-rebar mt-0.5">One email — {suppliers[0].name} in To, others BCC'd (they won't see each other)</div>
                  {/* One email carries one body, and the two templates now differ.
                      Atlas's is a superset, so the others just see a few extra lines. */}
                  <div className="text-[11px] text-rebar/70 mt-0.5">Uses the {suppliers[0].name} format for everyone</div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
