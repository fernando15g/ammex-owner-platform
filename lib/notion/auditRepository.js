// =============================================================================
// AUDIT LOG — who changed what, when.
//
// Why it had to be built before anything else on the list: you cannot audit
// history you did not record. Every other gap can be filled later with no loss;
// this one is losing data every day it doesn't exist.
//
// DELIBERATE TRADE-OFF: a failed audit write does NOT block the action it was
// recording. The alternative — refusing to let anyone work because Notion
// hiccuped — is worse for a two-person business. The cost is that a rare blip
// could drop a single entry, which is why failures are logged loudly.
//
// The log is APPEND-ONLY. Nothing in the app edits or deletes an entry; that is
// the entire point of it.
// =============================================================================

import { createPage, queryAll, getTitle, getText, getSelect, getDate, fmt } from "@/lib/notion/client";

// Set once the database exists. Falls back to an env var so it can be pointed at
// a new database without a code change.
export const AUDIT_DB = process.env.AUDIT_DB_ID || null;

const P = {
  summary: "Summary",       // title — "Fern updated Bid: Peoria Ave Bridge"
  actor: "Actor",
  action: "Action",         // Create | Update | Delete | Void
  entity: "Entity",         // Bid | Project | Line Item | Invoice | Payment | Change Order
  entityName: "Entity Name",
  entityId: "Entity ID",
  changes: "Changes",       // human-readable: "contract value: 3,000 -> 3,456"
  at: "At",
};

export const AUDIT_ACTIONS = ["Create", "Update", "Delete", "Void"];
export const AUDIT_ENTITIES = ["Bid", "Project", "Line Item", "Invoice", "Payment", "Change Order"];

export function isAuditConfigured() {
  return !!AUDIT_DB;
}

// Turn a before/after pair into something a human can read at a glance.
// Only fields that ACTUALLY changed are recorded — resending an unchanged value
// is not a change, and logging it as one would bury the real edits in noise.
export function describeChanges(before = {}, after = {}) {
  const parts = [];
  for (const key of Object.keys(after)) {
    const b = before?.[key];
    const a = after[key];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    parts.push(`${label(key)}: ${fmtVal(b)} → ${fmtVal(a)}`);
  }
  return parts.join("; ");
}

function label(k) {
  return String(k)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function fmtVal(v) {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

// Append one entry. Never throws — a logging failure must not take down the
// action it was describing.
export async function audit({ actor, action, entity, entityName, entityId, changes, summary }) {
  if (!AUDIT_DB) {
    console.warn("[audit] no audit database configured — entry dropped:", { action, entity, entityName });
    return { ok: false, reason: "not-configured" };
  }
  try {
    const who = actor || "Unknown";
    const title = summary || `${who} ${action.toLowerCase()}d ${entity}: ${entityName || entityId || ""}`.trim();

    await createPage(AUDIT_DB, {
      [P.summary]: fmt.title(title),
      [P.actor]: fmt.richText(who),
      [P.action]: fmt.select(action),
      [P.entity]: fmt.select(entity),
      [P.entityName]: fmt.richText(entityName || ""),
      [P.entityId]: fmt.richText(entityId || ""),
      [P.changes]: fmt.richText(changes || ""),
      [P.at]: fmt.date(new Date().toISOString()),
    });
    return { ok: true };
  } catch (e) {
    // Loud, but non-fatal.
    console.error("[audit] FAILED to record an entry — the action itself still went through:", e.message || e, { action, entity, entityName });
    return { ok: false, reason: String(e.message || e) };
  }
}

// Read the log (newest first) for the History view.
export async function getAuditLog({ limit = 200 } = {}) {
  if (!AUDIT_DB) return [];
  const pages = await queryAll(AUDIT_DB);
  return pages
    .map((pg) => ({
      id: pg.id,
      summary: getTitle(pg, P.summary),
      actor: getText(pg, P.actor),
      action: getSelect(pg, P.action),
      entity: getSelect(pg, P.entity),
      entityName: getText(pg, P.entityName),
      entityId: getText(pg, P.entityId),
      changes: getText(pg, P.changes),
      at: getDate(pg, P.at),
    }))
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, limit);
}
