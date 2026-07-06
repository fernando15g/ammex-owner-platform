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
export async function queryAll(databaseId, filter) {
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
