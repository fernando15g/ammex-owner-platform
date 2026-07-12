// =============================================================================
// PROJECT REPOSITORY (DAL)
//
// Projects could previously only be created, renamed or deleted in Notion. That
// made Notion a required admin tool for anyone running the business — fine for
// Fern, useless for the person actually doing the billing, and impossible once
// the backend moves off Notion. This closes that.
//
// Domain in / domain out. Notion formatting lives here and nowhere else.
// =============================================================================

import { queryAll, createPage, updatePage, archivePage, getPage, fmt } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";

const P = {
  name: "Actual Project Name",
  projectId: "Project ID",
  status: "Project Status",
  actualStartDate: "Actual Start Date",
  foreman: "Foreman",
  relatedBid: "Related Bid",
  placedLbs: "Rebar Placed To-Date",
  payrollHours: "Labor Hours To-Date",
};

// The Project Status vocabulary (source of truth for job phase — see rules/phase).
export const PROJECT_STATUSES = [
  "Bidding", "Awarded", "Mobilizing", "Active",
  "Punchlist", "Waiting on billing", "Closed", "Paid",
];

function toProps(p) {
  const props = {};
  if ("name" in p) props[P.name] = fmt.title(p.name);
  if ("projectId" in p) props[P.projectId] = fmt.richText(p.projectId);
  if ("status" in p) props[P.status] = fmt.status(p.status);
  if ("actualStartDate" in p) props[P.actualStartDate] = fmt.date(p.actualStartDate);
  if ("foreman" in p) props[P.foreman] = fmt.multiSelect(p.foreman);
  if ("relatedBidId" in p) {
    props[P.relatedBid] = { relation: p.relatedBidId ? [{ id: p.relatedBidId }] : [] };
  }
  if ("placedLbs" in p) props[P.placedLbs] = fmt.number(p.placedLbs);
  if ("payrollHours" in p) props[P.payrollHours] = fmt.number(p.payrollHours);
  return props;
}

export async function createProject(p) {
  if (!p.name) throw new Error("A project needs a name.");
  const page = await createPage(DB.PROJECTS, toProps({ status: "Awarded", ...p }));
  return { id: page.id };
}

export async function updateProject(projectId, changes) {
  await updatePage(projectId, toProps(changes));
  return { id: projectId };
}

// Archive, never purge — recoverable from Notion's trash today, a deleted_at
// column later.
export async function archiveProject(projectId) {
  await archivePage(projectId);
  return { id: projectId, archived: true };
}

// Suggest the next Project ID — YEAR-AWARE.
//
// The old version just bumped the highest number it found: 26-12 -> 26-13. On
// January 1st it would have cheerfully suggested 26-14 instead of 27-01, and
// nobody would have noticed until the numbering was already wrong.
//
// So: find the sequence WITHIN the current year and continue that. A new year
// starts a new sequence. If the year has no projects yet, it starts at 01.
export function nextProjectId(existingIds, now = new Date()) {
  const yy = String(now.getFullYear()).slice(-2);

  // ids shaped <yy>-<n>, e.g. 26-12
  const thisYear = existingIds
    .map((id) => {
      const m = String(id || "").trim().match(/^(\d{2})-(\d+)$/);
      return m ? { yy: m[1], num: Number(m[2]), width: m[2].length } : null;
    })
    .filter((x) => x && x.yy === yy);

  if (thisYear.length === 0) return `${yy}-01`;   // first project of the year

  const max = thisYear.reduce((m, x) => Math.max(m, x.num), 0);
  const width = Math.max(2, thisYear[0].width);
  return `${yy}-${String(max + 1).padStart(width, "0")}`;
}

export async function suggestProjectId() {
  const pages = await queryAll(DB.PROJECTS);
  const ids = pages
    .map((pg) => pg.properties?.[P.projectId]?.rich_text?.[0]?.plain_text)
    .filter(Boolean)
    .map((s) => String(s).trim());
  return nextProjectId(ids);
}

export async function getProjectPage(projectId) {
  return getPage(projectId);
}
