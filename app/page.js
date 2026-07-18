"use client";

// Root is the front door decider — not a page you look at. Reopen the app and
// you land back where you were working, UNLESS it's been a while (you closed it
// and came back a day later), in which case you get Home. Mid-input on Billing
// never gets yanked away; a fresh morning start opens on Home.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const RESUME_HOURS = 6; // within this window, resume your last zone; after it, Home

export default function Root() {
  const router = useRouter();
  useEffect(() => {
    let dest = "/home";
    try {
      const raw = window.localStorage.getItem("ammex-last-page");
      if (raw) {
        const { path, ts } = JSON.parse(raw);
        if (path && path !== "/" && path !== "/home" && Date.now() - ts < RESUME_HOURS * 3600000) dest = path;
      }
    } catch {}
    router.replace(dest);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-rebar" style={{ background: "var(--surface)" }}>
      Loading…
    </div>
  );
}
