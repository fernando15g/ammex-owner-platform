// =============================================================================
// BILLING REPOSITORY (DAL) — the only Notion-touching code for billing.
// Reads/writes Billing Events; reads project billing settings. Domain in/out.
// Postgres migration = a second file with the same functions.
// =============================================================================

import { queryAll, createPage, updatePage, getTitle, getText, getNumber, getDate, getSelect, getRelationIds, pageId, fmt } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";
import { nextIds, ID_PREFIX } from "@/lib/rules/appIds";

const P = {
  eventId: "Event ID",          // application-owned identity (survives a DB swap)
  eventName: "Event Name",
  project: "Project",
  type: "Type",
  invoiceNumber: "Invoice Number",
  amount: "Amount",
  retentionWithheld: "Retention Withheld",
  date: "Date",
  dueDate: "Due Date",
  pounds: "Pounds",
  notes: "Notes",
};

export function mapBillingEvent(page) {
  return {
    eventId: getText(page, P.eventId) || null,
    id: pageId(page),
    name: getTitle(page, P.eventName),
    projectId: getRelationIds(page, P.project)[0] || null,
    type: getSelect(page, P.type),
    invoiceNumber: getText(page, P.invoiceNumber),
    amount: getNumber(page, P.amount),
    retentionWithheld: getNumber(page, P.retentionWithheld),
    date: getDate(page, P.date),
    dueDate: getDate(page, P.dueDate),
    pounds: getNumber(page, P.pounds),
    notes: getText(page, P.notes),
  };
}

export async function getAllBillingEvents() {
  const pages = await queryAll(DB.BILLING_EVENTS);
  return pages.map(mapBillingEvent);
}

// Generate the next invoice number for a project: {ProjectID}-INV-{N}, where N
// counts existing BILL events on that project + 1. e.g. "26-18-INV-3".
// Reads live events at generation time so it doesn't skip or collide.
export async function nextInvoiceNumber(projectId, projectIdLabel) {
  const events = await getAllBillingEvents();
  const bills = events.filter((e) => e.projectId === projectId && e.type === "Bill");
  // Highest existing N for this project (parse the trailing -N), else count.
  let maxN = 0;
  for (const b of bills) {
    const m = (b.invoiceNumber || "").match(/-INV-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > maxN) maxN = n; }
  }
  const n = Math.max(maxN, bills.length) + 1;
  const label = projectIdLabel || "NOID";
  return `${label}-INV-${n}`;
}

// Group events by projectId for the hub join.
export function groupEventsByProject(events) {
  const m = new Map();
  for (const e of events) {
    if (!e.projectId) continue;
    if (!m.has(e.projectId)) m.set(e.projectId, []);
    m.get(e.projectId).push(e);
  }
  return m;
}

function toProps(e) {
  const props = {};
  if ("name" in e) props[P.eventName] = fmt.title(e.name || labelFor(e));
  if ("projectId" in e && e.projectId) props[P.project] = { relation: [{ id: e.projectId }] };
  if ("type" in e) props[P.type] = fmt.select(e.type);
  if ("eventId" in e && e.eventId) props[P.eventId] = fmt.richText(e.eventId);
  if ("invoiceNumber" in e) props[P.invoiceNumber] = fmt.richText(e.invoiceNumber);
  if ("amount" in e) props[P.amount] = fmt.number(e.amount);
  if ("retentionWithheld" in e) props[P.retentionWithheld] = fmt.number(e.retentionWithheld);
  if ("date" in e) props[P.date] = fmt.date(e.date);
  if ("dueDate" in e) props[P.dueDate] = fmt.date(e.dueDate);
  if ("pounds" in e) props[P.pounds] = fmt.number(e.pounds);
  if ("notes" in e) props[P.notes] = fmt.richText(e.notes);
  return props;
}

function labelFor(e) {
  const d = e.date ? new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  return `${e.type || "Event"}${d ? " " + d : ""}`;
}

export async function createBillingEvent(event) {
  const page = await createPage(DB.BILLING_EVENTS, toProps(event));
  return { id: page.id };
}

export async function updateBillingEvent(eventId, changes) {
  await updatePage(eventId, toProps(changes));
  return { id: eventId };
}

// Update a project's billing settings (contract value + retention).
const PROJ = {
  billingContractValue: "Billing Contract Value",
  retentionEnabled: "Retention Enabled",
  retentionPercent: "Retention Percent",
  retentionFlatAmount: "Retention Flat Amount",
  installedPounds: "Rebar Placed To-Date",
};
export async function updateProjectBilling(projectId, s) {
  const props = {};
  // Contract override: null/blank clears it (revert to auto-from-line-items).
  if ("billingContractValue" in s) props[PROJ.billingContractValue] = fmt.number(s.billingContractValue);
  if ("retentionEnabled" in s) props[PROJ.retentionEnabled] = fmt.checkbox(s.retentionEnabled);
  if ("retentionPercent" in s) props[PROJ.retentionPercent] = fmt.number(s.retentionPercent);
  if ("retentionFlatAmount" in s) props[PROJ.retentionFlatAmount] = fmt.number(s.retentionFlatAmount);
  // Override reason: persisted only if a matching text property exists in Notion
  // (graceful — skipped otherwise). Property name: "Contract Override Reason".
  if ("contractOverrideReason" in s && s.contractOverrideReason) {
    try { props["Contract Override Reason"] = fmt.richText(s.contractOverrideReason); } catch {}
  }
  await updatePage(projectId, props);
  return { id: projectId };
}


// --- application-owned identity ----------------------------------------------
export async function allocateEventIds(count = 1) {
  const all = await getAllBillingEvents();
  const existing = all.map((e) => e.eventId).filter(Boolean);
  return nextIds(ID_PREFIX.EVENT, existing, count);
}
