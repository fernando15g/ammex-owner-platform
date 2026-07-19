// GET /api/geo-check?street=...&city=...&state=AZ&zip=...&pin=5314
// Diagnostic only: runs the exact same Census geocode the Home map uses, but
// reports the RAW result so we can see whether an address resolves and whether
// the outbound call from this deployment works at all. Not linked anywhere.
import { NextResponse } from "next/server";
import { buildAddress, geocodeAddress, censusGeocode, nominatimGeocode, isGeocodable } from "@/lib/geo/geocode";

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
  const out = { ok: true, address, geocodable: isGeocodable(site) };

  try { out.census = await censusGeocode(address); } catch (e) { out.census = { error: String(e.message || e) }; }
  try { out.osm = await nominatimGeocode(address); } catch (e) { out.osm = { error: String(e.message || e) }; }
  try { out.final = await geocodeAddress(site); } catch (e) { out.final = { error: String(e.message || e) }; }

  return NextResponse.json(out);
}
