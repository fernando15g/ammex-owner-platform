"use client";

// =============================================================================
// APP SHELL — Procore-inspired, desktop-first (spec §16, §17). Left rail on
// desktop, collapses to a top bar on phone. Deliberately few nav items —
// Ammex-simple, not GC-complex. Zones stubbed until built.
// =============================================================================

import { useState } from "react";

const NAV = [
  { key: "home", label: "Home", href: "/", ready: false },
  { key: "pipeline", label: "Pipeline", href: "/pipeline", ready: false },
  { key: "active", label: "Active Work", href: "/active", ready: true },
  { key: "performance", label: "Performance", href: "/performance", ready: false },
  { key: "book", label: "The Book", href: "/book", ready: false },
  { key: "check", label: "System Check", href: "/check", ready: true, minor: true },
];

export default function AppShell({ current, title, subtitle, actions, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:flex">
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
        <header className="h-16 border-b border-line flex items-center gap-3 px-4 lg:px-8 sticky top-0 bg-steel/95 backdrop-blur z-20">
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
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </header>
        <div className="px-4 lg:px-8 py-6">{children}</div>
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
      className={`${base} ${active ? "bg-steel text-concrete font-medium" : "text-rebar hover:text-concrete hover:bg-steel/60"}`}
    >
      <span className="flex-1">{item.label}</span>
    </a>
  );
}
