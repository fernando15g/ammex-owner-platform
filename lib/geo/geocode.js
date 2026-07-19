// =============================================================================
// GEOCODING — turn a project's site address into coordinates for the Home map.
//
// Two providers, tried in order, both free and key-less:
//   1. US Census — authoritative for addresses it has, but its database lags on
//      new construction (which is a lot of Ammex's work).
//   2. OpenStreetMap / Nominatim — community-updated, usually has new
//      subdivisions and roads the Census hasn't caught up on yet.
//
// Everything fails SAFE: any error, timeout, or non-match returns null, and the
// caller falls back to county shading. A missing pin is never an error — just a
// job we couldn't place precisely. Coordinates are cached back onto the project
// (Site Lat / Site Lng) so a given address is only ever geocoded once.
// =============================================================================

const CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export function buildAddress({ street, city, state, zip } = {}) {
  return [street, city, state, zip].map((p) => (p == null ? "" : String(p).trim())).filter(Boolean).join(", ");
}

// Enough to bother geocoding: a street plus either a city or a zip. A city alone
// would only ever resolve to the middle of town, so we leave those to shading.
export function isGeocodable(site = {}) {
  const street = (site.street || "").trim();
  return !!street && (!!(site.city || "").trim() || !!(site.zip || "").trim());
}

async function fetchJson(url, opts = {}, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function censusGeocode(address) {
  const url = `${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const data = await fetchJson(url);
  const c = data?.result?.addressMatches?.[0]?.coordinates;
  if (!c || typeof c.x !== "number" || typeof c.y !== "number") return null;
  return { lat: c.y, lng: c.x, source: "census" }; // Census: x = lng, y = lat
}

export async function nominatimGeocode(address) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=us`;
  // Nominatim requires an identifying User-Agent; volume here is tiny + cached.
  const data = await fetchJson(url, { headers: { "User-Agent": "AmmexOS/1.0 (rebar owner platform; job map)" } });
  const hit = Array.isArray(data) ? data[0] : null;
  const lat = hit ? Number(hit.lat) : NaN, lng = hit ? Number(hit.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, source: "osm" };
}

export async function geocodeAddress(site = {}) {
  if (!isGeocodable(site)) return null;
  const address = buildAddress(site);
  return (await censusGeocode(address)) || (await nominatimGeocode(address));
}

// Loose place lookup for the map's "search city or ZIP" box — no street needed,
// just get close enough to drop a pin by hand.
export async function searchPlace(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`;
  const data = await fetchJson(url, { headers: { "User-Agent": "AmmexOS/1.0 (rebar owner platform; job map)" } });
  const hit = Array.isArray(data) ? data[0] : null;
  const lat = hit ? Number(hit.lat) : NaN, lng = hit ? Number(hit.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: hit.display_name || q };
}
