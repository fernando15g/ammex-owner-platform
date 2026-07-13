"use client";

// =============================================================================
// PROJECT DETAILS — a read-only glance from the billing page.
//
// Deliberately NOT an editor. Editing lives on the project page, in one place,
// so the two can't drift apart. This exists to answer "is this the right job,
// and how is it doing?" without losing your place mid-invoice.
//
// What earns a spot here is what's useful WHILE BILLING:
//   - who you're billing (GC) and under what terms (retention, contract)
//   - how far along the job is
//   - whether it's beating or losing to the bid — the productivity indicator,
//     which is the number that tells you if the estimate is holding up
// What's left out: foreman, crew — operational, not useful at invoice time.
// =============================================================================

import { useEffect, useState } from "react";
import StagePath from "@/app/components/StagePath";

const money = (n) => (typeof n === "number" ? `$${Math.round(n).toLocaleString()}` : "—");
const lbs = (n) => (typeof n === "number" ? `${Math.round(n).toLocaleString()} lbs` : "—");
const rate = (n) => (typeof n === "number" ? `${n.toFixed(1)} lbs/MH` : "—");
const dateStr = (s) => {
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
const daysSince = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Math.round((Date.now() - new Date(+m[1], +m[2] - 1, +m[3])) / 86400000);
};

export default function ProjectDetailsModal({ projectId, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await fetch(`/api/projects/${projectId}/summary`).then((r) => r.json());
        if (!d.ok) throw new Error(d.error);
        if (alive) setData(d.summary);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-10 overflow-y-auto" style={{ background: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl rounded-lg border border-line shadow-2xl" style={{ background: "var(--surface)" }}>
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
            <>
              <Body d={data} projectId={projectId} />
              <div className="flex gap-2 mt-5 pt-4 border-t border-line">
                <a href={`/projects/${projectId}`} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Edit project</a>
                <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Close</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Body({ d, projectId }) {
  const running = daysSince(d.actualStartDate);

  return (
    <div className="space-y-5">
      {/* who and what */}
      <div>
        <p className="text-lg font-semibold text-concrete leading-tight">{d.name}</p>
        <p className="text-xs text-rebar mt-0.5">
          {[d.projectId, d.status, d.gc?.length ? `GC: ${d.gc.join(", ")}` : null].filter(Boolean).join(" · ")}
        </p>
        {!d.relatedBidId && (
          <p className="text-xs text-warn mt-1.5">No bid attached — this project can&apos;t be billed.</p>
        )}
      </div>

      <StagePath status={d.status} projectId={projectId} onChanged={() => window.location.reload()} />

      {/* THE number: is the job beating the bid? */}
      {d.actualLbsPerMH != null && d.estimatedLbsPerMH != null && (
        <div className={`rounded-lg border p-3 ${d.beatingBid ? "border-ok/40 bg-ok/10" : "border-warn/40 bg-warn/10"}`}>
          <p className="text-[11px] uppercase tracking-widest text-rebar mb-1">Productivity vs the bid</p>
          <p className="text-sm text-concrete">
            Running at <span className="font-semibold">{rate(d.actualLbsPerMH)}</span> against a bid of{" "}
            <span className="font-semibold">{rate(d.estimatedLbsPerMH)}</span> —{" "}
            <span className={d.beatingBid ? "text-ok font-medium" : "text-warn font-medium"}>
              {d.beatingBid ? "beating the estimate" : "behind the estimate"}
              {typeof d.productivityDelta === "number" && ` by ${Math.abs(d.productivityDelta).toFixed(0)}%`}
            </span>.
          </p>
        </div>
      )}

      {/* money */}
      <Section title="Contract">
        <Row label="Contract value" value={money(d.contractValue)} lead />
        <Row label="Bid rate" value={typeof d.bidRate === "number" ? `${(d.bidRate * 100).toFixed(2)}¢/lb` : "—"} />
        <Row label="Billed to date" value={money(d.billedToDate)} />
        <Row label="Remaining to bill" value={money(d.remainingToBill)} />
        <Row label="Outstanding" value={money(d.outstanding)} tone={d.outstanding > 0 ? "warn" : null} />
        <Row label="Retention" value={d.retentionEnabled ? `${money(d.retentionHeld)} held (${d.retentionPercent ?? 0}%)` : "not held"} />
      </Section>

      {/* work */}
      <Section title="Progress">
        <Row label="Estimated" value={lbs(d.estimatedLbs)} />
        <Row label="Billed" value={`${lbs(d.billedLbs)}${d.pctComplete != null ? ` · ${d.pctComplete.toFixed(0)}% of the bid` : ""}`} />
        <Row label="Labour hours" value={typeof d.payrollHours === "number" ? `${Math.round(d.payrollHours).toLocaleString()} hrs` : "—"} />
        <Row label="Started" value={running != null ? `${dateStr(d.actualStartDate)} · ${running} days ago` : dateStr(d.actualStartDate)} />
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-rebar mb-1.5">{title}</p>
      <div className="rounded-lg border border-line divide-y divide-line" style={{ background: "var(--surface-2)" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, lead, tone }) {
  return (
    <div className="flex items-baseline justify-between px-3 py-2">
      <span className="text-xs text-rebar">{label}</span>
      <span className={`tabular-nums ${lead ? "text-sm font-semibold text-concrete" : tone === "warn" ? "text-sm text-warn" : "text-sm text-concrete/85"}`}>{value}</span>
    </div>
  );
}
