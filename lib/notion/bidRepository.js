// =============================================================================
// BID REPOSITORY (DAL) — writes bids to the Bid Tracker as a TRACKING record.
// Stores everything needed to track a bid through its lifecycle: metadata, the
// raw estimating inputs, and the money figures. The OS does NOT calculate —
// values are entered/tracked. (A separate estimator tab can be added later.)
// Domain in / domain out; Notion formatting here; Postgres = a second file.
// =============================================================================

import { queryAll, createPage, updatePage, getDate, fmt } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";
import { validateCreate, validateUpdate } from "@/lib/rules/bidSchema";
import { findSoftDuplicate } from "@/lib/rules/writePath";

const P = {
  // metadata
  projectName: "Project Name",
  gc: "GC",
  fabricator: "Fabricator",
  projectType: "Project Type",
  cityCounty: "City/County",
  bidDueDate: "Bid Due Date",
  submissionDate: "Submission Date",
  status: "Bid Status",
  notes: "Notes",
  scope: "Scope",
  // raw estimating inputs (stored, not computed)
  estimatedLbs: "Estimated LBS",
  productivity: "Estimated LBS/MH",
  crewSize: "Estimated Crew Size",
  baseWage: "Base Wage Rate",
  bidRate: "Bid Rate ($/LB)",
  ptSpecialty: "PT/Specialty Revenue",
  // money figures (stored/tracked — entered, not calculated by the OS).
  // Written to the (calc) columns since those are the go-forward money columns.
  operatingProfit: "Operating Profit (calc)",
  operatingMargin: "Operating Margin (calc)", // ratio (0.17 = 17%)
  fullyLoadedCost: "Fully-Loaded Cost (calc)",
  burdenedLaborCost: "Burdened Labor Cost (calc)",
  burdenPct: "Burden/OH % (calc)",
  toolsPct: "Tools % (calc)",
  contingencyPct: "Contingency % (calc)",
  mobilizationHrs: "Mobilization Hrs (calc)",
  targetMarginPct: "Target Margin % (calc)",
};

function toNotionProps(m) {
  const props = {};
  // metadata
  if ("projectName" in m) props[P.projectName] = fmt.title(m.projectName);
  if ("gc" in m) props[P.gc] = fmt.multiSelect(m.gc);
  if ("fabricator" in m) props[P.fabricator] = fmt.multiSelect(m.fabricator);
  if ("projectType" in m) props[P.projectType] = fmt.multiSelect(m.projectType);
  if ("cityCounty" in m) props[P.cityCounty] = fmt.richText(m.cityCounty);
  if ("bidDueDate" in m) props[P.bidDueDate] = fmt.date(m.bidDueDate);
  if ("submissionDate" in m) props[P.submissionDate] = fmt.date(m.submissionDate);
  if ("status" in m) props[P.status] = fmt.status(m.status);
  if ("notes" in m) props[P.notes] = fmt.richText(m.notes);
  if ("scope" in m) props[P.scope] = fmt.richText(m.scope);
  // raw inputs (only write when provided)
  if (m.estimatedLbs != null) props[P.estimatedLbs] = fmt.number(m.estimatedLbs);
  if (m.productivity != null) props[P.productivity] = fmt.number(m.productivity);
  if (m.crewSize != null) props[P.crewSize] = fmt.number(m.crewSize);
  if (m.baseWage != null) props[P.baseWage] = fmt.number(m.baseWage);
  if (m.bidRate != null) props[P.bidRate] = fmt.number(m.bidRate);
  if (m.ptSpecialty != null) props[P.ptSpecialty] = fmt.number(m.ptSpecialty);
  // money (stored as entered; margin is a ratio)
  if (m.operatingProfit != null) props[P.operatingProfit] = fmt.number(m.operatingProfit);
  if (m.operatingMargin != null) props[P.operatingMargin] = fmt.number(m.operatingMargin);
  if (m.fullyLoadedCost != null) props[P.fullyLoadedCost] = fmt.number(m.fullyLoadedCost);
  if (m.burdenedLaborCost != null) props[P.burdenedLaborCost] = fmt.number(m.burdenedLaborCost);
  if (m.burdenPct != null) props[P.burdenPct] = fmt.number(m.burdenPct);
  if (m.toolsPct != null) props[P.toolsPct] = fmt.number(m.toolsPct);
  if (m.contingencyPct != null) props[P.contingencyPct] = fmt.number(m.contingencyPct);
  if (m.mobilizationHrs != null) props[P.mobilizationHrs] = fmt.number(m.mobilizationHrs);
  if (m.targetMarginPct != null) props[P.targetMarginPct] = fmt.number(m.targetMarginPct);
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
