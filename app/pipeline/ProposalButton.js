"use client";

// DOWNLOAD PROPOSAL
//
// Blue on purpose: "Save sheet" is amber (the primary action), and this is a
// different kind of thing — a document going out, not a record being kept.
//
// Downloading the proposal IS the act of submitting the bid — it's the file that
// gets emailed. So it offers to record that. But it ASKS rather than assuming:
// you might pull it down to proofread, and a false submission date on a bid is
// worse than no date at all, because dates on bids are evidence.

import { useState } from "react";

export default function ProposalButton({ bidId, bidName, status, submissionDate, compact = false }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Already submitted (or further along)? Then there's nothing to record, and
  // nagging about it every download would just train you to dismiss it.
  const alreadySent = !!submissionDate || !["Need Weights", "Reviewing", "Estimating", "Contingent"].includes(status);

  function download() {
    window.location.href = `/api/bids/${bidId}/proposal`;
    if (!alreadySent) setTimeout(() => setAsking(true), 800);
  }

  async function markSubmitted() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bids/${bidId}/submitted`, { method: "POST" });
      const d = await res.json();
      if (d.ok) { setDone(true); setTimeout(() => window.location.reload(), 900); }
    } catch {}
    setBusy(false);
  }

  return (
    <>
      <button
        onClick={download}
        className={`text-sm rounded-md font-medium border border-info/50 text-info hover:bg-info/10 ${compact ? "px-3 py-1.5" : "px-4 py-2"}`}
        title="Downloads the proposal as the Ammex Excel template — send it, or export a PDF from Excel"
      >
        Download proposal
      </button>

      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="w-full max-w-md rounded-lg border border-line p-5 shadow-2xl" style={{ background: "var(--surface)" }}>
            {done ? (
              <p className="text-sm text-ok">Marked as submitted.</p>
            ) : (
              <>
                <p className="text-base font-semibold text-concrete mb-1">Proposal downloaded.</p>
                <p className="text-xs text-rebar mb-4">
                  Sending it out? That makes <span className="text-concrete">{bidName}</span> a submitted bid —
                  dated today, and moved to Submitted.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={markSubmitted}
                    disabled={busy}
                    className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40"
                  >
                    {busy ? "Saving…" : "Yes, mark it submitted"}
                  </button>
                  <button
                    onClick={() => setAsking(false)}
                    className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete"
                  >
                    Not yet
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
