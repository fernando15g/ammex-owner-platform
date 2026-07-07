// =============================================================================
// BID REPOSITORY (DAL) — MINIMAL. Writes bids using ONLY fields the Bid Tracker
// already has. No new Notion properties required — create/edit work now.
// Domain in / domain out; Notion formatting lives here; Postgres migration = a
// second file with the same methods.
//
// Governance fields (bid_number, version, audit, void) intentionally deferred
// until the business needs them (multiple estimators). Easy to add later.
// =============================================================================

import { queryAll, createPage, updatePage, getDate, fmt } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";
import { validateCreate, validateUpdate } from "@/lib/rules/bidSchema";
import { findSoftDuplicate } from "@/lib/rules/writePath";

const P = {
  projectName: "Project Name",
  gc: "GC",
  fabricator: "Fabricator",
  projectType: "Project Type",
  cityCounty: "City/County",
  bidDueDate: "Bid Due Date",
  status: "Bid Status",
  notes: "Notes",
  scope: "Scope",
};

function toNotionProps(m) {
  const props = {};
  if ("projectName" in m) props[P.projectName] = fmt.title(m.projectName);
  if ("gc" in m) props[P.gc] = fmt.multiSelect(m.gc);
  if ("fabricator" in m) props[P.fabricator] = fmt.multiSelect(m.fabricator);
  if ("projectType" in m) props[P.projectType] = fmt.multiSelect(m.projectType);
  if ("cityCounty" in m) props[P.cityCounty] = fmt.richText(m.cityCounty);
  if ("bidDueDate" in m) props[P.bidDueDate] = fmt.date(m.bidDueDate);
  if ("status" in m) props[P.status] = fmt.status(m.status);
  if ("notes" in m) props[P.notes] = fmt.richText(m.notes);
  if ("scope" in m) props[P.scope] = fmt.richText(m.scope);
  return props;
}

async function readExistingLight() {
  const pages = await queryAll(DB.BID_TRACKER);
  return pages.map((pg) => ({
    id: pg.id,
    name: (pg.properties?.[P.projectName]?.title || []).map((t) => t.plain_text).join("").trim(),
    bidDueDate: getDate(pg, P.bidDueDate),
    gc: (pg.properties?.[P.gc]?.multi_select || []).map((o) => o.name),
    isVoided: false,
  }));
}

export async function createBid(metadata) {
  const clean = validateCreate(metadata);
  const existing = await readExistingLight();
  const dup = findSoftDuplicate(clean, existing);
  const page = await createPage(DB.BID_TRACKER, toNotionProps(clean));
  return { id: page.id, softDuplicate: dup ? { id: dup.id, name: dup.name } : null };
}

export async function updateBid(pageId, changes) {
  const clean = validateUpdate(changes);
  await updatePage(pageId, toNotionProps(clean));
  return { id: pageId };
}
