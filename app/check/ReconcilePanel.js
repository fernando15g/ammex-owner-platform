"use client";

// RECONCILIATION — asks the data whether it still adds up.
//
// Read-only on purpose. It reports; it never repairs. A tool that quietly fixed
// your books would hide the bug that caused the problem in the first place.

import { useState } from "react";

const TONE = {
  error: { box: "border-danger/50 bg-danger/10", tag: "text-danger border-danger/50" },
  warning: { box: "border-warn/40 bg-warn/10", tag: "text-warn border-warn/50" },
};

export default function ReconcilePanel() {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [err, setErr] = useState(null);

  async function run() {
    setBusy(true); setErr(null); setReport(null);
    try {
      const res = await fetch("/api/reconcile");
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      setReport(d.report);
    } catch (e) { setErr(String(e.message || e)); }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-line p-4 mb-6" style={{ background: "var(--surface)" }}>
      <p className="text-sm font-medium text-concrete mb-1">Reconciliation</p>
      <p className="text-xs text-rebar mb-3">
        Checks whether the books still agree with themselves — that every invoice matches the line items it
        billed, every payment points at a real invoice, and no short pay was left half-undone. It reports;
        it never repairs.
      </p>

      {err && <div className="rounded border border-danger/50 bg-danger/10 p-2 text-sm text-concrete/80 mb-3">{err}</div>}

      {report && (
        <div className="mb-3">
          <div className={`rounded border p-3 mb-2 ${report.ok ? "border-ok/40 bg-ok/10" : "border-danger/50 bg-danger/10"}`}>
            <p className="text-sm text-concrete font-medium">
              {report.ok ? "Everything adds up." : `${report.counts.errors} problem${report.counts.errors === 1 ? "" : "s"} found.`}
              {report.counts.warnings > 0 && <span className="text-warn font-normal"> · {report.counts.warnings} thing{report.counts.warnings === 1 ? "" : "s"} worth a look.</span>}
            </p>
            <p className="text-xs text-rebar mt-1">
              Checked {report.counts.projects} project{report.counts.projects === 1 ? "" : "s"}, {report.counts.invoices} invoice{report.counts.invoices === 1 ? "" : "s"}, {report.counts.payments} payment{report.counts.payments === 1 ? "" : "s"}, {report.counts.lineItems} line item{report.counts.lineItems === 1 ? "" : "s"}.
            </p>
          </div>

          {report.issues.map((i, n) => (
            <div key={n} className={`rounded border p-2.5 mb-1.5 ${TONE[i.severity].box}`}>
              <div className="flex items-start gap-2">
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${TONE[i.severity].tag}`}>
                  {i.severity === "error" ? "Problem" : "Look"}
                </span>
                <p className="text-sm text-concrete/90">{i.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={run} disabled={busy} className="text-sm px-3 py-1.5 rounded-md bg-safety text-steel font-medium disabled:opacity-40">
        {busy ? "Checking…" : report ? "Check again" : "Run reconciliation"}
      </button>
    </div>
  );
}
