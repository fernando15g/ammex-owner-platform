// =============================================================================
// APPLICATION-OWNED IDs
//
// The problem this solves: Notion page IDs were the identity of everything, and
// the [snap] record inside every invoice used them as its foreign keys to line
// items. On a database swap every one of those becomes a dead reference — and
// you'd be rebuilding MONEY RECORDS against an old-ID→new-ID mapping table.
// That is exactly where migrations go wrong.
//
// So: every line item and billing event gets an ID the application owns. It is
// written into Notion (Line ID / Event ID), it means the same thing in Postgres,
// and it does not care what database it lives in. Snapshots reference these.
//
// Format is deliberately human-readable so a money record can be debugged by eye:
//   LI-000042   a line item
//   EV-000117   a billing event (invoice, payment, or change order)
// =============================================================================

export const ID_PREFIX = { LINE: "LI", EVENT: "EV" };
const WIDTH = 6;

export function formatId(prefix, n) {
  return `${prefix}-${String(n).padStart(WIDTH, "0")}`;
}

export function parseId(id) {
  const m = String(id || "").match(/^([A-Z]{2})-(\d+)$/);
  return m ? { prefix: m[1], num: Number(m[2]) } : null;
}

// Next ID for a prefix, given everything that already exists. Pure — the caller
// supplies the existing IDs, so this is testable and has no Notion in it.
export function nextId(prefix, existingIds = []) {
  const max = existingIds.reduce((m, id) => {
    const p = parseId(id);
    return p && p.prefix === prefix ? Math.max(m, p.num) : m;
  }, 0);
  return formatId(prefix, max + 1);
}

// Allocate a run of new IDs at once (creating a bid sheet writes many lines).
export function nextIds(prefix, existingIds = [], count = 1) {
  const start = (parseId(nextId(prefix, existingIds)) || { num: 1 }).num;
  return Array.from({ length: count }, (_, i) => formatId(prefix, start + i));
}

// -----------------------------------------------------------------------------
// RESOLVING A SNAPSHOT REFERENCE
// -----------------------------------------------------------------------------
// Snapshots written from now on carry `lid` (the app-owned Line ID). Snapshots
// written BEFORE this change carry only `id` (a Notion page id). Both must keep
// working — the backfill adds `lid` to the old ones, but we never assume it ran.
//
// This is the ONE place that understands the difference. When Notion is gone,
// the `id` fallback can be deleted and nothing else changes.
export function resolveLine(ref, lines) {
  if (!ref) return null;
  if (ref.lid) {
    const byAppId = lines.find((l) => l.lineId === ref.lid);
    if (byAppId) return byAppId;
  }
  if (ref.id) {
    const byPage = lines.find((l) => l.id === ref.id);
    if (byPage) return byPage;
  }
  return null;
}

// Build a snapshot reference for a line. Always writes BOTH: the app ID is the
// real key, the page id stays as a bridge until the backfill has swept through.
export function lineRef(line, extra = {}) {
  return { lid: line.lineId || null, id: line.id, ...extra };
}
