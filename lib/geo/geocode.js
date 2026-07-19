// =============================================================================
// GEOCODING — turn a project's site address into coordinates for the Home map.
//
// Uses the U.S. Census geocoder: free, no API key, U.S.-only (perfect — Ammex is
// Arizona). Everything here fails SAFE: any error, timeout, or non-match returns
// null, and the caller falls back to county shading. A missing pin is never an
// error — it's just a job we couldn't place precisely.
//
// Coordinates are meant to be cached back onto the project (Site Lat / Site Lng)
// so a given address is only ever geocoded once.
// =============================================================================

const ENDPOINT = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

export function buildAddress({ street, city, state, zip } = {}) {
  const parts = [street, city, state, zip].map((p) => (p == null ? "" : String(p).trim())).filter(Boolean);
  return parts.join(", ");
}

// Enough to bother geocoding: a street plus either a city or a zip. A city alone
// would only ever resolve to the middle of town, so we leave those to shading.
export function isGeocodable(site = {}) {
  const street = (site.street || "").trim();
  const city = (site.city || "").trim();
  const zip = (site.zip || "").trim();
  return !!street && (!!city || !!zip);
}

export async function geocodeAddress(site = {}) {
  if (!isGeocodable(site)) return null;
  const address = buildAddress(site);
  const url = `${ENDPOINT}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0]?.coordinates;
    if (!match || typeof match.x !== "number" || typeof match.y !== "number") return null;
    return { lat: match.y, lng: match.x }; // Census returns x = lng, y = lat
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
