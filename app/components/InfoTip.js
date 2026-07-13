"use client";

// A short explanation attached to a metric. Tap-friendly as well as hover:
// hover-only tooltips are unreachable on a phone or a tablet in the truck.

import { useState, useEffect, useRef } from "react";

export default function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-rebar/50 hover:text-rebar transition-colors"
        aria-label={text}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <span
          className="absolute z-40 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-52 rounded-md border border-line px-2.5 py-1.5 text-[11px] leading-snug text-concrete/90 shadow-xl normal-case tracking-normal font-normal"
          style={{ background: "var(--surface-2)" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
