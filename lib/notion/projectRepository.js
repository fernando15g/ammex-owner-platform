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

// Suggest the next Project ID by following whatever pattern is already in use
// (e.g. "26-04" -> "26-05"). We do NOT invent a convention: if the existing IDs
// don't share a trailing number, we suggest nothing and let the person type it.
export async function suggestProjectId() {
  const pages = await queryAll(DB.PROJECTS);
  const ids = pages
    .map((pg) => {
      const rt = pg.properties?.[P.projectId]?.rich_text?.[0]?.plain_text;
      return rt ? String(rt).trim() : null;
    })
    .filter(Boolean);

  // find IDs shaped like <prefix><number> and bump the highest
  const parsed = ids
    .map((id) => {
      const m = id.match(/^(.*?)(\d+)$/);
      return m ? { prefix: m[1], num: Number(m[2]), width: m[2].length, raw: id } : null;
    })
    .filter(Boolean);

  if (!parsed.length) return null;

  // group by prefix, take the most common one, bump its max
  const byPrefix = new Map();
  for (const p of parsed) {
    if (!byPrefix.has(p.prefix)) byPrefix.set(p.prefix, []);
    byPrefix.get(p.prefix).push(p);
  }
  const [prefix, group] = [...byPrefix.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const max = group.reduce((m, p) => Math.max(m, p.num), 0);
  const width = group[0].width;
  return `${prefix}${String(max + 1).padStart(width, "0")}`;
}

export async function getProjectPage(projectId) {
  return getPage(projectId);
}
