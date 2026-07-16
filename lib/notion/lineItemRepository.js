// =============================================================================
// LINE ITEMS REPOSITORY (DAL) — the only Notion-touching code for line items.
// The line item is the atom of a project's money: born on the bid sheet
// (proposal), lives through billing (qty-to-date). Postgres-swappable.
// =============================================================================

import { queryAll, createPage, updatePage, getTitle, getText, getNumber, getSelect, getRelationIds, pageId, fmt } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";
import { nextIds, ID_PREFIX } from "@/lib/rules/appIds";

const P = {
  lineId: "Line ID",            // application-owned identity (survives a DB swap)
  description: "Description",
  itemNo: "Item No",
  bid: "Bid",
  project: "Project",
  quantity: "Quantity",
  unit: "Unit",
  unitPrice: "Unit Price",
  furnInst: "Furn/Inst",
  lineType: "Line Type",
  billingBasis: "Billing Basis",   // "Quantity" (default/blank) or "Hours"
  hoursWorked: "Hours Worked",     // hourly-CO input
  rate: "Rate",                    // hourly-CO $/hr
  status: "Status",
  qtyToDate: "Qty To Date",
  notes: "Notes",
};

export const LINE_STATUS = { PROPOSED: "Proposed", ACTIVE: "Active", CLOSED: "Closed" };
export const LINE_TYPES = ["Standard", "CO", "PA", "SE", "PC"];
export const FURN_INST = ["Furnish", "Install", "Furnish+Install"];

export function mapLineItem(page) {
  return {
    lineId: getText(page, P.lineId) || null,
    id: pageId(page),
    description: getTitle(page, P.description),
    itemNo: getText(page, P.itemNo),
    bidId: getRelationIds(page, P.bid)[0] || null,
    projectId: getRelationIds(page, P.project)[0] || null,
    quantity: getNumber(page, P.quantity),
    // Unit is now a Select (was rich_text). getSelect reads the chosen option;
    // fall back to getText so any legacy text-typed rows still resolve.
    unit: getSelect(page, P.unit) || getText(page, P.unit) || null,
    unitPrice: getNumber(page, P.unitPrice),
    furnInst: getSelect(page, P.furnInst),
    lineType: getSelect(page, P.lineType),
    // blank Billing Basis == "Quantity" (the normal weight/price path). Only
    // hourly change orders set "Hours".
    billingBasis: getSelect(page, P.billingBasis) || "Quantity",
    hoursWorked: getNumber(page, P.hoursWorked),
    rate: getNumber(page, P.rate),
    status: getSelect(page, P.status),
    qtyToDate: getNumber(page, P.qtyToDate),
    notes: getText(page, P.notes),
  };
}

export async function getAllLineItems() {
  const pages = await queryAll(DB.LINE_ITEMS);
  return pages.map(mapLineItem);
}

function toProps(li) {
  const props = {};
  if ("description" in li) props[P.description] = fmt.title(li.description || "");
  if ("itemNo" in li) props[P.itemNo] = fmt.richText(li.itemNo);
  if ("bidId" in li && li.bidId) props[P.bid] = { relation: [{ id: li.bidId }] };
  if ("projectId" in li && li.projectId) props[P.project] = { relation: [{ id: li.projectId }] };
  if ("quantity" in li) props[P.quantity] = fmt.number(li.quantity);
  // Unit is a Select now — write it as one. Skip blanks so we never write an
  // empty option (Notion rejects that).
  if ("unit" in li && li.unit) props[P.unit] = fmt.select(li.unit);
  if ("unitPrice" in li) props[P.unitPrice] = fmt.number(li.unitPrice);
  if ("furnInst" in li) props[P.furnInst] = fmt.select(li.furnInst);
  if ("lineId" in li && li.lineId) props[P.lineId] = fmt.richText(li.lineId);
  if ("lineType" in li) props[P.lineType] = fmt.select(li.lineType);
  if ("billingBasis" in li && li.billingBasis) props[P.billingBasis] = fmt.select(li.billingBasis);
  if ("hoursWorked" in li) props[P.hoursWorked] = fmt.number(li.hoursWorked);
  if ("rate" in li) props[P.rate] = fmt.number(li.rate);
  if ("status" in li) props[P.status] = fmt.select(li.status);
  if ("qtyToDate" in li) props[P.qtyToDate] = fmt.number(li.qtyToDate);
  if ("notes" in li) props[P.notes] = fmt.richText(li.notes);
  return props;
}

export async function createLineItem(li) {
  if (!li.lineId) {
    const [id] = await allocateLineIds(1);
    li = { ...li, lineId: id };
  }
  const page = await createPage(DB.LINE_ITEMS, toProps(li));
  return { id: page.id, lineId: li.lineId };
}

export async function updateLineItem(id, changes) {
  await updatePage(id, toProps(changes));
  return { id };
}

// Close all line items for a bid (bid lost/no-bid) — never billable.
// Only touches Proposed/Active lines; skips already-Closed.
export async function closeLineItemsForBid(bidId) {
  const all = await getAllLineItems();
  const toClose = all.filter((li) => li.bidId === bidId && li.status !== "Closed");
  for (const li of toClose) await updateLineItem(li.id, { status: "Closed" });
  return { closed: toClose.length };
}

// Activate a bid's line items (bid awarded) — Proposed -> Active.
export async function activateLineItemsForBid(bidId) {
  const all = await getAllLineItems();
  const toActivate = all.filter((li) => li.bidId === bidId && li.status === "Proposed");
  for (const li of toActivate) await updateLineItem(li.id, { status: "Active" });
  return { activated: toActivate.length };
}


// --- application-owned identity ----------------------------------------------
// Allocate Line IDs in one shot (a bid sheet creates many rows at once).
export async function allocateLineIds(count = 1) {
  const all = await getAllLineItems();
  const existing = all.map((l) => l.lineId).filter(Boolean);
  return nextIds(ID_PREFIX.LINE, existing, count);
}
