// GET /api/geo-check?street=...&city=...&state=AZ&zip=...&pin=5314
// Diagnostic only: runs the exact same Census geocode the Home map uses, but
// reports the RAW result so we can see whether an address resolves and whether
// the outbound call from this deployment works at all. Not linked anywhere.
import { NextResponse } from "next/server";
import { buildAddress, geocodeAddress, isGeocodable } from "@/lib/geo/geocode";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("pin") !== "5314") {
    return NextResponse.json({ ok: false, error: "pin required" }, { status: 401 });
  }

  const site = {
    street: searchParams.get("street") || "",
    city: searchParams.get("city") || "",
    state: searchParams.get("state") || "",
    zip: searchParams.get("zip") || "",
  };
  const address = buildAddress(site);
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;

  const out = { ok: true, address, geocodable: isGeocodable(site), url };

  // Raw call — shows the HTTP status, how many matches came back, and the coords.
  // If the outbound call is blocked, fetchError is populated instead.
  try {
    const res = await fetch(url);
    out.httpStatus = res.status;
    const data = await res.json().catch(() => null);
    const matches = data?.result?.addressMatches || [];
    out.matchCount = matches.length;
    out.matchedAddress = matches[0]?.matchedAddress || null;
    out.coordinates = matches[0]?.coordinates || null;
  } catch (e) {
    out.fetchError = String(e.message || e);
  }

  // What the app's own geocode util returns (null = would fall back to shading).
  try { out.appResult = await geocodeAddress(site); } catch (e) { out.appResult = { error: String(e.message || e) }; }

  return NextResponse.json(out);
}
