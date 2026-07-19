"use client";

// The lock screen. Enter the PIN once; the browser remembers for a year.
import { useState } from "react";

export default function GatePage() {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  function unlock(e) {
    e?.preventDefault();
    if (!pin.trim()) return;
    document.cookie = `ammex-gate=${encodeURIComponent(pin.trim())}; path=/; max-age=31536000; SameSite=Lax`;
    const from = new URLSearchParams(window.location.search).get("from") || "/";
    // A wrong PIN just bounces back here — show a hint when that happens.
    setErr(true);
    window.location.href = from;
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--surface, #1c2127)" }}>
      <form onSubmit={unlock} className="w-full max-w-xs text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-safety" />
          <span className="font-semibold tracking-tight text-concrete text-lg">AMMEX<span className="text-rebar font-normal"> OS</span></span>
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(false); }}
          placeholder="PIN"
          className="w-full text-center text-lg tracking-widest px-3 py-2.5 rounded-md border border-line bg-transparent text-concrete placeholder:text-rebar/50 focus:outline-none focus:border-rebar"
        />
        {err && <p className="text-xs text-danger mt-2">If you land back here, the PIN wasn&apos;t right.</p>}
        <button type="submit" className="mt-4 w-full text-sm px-4 py-2.5 rounded-md bg-safety text-steel font-medium">Unlock</button>
      </form>
    </div>
  );
}
