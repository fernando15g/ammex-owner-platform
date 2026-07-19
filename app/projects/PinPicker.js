"use client";

// =============================================================================
// PIN PICKER — a small interactive map for placing a jobsite pin by hand, for
// the addresses geocoding can't nail (new construction) or when you want the pin
// exactly on the pour. Click or drag to set; search a city/ZIP to zoom in.
//
// Leaflet is imported lazily inside the effect so it only loads when the map is
// actually opened, and never runs on the server. Free OpenStreetMap tiles, no
// key. Placing a pin here marks the project's coordinates as manually set.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const PHX = [33.448, -112.074]; // sensible AZ default when there's nothing to center on

export default function PinPicker({ lat, lng, onPick }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const LRef = useRef(null);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const hasPin = typeof lat === "number" && typeof lng === "number";
      const map = L.map(elRef.current).setView(hasPin ? [lat, lng] : PHX, hasPin ? 16 : 9);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      if (hasPin) setMarker([lat, lng], false);
      map.on("click", (e) => setMarker([e.latlng.lat, e.latlng.lng], true));
      setTimeout(() => map.invalidateSize(), 80); // tiles render right when opened in a collapsed box
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setMarker([la, ln], fire) {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    if (!markerRef.current) {
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:16px;height:16px;border-radius:50%;background:#ff6a13;border:2px solid #fff;box-shadow:0 0 0 1px #1c2127"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      });
      markerRef.current = L.marker([la, ln], { draggable: true, icon }).addTo(map);
      markerRef.current.on("dragend", () => { const p = markerRef.current.getLatLng(); onPick({ lat: p.lat, lng: p.lng }); });
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
    if (fire) onPick({ lat: la, lng: ln });
  }

  async function search() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const d = await fetch(`/api/geo-search?q=${encodeURIComponent(q)}`).then((r) => r.json());
      if (d?.result && mapRef.current) mapRef.current.setView([d.result.lat, d.result.lng], 14);
    } catch {}
    setSearching(false);
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          className="inp flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }}
          placeholder="Search a city or ZIP to zoom in"
        />
        <button type="button" onClick={search} disabled={searching} className="text-xs px-3 rounded border border-line text-rebar hover:text-concrete disabled:opacity-40">{searching ? "…" : "Search"}</button>
      </div>
      <div ref={elRef} style={{ height: 300, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line, #39414c)" }} />
      <p className="text-[11px] text-rebar mt-1.5">Click the map or drag the pin onto the exact jobsite. A hand-placed pin overrides the address and won&apos;t be moved by auto-geocoding.</p>
    </div>
  );
}
