"use client";

// =============================================================================
// APP SHELL — Procore-inspired, desktop-first (spec §16, §17). Left rail on
// desktop, collapses to a top bar on phone. Deliberately few nav items —
// Ammex-simple, not GC-complex. Zones stubbed until built.
// =============================================================================

import { useState, useEffect } from "react";
import IdentityGate from "@/app/components/IdentityGate";

const NAV = [
  { key: "home", label: "Home", href: "/", ready: false },
  { key: "pipeline", label: "Bids", href: "/pipeline", ready: true },
  { key: "active", label: "Active Work", href: "/active", ready: true },
  { key: "billing", label: "Billing", href: "/billing", ready: true },
  { key: "performance", label: "Performance", href: "/performance", ready: true },
  { key: "book", label: "The Book", href: "/book", ready: true },
  { key: "history", label: "History", href: "/history", ready: true },
  { key: "check", label: "System Check", href: "/check", ready: true, minor: true },
];

function useTheme() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("ammex-theme") : null;
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
  return { theme, toggle };
}

// BREADCRUMBS — where you ARE, not how you got here.
//
// Deliberately structural, the way every serious CRM does it (Salesforce, Jira,
// Procore). History-based trails make the same page look different depending on
// the route in, so you can never learn the interface — the signpost keeps moving.
//
// The BACK ARROW is the exception, and it's a different job: it returns you to
// wherever you actually came from. Two controls, two purposes. That's what stops
// you getting stranded when you reach a project from Active Work and the only
// link out goes to Billing, a page you were never on.
function Breadcrumbs({ trail }) {
  if (!trail?.length) return null;

  const goBack = () => {
    // real back where there IS a history entry; the parent crumb otherwise (a
    // fresh tab, a shared link) so the arrow is never a dead end.
    const parent = trail.length > 1 ? trail[trail.length - 2]?.href : trail[0]?.href;
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else if (parent) window.location.href = parent;
  };

  return (
    <nav className="flex items-center gap-1.5 flex-wrap text-xs leading-none" aria-label="Breadcrumb">
      <button
        onClick={goBack}
        className="text-rebar hover:text-concrete inline-flex items-center"
        title="Back to where you came from"
        aria-label="Back"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>

      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {last || !c.href ? (
              <span className="font-semibold uppercase tracking-widest text-rebar/80">{c.label}</span>
            ) : (
              <a href={c.href} className="font-semibold uppercase tracking-widest text-rebar hover:text-concrete underline-offset-2 hover:underline">
                {c.label}
              </a>
            )}
            {!last && <span className="text-rebar/40">›</span>}
          </span>
        );
      })}
    </nav>
  );
}

export default function AppShell({ current, title, subtitle, breadcrumbs, actions, children }) {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-screen lg:flex">
      <IdentityGate />
      {/* Left rail (desktop) / drawer (mobile) */}
      <aside
        className={`${open ? "block" : "hidden"} lg:block fixed lg:static inset-0 z-40 lg:z-auto lg:w-60 shrink-0 border-r border-line bg-graphite`}
      >
        <div className="flex items-center gap-2 px-5 h-16 border-b border-line">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-safety" />
          <span className="font-semibold tracking-tight text-concrete">AMMEX<span className="text-rebar font-normal"> OS</span></span>
        </div>
        <nav className="p-3 space-y-0.5">
          {NAV.filter((n) => !n.minor).map((n) => (
            <NavItem key={n.key} item={n} active={n.key === current} />
          ))}
          <div className="pt-3 mt-3 border-t border-line">
            {NAV.filter((n) => n.minor).map((n) => (
              <NavItem key={n.key} item={n} active={n.key === current} />
            ))}
          </div>
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main column */}
      <div className="flex-1 min-w-0">
        <header className="h-16 border-b border-line flex items-center gap-3 px-4 lg:px-8 sticky top-0 z-20" style={{ background: "var(--surface)" }}>
          <button
            className="lg:hidden -ml-1 p-2 text-rebar"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="min-w-0">
            {subtitle && <p className="text-[11px] uppercase tracking-widest text-rebar leading-none mb-1">{subtitle}</p>}
            <h1 className="text-lg font-semibold text-concrete leading-none truncate">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {actions}
            <button
              onClick={toggle}
              aria-label="Toggle light/dark"
              title={theme === "light" ? "Switch to dark" : "Switch to light"}
              className="p-2 rounded-md border border-line text-rebar hover:text-concrete"
            >
              {theme === "light" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
              )}
            </button>
          </div>
        </header>
        <div className="px-4 lg:px-8 py-6">
          {breadcrumbs?.length > 0 && <div className="mb-4"><Breadcrumbs trail={breadcrumbs} /></div>}
          {children}
        </div>
      </div>
    </div>
  );
}

function NavItem({ item, active }) {
  const base = "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors";
  if (!item.ready) {
    return (
      <div className={`${base} text-rebar/50 cursor-default`}>
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] uppercase tracking-wider text-rebar/40">soon</span>
      </div>
    );
  }
  return (
    <a
      href={item.href}
      className={`${base} ${active ? "text-concrete font-medium" : "text-rebar hover:text-concrete"}`}
      style={active ? { background: "var(--surface-2)" } : undefined}
    >
      <span className="flex-1">{item.label}</span>
    </a>
  );
}
