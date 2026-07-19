"use client";

// =============================================================================
// ADDRESS AUTOCOMPLETE (Photon / OpenStreetMap) — type-ahead on the street field.
// Free, no key. Picking a suggestion fills street/city/state/ZIP and the pin
// coordinates in one shot. It's a HELPER, never a gate: if nothing matches (new
// construction), you just keep typing and it still saves. OSM data, so it has
// the same good new-address coverage that resolved the Surprise jobsite.
// =============================================================================

import { useState, useEffect, useRef } from "react";

export default function AddressAutocomplete({ value, onType, onPick, placeholder }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const timer = useRef(null);
  const skipNext = useRef(false);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function handleType(v) {
    onType(v);
    if (skipNext.current) { skipNext.current = false; return; } // a pick just set this
    clearTimeout(timer.current);
    if (!v || v.trim().length < 4) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(() => fetchSuggestions(v.trim()), 300);
  }

  async function fetchSuggestions(q) {
    try {
      const url = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=6&lat=33.5&lon=-112.0`;
      const res = await fetch(url);
      const data = await res.json();
      const feats = (data?.features || []).filter((f) => f.properties?.countrycode === "US");
      setResults(feats);
      setOpen(feats.length > 0);
      setActive(-1);
    } catch { setResults([]); setOpen(false); }
  }

  function pick(feat) {
    const p = feat.properties || {};
    const coords = feat.geometry?.coordinates || [];
    const street = [p.housenumber, p.street].filter(Boolean).join(" ") || p.name || "";
    const city = p.city || p.town || p.village || p.locality || "";
    const state = /arizona/i.test(p.state || "") ? "AZ" : (p.state || "");
    const zip = p.postcode || "";
    skipNext.current = true;
    onPick({ street, city, state, zip, lat: coords[1], lng: coords[0] });
    setOpen(false); setResults([]);
  }

  function label(feat) {
    const p = feat.properties || {};
    const line1 = [p.housenumber, p.street].filter(Boolean).join(" ") || p.name || "";
    const line2 = [p.city || p.town || p.village, p.state, p.postcode].filter(Boolean).join(", ");
    return { line1, line2 };
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        className="inp w-full"
        value={value}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(results[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder || "Street (e.g. 1200 E Washington St)"}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-md border border-line overflow-hidden" style={{ background: "var(--surface-2)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
          {results.map((f, i) => {
            const { line1, line2 } = label(f);
            return (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(f); }}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-2 ${active === i ? "bg-graphite" : ""}`}
              >
                <div className="text-sm text-concrete truncate">{line1 || line2}</div>
                {line1 && line2 && <div className="text-[11px] text-rebar truncate">{line2}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
