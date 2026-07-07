"use client";
import { useState, useEffect } from "react";

// Small standalone theme toggle for pages not wrapped in AppShell (e.g. /check).
export default function CheckThemeToggle() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const saved = window.localStorage.getItem("ammex-theme");
    const initial = saved === "dark" || saved === "light" ? saved : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { window.localStorage.setItem("ammex-theme", next); } catch {}
  };
  return (
    <button onClick={toggle} aria-label="Toggle light/dark" className="p-2 rounded-md border border-line text-rebar hover:text-concrete">
      {theme === "light" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      )}
    </button>
  );
}
