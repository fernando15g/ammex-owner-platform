// GET /api/geo-reverse?lat=..&lng=.. — a dropped pin -> address parts, used to
// prefill the empty site fields when you place a pin by hand. Fails safe (null).
import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/geo/geocode";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  let result = null;
  try { result = await reverseGeocode({ lat: Number(sp.get("lat")), lng: Number(sp.get("lng")) }); } catch {}
  return NextResponse.json({ ok: true, result });
}
