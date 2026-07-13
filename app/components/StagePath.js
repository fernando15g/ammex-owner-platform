"use client";

// =============================================================================
// STAGE PATH — the project's lifecycle, as a thing you can see and click.
//
// Status used to be a dropdown buried three screens deep: Active Work -> billing
// -> Project details -> Edit -> project page -> save. Six steps to change the
// field you change most often, on every single job. Backwards.
//
// A project's status IS its state machine — it drives what shows up where. So it
// gets a first-class control: where the job is, and one click to move it.
//
// Bidding and Paid are deliberately absent. Bidding belongs to the BID, not the
// project (a project only exists once you've won it). Paid is a billing fact,
// and the billing page already tracks it properly — putting it here would just
// be a second, worse version of the truth.
// =============================================================================

import { useState } from "react";

export const STAGES = [
  "Awarded",
  "Mobilizing",
  "Active",
  "Punchlist",
  "Waiting on billing",
  "Closed",
];

const SHORT = {
  "Waiting on billing": "Billing",
};

export default function StagePath({ status, projectId, onChanged, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const current = STAGES.indexOf(status);

  async function moveTo(stage, index) {
    if (busy || stage === status) return;

    // Moving BACKWARDS is nearly always a mistake — a job doesn't un-happen.
    // Forward moves are the normal flow and shouldn't nag.
    if (current >= 0 && index < current) {
      const ok = window.confirm(`Move this job back to ${stage}?\n\nIt's currently ${status}.`);
      if (!ok) return;
    }

    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: { status: stage } }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      onChanged?.(stage);
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
          const label = compact ? (SHORT[stage] || stage) : stage;

          return (
            <button
              key={stage}
              onClick={() => moveTo(stage, i)}
              disabled={busy}
              title={busy ? "Saving…" : `Move to ${stage}`}
              className={[
                "relative flex-1 min-w-0 whitespace-nowrap transition-colors disabled:opacity-60",
                compact ? "text-[11px] px-2.5 py-1.5" : "text-xs px-3 py-2",
                i === 0 ? "rounded-l-md" : "",
                i === STAGES.length - 1 ? "rounded-r-md" : "",
                // every segment carries a border, so an un-selected stage reads
                // as a clickable section rather than floating words
                "border",
                done ? "bg-ok/25 border-ok/40 text-ok hover:bg-ok/35"
                  : isNow ? "bg-safety border-safety text-steel font-semibold"
                  : "bg-graphite/40 border-line text-rebar hover:text-concrete hover:bg-graphite/70 hover:border-rebar/50",
              ].join(" ")}
              style={{
                // chevron: point into the next segment, notch out of the previous
                clipPath:
                  i === 0
                    ? "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)"
                    : i === STAGES.length - 1
                    ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%)"
                    : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)",
                marginLeft: i === 0 ? 0 : -1,
              }}
            >
              <span className="block truncate">{label}</span>
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
