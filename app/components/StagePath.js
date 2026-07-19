"use client";

// =============================================================================
// STAGE PATH — the project's lifecycle, as a thing you can see and click.
//
// Four stages, driven by PHASE (not raw status): Awarded -> Active -> Billing ->
// Closed. Mobilizing and Punchlist are still real statuses — they just read as
// "Active" here (same running phase), so the chevron stays a clean four-step
// story while the underlying state machine is untouched. Each stage maps to the
// canonical status it sets when clicked; finer statuses live in the project form.
//
// Bidding and Paid are deliberately absent. Bidding belongs to the BID, not the
// project. Paid is a billing fact the billing page tracks properly.
// =============================================================================

import { useState } from "react";
import { phaseOf } from "@/lib/rules/phase";

export const STAGES = [
  { label: "Awarded", status: "Awarded", phase: "backlog" },
  { label: "Active", status: "Active", phase: "running" },
  { label: "Billing", status: "Waiting on billing", phase: "billing" },
  { label: "Closed", status: "Closed", phase: "complete" },
];

export default function StagePath({ status, projectId, onChanged, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const currentPhase = phaseOf(status);
  const current = STAGES.findIndex((s) => s.phase === currentPhase);

  async function moveTo(stage, index) {
    if (busy || stage.status === status) return;

    // Moving BACKWARDS is nearly always a mistake — a job doesn't un-happen.
    if (current >= 0 && index < current) {
      const ok = window.confirm(`Move this job back to ${stage.label}?\n\nIt's currently ${status}.`);
      if (!ok) return;
    }

    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: { status: stage.status } }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      onChanged?.(stage.status);
    } catch (e) {
      setErr(String(e.message || e));
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "" : "mb-4"}>
      <div className="flex items-stretch overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {STAGES.map((stage, i) => {
          const done = current >= 0 && i < current;
          const isNow = i === current;

          // one chevron shape, two clipped layers (outer outline + inner fill),
          // so every segment reads as the same shape filled or not.
          const chevron =
            i === 0
              ? "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)"
              : i === STAGES.length - 1
              ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)"
              : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)";

          return (
            <button
              key={stage.label}
              onClick={() => moveTo(stage, i)}
              disabled={busy}
              title={busy ? "Saving…" : `Move to ${stage.label}`}
              className={[
                "group relative flex flex-1 min-w-0 whitespace-nowrap transition-colors disabled:opacity-60 p-px",
                i === 0 ? "rounded-l-md" : "",
                i === STAGES.length - 1 ? "rounded-r-md" : "",
                done ? "bg-ok/40 hover:bg-ok/50" : isNow ? "bg-safety" : "bg-line hover:bg-rebar/60",
              ].join(" ")}
              style={{ clipPath: chevron, marginLeft: i === 0 ? 0 : -1 }}
            >
              <span
                className={[
                  "flex flex-1 items-center justify-center transition-colors",
                  compact ? "text-[11px] px-2.5 py-1.5" : "text-xs px-3 py-2",
                  done ? "bg-ok/25 text-ok group-hover:bg-ok/35" : isNow ? "bg-safety text-steel font-semibold" : "bg-graphite/40 text-rebar group-hover:text-concrete group-hover:bg-graphite/70",
                ].join(" ")}
                style={{ clipPath: chevron }}
              >
                <span className="block truncate">{stage.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {status && current < 0 && (
        <p className="text-[11px] text-rebar mt-1.5">
          Currently <span className="text-concrete">{status}</span> — outside the normal lifecycle. Pick a stage to bring it back in.
        </p>
      )}
      {err && <p className="text-[11px] text-danger mt-1.5">{err}</p>}
    </div>
  );
}
