"use client";

// =============================================================================
// SORTABLE TABLES — one implementation, used by Bids, Active Work and Billing,
// so a column header behaves the same way everywhere.
//
// Click a header to sort by it; click again to reverse. Nulls always sink to the
// bottom regardless of direction — a job with no due date is not "the soonest".
// =============================================================================

import { useState, useMemo, useEffect } from "react";

// `name` gives the table an identity so its sort can be remembered. Session-
// scoped: sorting by Outstanding, going to look at something, and coming back to
// find it reset is a small friction that repeats all day. A fresh visit tomorrow
// starts clean rather than inheriting a choice you've forgotten making.
export function useSort(rows, defaultKey = null, defaultDir = "asc", name = null) {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir });

  useEffect(() => {
    if (!name) return;
    try {
      const saved = sessionStorage.getItem(`ammex-sort-${name}`);
      if (saved) setSort(JSON.parse(saved));
    } catch {}
  }, [name]);

  const toggle = (key) =>
    setSort((s) => {
      const next = s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
      if (name) { try { sessionStorage.setItem(`ammex-sort-${name}`, JSON.stringify(next)); } catch {} }
      return next;
    });

  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = valueOf(a, sort.key);
      const bv = valueOf(b, sort.key);

      // missing values always sink, whichever way we're sorting
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  }, [rows, sort]);

  return { sorted, sort, toggle };
}

// Supports dotted paths ("billing.outstanding") so nested rows can be sorted.
function valueOf(row, key) {
  return key.split(".").reduce((o, k) => (o == null ? o : o[k]), row);
}

// A clickable <th>. `align="right"` for numeric columns.
export function SortHeader({ label, sortKey, sort, toggle, align = "left", className = "" }) {
  const active = sort.key === sortKey;
  const arrow = !active ? "" : sort.dir === "asc" ? "↑" : "↓";
  return (
    <th
      onClick={() => toggle(sortKey)}
      className={`px-3 py-2.5 font-medium cursor-pointer select-none whitespace-nowrap hover:text-concrete ${
        align === "right" ? "text-right" : "text-left"
      } ${active ? "text-concrete" : ""} ${className}`}
      title={`Sort by ${label}`}
    >
      {label}
      <span className={`ml-1 ${active ? "text-safety" : "opacity-0"}`}>{arrow || "↑"}</span>
    </th>
  );
}
