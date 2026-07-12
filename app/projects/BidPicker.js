"use client";

// =============================================================================
// ATTACH A BID — a searchable picker, not a dropdown.
//
// The old control was a plain <select> listing every bid ever created. With
// dozens of them, most showing no name at all (a field-name bug), it was
// unusable for the one thing it exists to do: find the right bid.
//
// This matters more than it looks. A project gets its LINE ITEMS through the
// attached bid, and line items are where CONTRACT VALUE comes from. Attach the
// wrong bid — or none — and every billing number on that project is wrong.
// =============================================================================

import { useState, useMemo, useRef, useEffect } from "react";

const money = (n) =>
  typeof n === "number" ? `$${Math.round(n).toLocaleString()}` : null;
const lbs = (n) =>
  typeof n === "number" ? `${Math.round(n).toLocaleString()} lbs` : null;

export default function BidPicker({ bids = [], value, onChange, autoFocus = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef(null);

  const selected = bids.find((b) => b.id === value) || null;

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return bids.slice(0, 50);
    return bids
      .filter((b) => `${b.name || ""} ${(b.gc || []).join(" ")} ${b.status || ""}`.toLowerCase().includes(needle))
      .slice(0, 50);
  }, [bids, q]);

  // click outside closes
  useEffect(() => {
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (b) => { onChange(b ? b.id : ""); setOpen(false); setQ(""); };

  return (
    <div className="relative" ref={box}>
      {/* what's currently attached */}
      {selected && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full text-left inp flex items-center gap-2"
        >
          <span className="text-concrete truncate">{selected.name || "Untitled bid"}</span>
          {selected.gc?.length > 0 && <span className="text-xs text-rebar shrink-0">· {selected.gc.join(", ")}</span>}
          <span className="ml-auto text-xs text-rebar shrink-0">change</span>
        </button>
      ) : (
        <input
          autoFocus={autoFocus || open}
          className="inp"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          placeholder={selected ? selected.name : "Search bids by name or GC…"}
        />
      )}

      {open && (
        <div
          className="absolute z-30 mt-1 w-full rounded-lg border border-line shadow-xl overflow-y-auto"
          style={{ background: "var(--surface)", maxHeight: "16rem" }}
        >
          <button
            type="button"
            onMouseDown={() => pick(null)}
            className="w-full text-left px-3 py-2 text-sm text-rebar hover:bg-graphite/60 border-b border-line"
          >
            — no bid attached —
          </button>

          {matches.map((b) => (
            <button
              key={b.id}
              type="button"
              onMouseDown={() => pick(b)}
              className={`w-full text-left px-3 py-2.5 hover:bg-graphite/60 border-b border-line last:border-b-0 ${
                b.id === value ? "bg-graphite/40" : ""
              }`}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-concrete truncate">{b.name || "Untitled bid"}</span>
                {b.status === "Awarded" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-ok/40 text-ok shrink-0">Awarded</span>
                )}
              </div>
              <div className="text-xs text-rebar mt-0.5 truncate">
                {[
                  b.gc?.length ? b.gc.join(", ") : null,
                  b.status !== "Awarded" ? b.status : null,
                  money(b.contractValue),
                  lbs(b.estimatedLbs),
                ].filter(Boolean).join(" · ") || "no details"}
              </div>
            </button>
          ))}

          {matches.length === 0 && (
            <p className="px-3 py-4 text-sm text-rebar text-center">No bids match &ldquo;{q}&rdquo;.</p>
          )}
        </div>
      )}
    </div>
  );
}
