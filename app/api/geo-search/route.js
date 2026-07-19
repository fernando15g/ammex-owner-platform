// GET /api/geo-search?q=Surprise AZ — loose place lookup for the map's search
// box, so you can zoom the pin-drop map to the right area. Fails safe (null).
import { NextResponse } from "next/server";
import { searchPlace } from "@/lib/geo/geocode";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const q = new URL(req.url).searchParams.get("q") || "";
  let result = null;
  try { result = await searchPlace(q); } catch {}
  return NextResponse.json({ ok: true, result });
}
