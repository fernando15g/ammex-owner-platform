// =============================================================================
// NOTION CLIENT — the ONLY file in the entire app that talks to Notion.
//
// Architecture rule (build spec §0.2): every screen asks lib/data.js for what
// it needs; lib/data.js uses the rules in lib/rules/*; and only THIS file
// actually calls the Notion API. When Ammex OS migrates to Postgres/Supabase,
// this file (and lib/notion/ids.js) are the only things that get replaced.
// =============================================================================

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

function token() {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new Error("NOTION_TOKEN is not set. Copy .env.local.example to .env.local and add your token.");
  return t;
}

async function notionFetch(path, body) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
    // Dashboard data should be fresh on every load — no caching of stale numbers.
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Notion API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Query EVERY row of a database (handles Notion's 100-row pagination).
// Timesheet will grow into thousands of rows — this walks all pages.
// -----------------------------------------------------------------------------
// READ CACHE — the reason pages took 5-6 seconds at 85 bids.
//
// Every page load fired ~7 Notion queries with cache:"no-store", so navigating
// re-fetched the entire dataset every time; Notion's API costs 300-800ms per
// call and the timesheet table paginates sequentially on top. The data is tiny —
// the round-trips were the whole cost.
//
// This is a short-TTL in-memory cache at the single seam every read flows
// through. ANY write (createPage / updatePage / archivePage) busts the whole
// cache, so after saving something the very next read is fresh from Notion —
// you can never see stale data caused by your own action. The TTL only governs
// how long *unchanged* data is reused between navigations.
//
// Serverless note: the cache lives per warm instance. For this app (one primary
// user) that's effectively one instance; worst case after a write that lands on
// a different instance is one TTL window of staleness, same order as Notion's
// own read lag.
// -----------------------------------------------------------------------------
const READ_TTL_MS = 5 * 60_000; // writes always bust the cache, so long warmth is safe
const _readCache = new Map(); // key -> { at, data }

export function bustNotionReadCache() {
  _readCache.clear();
}

// Bust only ONE database's cached reads, leaving every other table warm. Used by
// the bids page: bids can be written by the estimator app behind the OS's back,
// so bids must read live — but projects/billing/timecards are only written
// THROUGH the OS (which already busts on write), so they can stay cached and
// keep the page fast.
export function bustNotionReadCacheFor(databaseId) {
  for (const key of _readCache.keys()) {
    if (key.startsWith(`q:${databaseId}:`)) _readCache.delete(key);
  }
}

async function cachedRead(key, fetcher) {
  const hit = _readCache.get(key);
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.data;
  const data = await fetcher();
  _readCache.set(key, { at: Date.now(), data });
  return data;
}

export async function queryAll(databaseId, filter) {
  const key = `q:${databaseId}:${filter ? JSON.stringify(filter) : ""}`;
  return cachedRead(key, async () => {
    const rows = [];
    let cursor = undefined;
    do {
      const body = { page_size: 100 };
      if (filter) body.filter = filter;
      if (cursor) body.start_cursor = cursor;
      const data = await notionFetch(`/databases/${databaseId}/query`, body);
      rows.push(...(data.results || []));
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
    return rows;
  });
}

// Cheapest possible "did anything change?" probe: the single most-recently-edited
// row's timestamp. One row, not the whole table — far lighter than queryAll.
export async function newestEditedTime(databaseId) {
  const data = await notionFetch(`/databases/${databaseId}/query`, {
    page_size: 1,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
  });
  return data.results?.[0]?.last_edited_time ?? null;
}

// Per-database "high water mark" of the newest edit we've already reflected.
const _freshMark = new Map();

// Bust a database's cache ONLY if it has changed since we last looked. Lets the
// bids page stay cached (instant) on normal visits and refetch live only when a
// bid was actually written — by the OS or the estimator app. Returns true if it
// busted (i.e. something changed).
export async function freshBustIfChanged(databaseId) {
  try {
    const newest = await newestEditedTime(databaseId);
    const seen = _freshMark.get(databaseId);
    if (newest && newest !== seen) {
      _freshMark.set(databaseId, newest);
      bustNotionReadCacheFor(databaseId);
      return true;
    }
    return false;
  } catch {
    // If the probe fails, fall back to a live read (safe: bust so we refetch).
    bustNotionReadCacheFor(databaseId);
    return true;
  }
}

// Lightweight "can we see this DB at all" check — used by the system-check page.
export async function probeDatabase(databaseId) {
  const data = await notionFetch(`/databases/${databaseId}/query`, { page_size: 1 });
  return { ok: true, hasRows: (data.results || []).length > 0 };
}

// -----------------------------------------------------------------------------
// Property extractors — Notion pages store values in nested, type-tagged
// objects. These helpers pull plain JS values out so the rest of the app
// never sees Notion's shapes. All return null/[]/false when empty.
// -----------------------------------------------------------------------------

function prop(page, name) {
  return page?.properties?.[name] ?? null;
}

export function getNumber(page, name) {
  const p = prop(page, name);
  return p && typeof p.number === "number" ? p.number : null;
}

export function getTitle(page, name) {
  const p = prop(page, name);
  const arr = p?.title || [];
  return arr.map((t) => t.plain_text).join("").trim() || null;
}

export function getText(page, name) {
  const p = prop(page, name);
  const arr = p?.rich_text || [];
  return arr.map((t) => t.plain_text).join("").trim() || null;
}

export function getSelect(page, name) {
  const p = prop(page, name);
  return p?.select?.name ?? null;
}

export function getStatus(page, name) {
  const p = prop(page, name);
  return p?.status?.name ?? null;
}

export function getMultiSelect(page, name) {
  const p = prop(page, name);
  return (p?.multi_select || []).map((o) => o.name);
}

export function getDate(page, name) {
  const p = prop(page, name);
  return p?.date?.start ?? null;
}

export function getCheckbox(page, name) {
  const p = prop(page, name);
  return p?.checkbox === true;
}

export function getRelationIds(page, name) {
  const p = prop(page, name);
  return (p?.relation || []).map((r) => r.id);
}

// Notion formula results come back typed; we only ever read number formulas.
export function getFormulaNumber(page, name) {
  const p = prop(page, name);
  if (p?.formula?.type === "number" && typeof p.formula.number === "number") return p.formula.number;
  return null;
}

// Rollup number (e.g. Projects' "Estimated LBS" rolled up from the bid).
export function getRollupNumber(page, name) {
  const p = prop(page, name);
  if (p?.rollup?.type === "number" && typeof p.rollup.number === "number") return p.rollup.number;
  return null;
}

// Page-level last edit — used for the placement freshness stamp (spec §5.3).
export function lastEdited(page) {
  return page?.last_edited_time ?? null;
}

export function pageId(page) {
  return page?.id ?? null;
}

// =============================================================================
// WRITE METHODS — the ONLY place that turns domain writes into Notion API calls.
// Everything above the DAL speaks domain; property formatting lives here.
// When migrating to Postgres, this section is replaced, nothing above it.
// =============================================================================

async function notionWrite(path, body, method = "PATCH") {
  bustNotionReadCache(); // a write invalidates every cached read — next read is fresh
  // Notion's own reads lag ~1s behind accepted writes. A fetch fired in that
  // window returns PRE-write data — and would cache it for the whole TTL.
  // The second bust clears any such stale snapshot once Notion is consistent.
  setTimeout(bustNotionReadCache, 1600);
  const res = await fetch(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Notion write ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// Create a page in a database. propertiesObj is already Notion-formatted.
export async function createPage(databaseId, propertiesObj) {
  return notionWrite("/pages", { parent: { database_id: databaseId }, properties: propertiesObj }, "POST");
}

// Update a page's properties. propertiesObj is already Notion-formatted.
export async function updatePage(pageId, propertiesObj) {
  return notionWrite(`/pages/${pageId}`, { properties: propertiesObj }, "PATCH");
}

// Archive (soft-delete) a page — it moves to Notion's trash and is recoverable.
// We never hard-purge: deleted records stay recoverable if a mistake is made.
export async function archivePage(pageId) {
  return notionWrite(`/pages/${pageId}`, { archived: true }, "PATCH");
}

// Create a database under a parent PAGE. Used once, to stand up the audit log
// without making Fern build it by hand.
export async function createDatabase({ parentPageId, title, properties }) {
  const res = await fetch(`${NOTION_API}/databases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: title } }],
      properties,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion createDatabase ${res.status}: ${body}`);
  }
  return res.json();
}

// Read a database's SCHEMA — its property definitions, including the option
// lists behind every select / multi-select. Retires with this file on migration:
// in Postgres these become real lookup tables.
export async function getDatabaseSchema(databaseId, { fresh = false } = {}) {
  // fresh=true bypasses the cache — required after option renames/deletes, since
  // a warm schema cache on another serverless instance can otherwise serve a
  // stale option list for up to a full TTL window (minutes, not the ~1s lag).
  if (fresh) {
    const data = await _getDatabaseSchemaRaw(databaseId);
    _readCache.set(`schema:${databaseId}`, { at: Date.now(), data });
    return data;
  }
  return cachedRead(`schema:${databaseId}`, () => _getDatabaseSchemaRaw(databaseId));
}
async function _getDatabaseSchemaRaw(databaseId) {
  const res = await fetch(`${NOTION_API}/databases/${databaseId}`, {
    headers: { Authorization: `Bearer ${token()}`, "Notion-Version": NOTION_VERSION },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Notion getDatabaseSchema ${res.status}`);
  return res.json();
}

// Rename or delete a select/multi-select OPTION at the schema level. Notion
// cascades a rename to every record automatically (options are referenced by id).
// Deleting removes it as a choice. This edits DATABASE STRUCTURE — callers must
// guard it (confirm + usage count).
export async function updateSelectOption(databaseId, propName, { action, optionId, newName }) {
  const schema = await _getDatabaseSchemaRaw(databaseId);
  const prop = schema.properties?.[propName];
  if (!prop) throw new Error(`Property not found: ${propName}`);
  const kind = prop.multi_select ? "multi_select" : prop.select ? "select" : null;
  if (!kind) throw new Error(`${propName} is not a select/multi-select`);
  const current = prop[kind].options || [];
  const found = current.find((o) => o.id === optionId);
  if (!found) throw new Error("That option no longer exists — reload and try again.");
  let next;
  if (action === "rename") {
    if (!newName || !newName.trim()) throw new Error("New name is required");
    const clean = newName.replace(/,/g, "").replace(/\s+/g, " ").trim();
    // Reference every kept option by id ONLY (preserves it unchanged); the one
    // being renamed carries id + new name. Notion matches on id and applies the
    // rename; sending name on unchanged options can make Notion mis-handle them.
    next = current.map((o) => (o.id === optionId ? { id: o.id, name: clean } : { id: o.id }));
  } else if (action === "delete") {
    // Omitting an option from the array deletes it; keep the rest by id only.
    next = current.filter((o) => o.id !== optionId).map((o) => ({ id: o.id }));
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
  const payload = { properties: { [propName]: { [kind]: { options: next } } } };
  const res = await fetch(`${NOTION_API}/databases/${databaseId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token()}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Notion updateSelectOption ${res.status}: ${t.slice(0, 200)}`);
  }
  const result = await res.json();
  bustNotionReadCache();

  // Verify Notion actually applied it (it can return 200 without applying option
  // changes). Read the option list back and confirm.
  const after = (result?.properties?.[propName]?.[kind]?.options) || [];
  if (action === "rename") {
    const cleanExpected = newName.replace(/,/g, "").replace(/\s+/g, " ").trim();
    const ok = after.some((o) => o.id === optionId && o.name === cleanExpected);
    if (!ok) throw new Error("Notion accepted the request but the rename didn't apply. This can happen with option edits — please rename it directly in Notion for now.");
  } else if (action === "delete") {
    const stillThere = after.some((o) => o.id === optionId);
    if (stillThere) throw new Error("Notion accepted the request but the option is still there. Please delete it directly in Notion for now.");
  }
  return result;
}

export async function getSelectOptionsWithIds(databaseId, propName) {
  const schema = await _getDatabaseSchemaRaw(databaseId); // always fresh — used by the option manager
  const prop = schema.properties?.[propName];
  const kind = prop?.multi_select ? "multi_select" : prop?.select ? "select" : null;
  if (!kind) return [];
  return (prop[kind].options || []).map((o) => ({ id: o.id, name: o.name }));
}

// Read a single page (used for the optimistic version check before an update).
export async function getPage(pageId) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    headers: { Authorization: `Bearer ${token()}`, "Notion-Version": NOTION_VERSION },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Notion getPage ${res.status}`);
  return res.json();
}

// ---- Notion property FORMATTERS (domain value → Notion property shape) -------
export const fmt = {
  title: (s) => ({ title: [{ text: { content: s ?? "" } }] }),
  richText: (s) => {
    if (!s) return { rich_text: [] };
    const str = String(s);
    const chunks = [];
    for (let i = 0; i < str.length; i += 1900) chunks.push({ text: { content: str.slice(i, i + 1900) } });
    return { rich_text: chunks };
  },
  number: (n) => ({ number: typeof n === "number" ? n : null }),
  checkbox: (b) => ({ checkbox: !!b }),
  select: (name) => ({ select: name ? { name } : null }),
  status: (name) => ({ status: name ? { name } : null }),
  multiSelect: (arr) => ({ multi_select: (arr || []).map((name) => ({ name })) }),
  date: (iso) => ({ date: iso ? { start: iso } : null }),
};
