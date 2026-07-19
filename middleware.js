// =============================================================================
// ACCESS GATE — a shared PIN in front of the whole OS (pages AND api routes).
// This is a light lock for a private internal tool, not real authentication:
// one PIN, remembered per browser for a year. When real login exists, this
// retires. The PIN lives in an env var with a fallback so deploys work today.
// =============================================================================
import { NextResponse } from "next/server";

const PIN = process.env.AMMEX_PIN || "5314";
const COOKIE = "ammex-gate";

export function middleware(req) {
  const { pathname, searchParams } = req.nextUrl;

  // The gate page itself, and Next internals/static assets, pass through.
  if (pathname === "/gate" || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  // Already unlocked in this browser.
  if (req.cookies.get(COOKIE)?.value === PIN) return NextResponse.next();

  // ?pin=5314 on any URL unlocks too (handy for the diagnostic endpoints).
  if (searchParams.get("pin") === PIN) {
    const res = NextResponse.next();
    res.cookies.set(COOKIE, PIN, { path: "/", maxAge: 31536000, sameSite: "lax" });
    return res;
  }

  // API calls get a clean 401 instead of an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "locked — open the app and enter the PIN" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
