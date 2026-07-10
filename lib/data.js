// =============================================================================
// DATA LAYER — the single public API for the entire app (build spec §0.2).
//
// Screens import from THIS file only. This file orchestrates:
//   lib/notion/*  → raw reads (the only Notion-touching code)
//   lib/rules/*   → the documented business rules (coalesce, guards, phases,
//                   weighted pipeline, capacity)
// and returns clean domain objects — no Notion shapes leak upward.
// =============================================================================

import { queryAll, probeDatabase, getTitle, getText, getNumber, getDate, getStatus, getSelect, getCheckbox, getMultiSelect, getRelationIds, getRollupNumber, lastEdited, pageId } from "@/lib/notion/client";
import { DB, DB_LABELS } from "@/lib/notion/ids";
import { mapBid } from "@/lib/rules/money";
import { mapTimecard, summarizeTimesheet, actualHoursForProject } from "@/lib/rules/hours";
import { phaseOf, PHASE, isMobilizing } from "@/lib/rules/phase";
import { pipelineTotals, confidenceOf, isInFlight } from "@/lib/rules/pipeline";
import { demandHours, supplyHours, computeCapacity, CAPACITY_DEFAULTS } from "@/lib/rules/capacity";
import { makeFinancials, makeProductionEntry, makeInvoice, makePayment } from "@/lib/rules/entities";
import { computeBurn, burnSortValue } from "@/lib/rules/burn";

// ---------------------------------------------------------------------------
// Project mapper — raw Notion page → domain object (money comes via the bid).
// ---------------------------------------------------------------------------
function mapProject(page) {
  const relatedBidIds = getRelationIds(page, "Related Bid");
  return {
    id: pageId(page),
    name: getTitle(page, "Actual Project Name"),
    projectId: getText(page, "Project ID"),
    status: getStatus(page, "Project Status"),
    phase: phaseOf(getStatus(page, "Project Status")),
    isMobilizing: isMobilizing(getStatus(page, "Project Status")),
    placedLbs: getNumber(page, "Rebar Placed To-Date"),
    payrollHours: getNumber(page, "Labor Hours To-Date"), // payroll-era manual number
    actualStartDate: getDate(page, "Actual Start Date"),
    foreman: getMultiSelect(page, "Foreman"),
    retentionOutstanding: getNumber(page, "Retention Outstanding "), // note trailing space in Notion field name
    // billing settings (new)
    billingContractValue: getNumber(page, "Billing Contract Value"),
    retentionEnabled: getCheckbox(page, "Retention Enabled"),
    retentionPercent: getNumber(page, "Retention Percent"),
    retentionFlatAmount: getNumber(page, "Retention Flat Amount"),
    relatedBidId: relatedBidIds[0] || null,
    relatedBidIds, // multi-bid flag: >1 means sum + flag, never silently pick one
    lastEditedAt: lastEdited(page), // freshness stamp for placement (§5.3)
    // convenience rollups (operational only — money always via the bid)
    estimatedLbsRollup: getRollupNumber(page, "Estimated LBS"),
  };
}

function mapCrewMember(page) {
  return {
    id: pageId(page),
    name: getTitle(page, "Name"),
    role: getText(page, "Role"),
    active: getCheckbox(page, "Active"),
    relationshipType: getSelect(page, "Relationship Type"),
  };
}

// Field labor = Active AND role is Rodbuster or Foreman (owner decision, §3.3).
function isFieldLabor(m) {
  const role = (m.role || "").toLowerCase();
  return m.active && (role.includes("rodbuster") || role.includes("foreman"));
}

function mapRecLogEntry(page) {
  return {
    id: pageId(page),
    worker: getTitle(page, "Worker"),
    status: getSelect(page, "Status"),
    kind: getSelect(page, "Kind"),
    date: getDate(page, "Date"),
  };
}

// ---------------------------------------------------------------------------
// getEverything() — one fetch pass over all needed DBs, joined in memory.
// Zones consume slices of this. (When data grows, this is where per-zone
// queries get optimized — behind the same interface.)
// ---------------------------------------------------------------------------
export async function getEverything() {
  const [bidPages, projectPages, crewPages, timecardPages, recPages] = await Promise.all([
    queryAll(DB.BID_TRACKER),
    queryAll(DB.PROJECTS),
    queryAll(DB.CREW_ROSTER),
    queryAll(DB.TIMESHEET),
    queryAll(DB.REC_LOG),
  ]);

  const bids = bidPages.map(mapBid);
  const bidsById = new Map(bids.map((b) => [b.id, b]));
  const projects = projectPages.map(mapProject);
  const crew = crewPages.map(mapCrewMember);
  const timecards = timecardPages.map(mapTimecard);
  const recLog = recPages.map(mapRecLogEntry);

  // --- hours: one summary pass, then resolve per project (era + guards) ---
  const tsSummary = summarizeTimesheet(timecards);

  // Group time entries by project (the Project is the hub — everything hangs off it).
  const timecardsByProject = new Map();
  for (const c of timecards) {
    if (!c.projectId) continue;
    if (!timecardsByProject.has(c.projectId)) timecardsByProject.set(c.projectId, []);
    timecardsByProject.get(c.projectId).push(c);
  }

  for (const p of projects) {
    // --- attach the entity collections that hang off this Project ---
    p.bid = p.relatedBidId ? bidsById.get(p.relatedBidId) || null : null;
    p.multiBid = p.relatedBidIds.length > 1;
    p.timecards = timecardsByProject.get(p.id) || [];
    p.production = []; // admin-authored Production log — no data yet (spec §15)
    p.invoices = [];   // Project Financials module — no data yet
    p.payments = [];   // Project Financials module — no data yet

    // --- hours (era detection + guards) ---
    const entry = tsSummary.perProject.get(p.id);
    p.hours = actualHoursForProject(entry, p.payrollHours);

    // --- the four distinct pounds figures + financials (spec §15) ---
    const contractLbs = p.bid?.estimatedLbs ?? p.estimatedLbsRollup ?? null;
    p.awardedLbs = typeof contractLbs === "number" ? contractLbs : null;
    p.financials = makeFinancials({
      contractLbs,
      contractRate: p.bid?.bidRate ?? null,
      contractValue: p.bid?.contractValue ?? null,
      installedLbs: p.placedLbs, // live today (Rebar Placed To-Date)
      billableLbs: null,         // no data yet — approved-to-invoice
      billedLbs: null,           // no data yet — needs Invoices
      paidAmount: null,          // no data yet — needs Payments
      retentionOutstanding: p.retentionOutstanding ?? null,
    });

    // placement progress (guarded — never divide by zero/blank)
    p.placedFraction =
      typeof p.placedLbs === "number" && typeof p.awardedLbs === "number" && p.awardedLbs > 0
        ? p.placedLbs / p.awardedLbs
        : null;
    p.remainingTons =
      typeof p.awardedLbs === "number"
        ? Math.max(p.awardedLbs - (p.placedLbs || 0), 0) / 2000
        : null;
  }

  // --- weighted pipeline ---
  const pipeline = pipelineTotals(bids);

  // --- capacity (reservoir) ---
  const headcount = crew.filter(isFieldLabor).length;
  const running = projects.filter((p) => p.phase === PHASE.RUNNING);
  const backlog = projects.filter((p) => p.phase === PHASE.BACKLOG);

  const committedInputs = [
    ...running.map((p) => ({ tons: p.remainingTons, productivity: p.bid?.productivity ?? null })),
    ...backlog.map((p) => ({
      tons: typeof p.awardedLbs === "number" ? p.awardedLbs / 2000 : null,
      productivity: p.bid?.productivity ?? null,
    })),
  ];
  const committedDemand = demandHours(committedInputs);

  // expected tier = committed + confidence-weighted in-flight pipeline
  const weightedPipelineInputs = bids
    .filter(isInFlight)
    .map((b) => ({
      tons: typeof b.tons === "number" ? b.tons * confidenceOf(b.status) : null,
      productivity: b.productivity,
    }));
  const expectedDemand = demandHours([...committedInputs, ...weightedPipelineInputs]);

  // blended productivity for the tons conversion: average of bids that have it
  const prods = bids.map((b) => b.productivity).filter((x) => typeof x === "number" && x > 0);
  const blendedProductivity = prods.length ? prods.reduce((a, b) => a + b, 0) / prods.length : null;

  const supply = supplyHours({
    headcount,
    realizedHoursPerDay: tsSummary.realizedHoursPerDay,
    daysPerWeek: CAPACITY_DEFAULTS.daysPerWeek,
    horizonWeeks: CAPACITY_DEFAULTS.horizonWeeks,
    overtimeHoursPerDay: CAPACITY_DEFAULTS.overtimeHoursPerDay,
  });

  const capacity = computeCapacity({ committedDemand, expectedDemand, supply, blendedProductivity });
  capacity.headcount = headcount;
  capacity.realizedHoursPerDay = tsSummary.realizedHoursPerDay;
  capacity.horizonWeeks = CAPACITY_DEFAULTS.horizonWeeks;

  // --- data health (feeds Home's health strip) ---
  // PRINCIPLE: live state comes from an entity's OWN fields, never from the
  // Rec Log. The Rec Log is an event/audit history ("what happened") and can
  // lag reality — it's for displaying history only, not for computing truth.
  // So "held timecards" reads the Timecards' own Under Review checkbox.
  const health = {
    unassignedHours: tsSummary.unassigned.hours,
    unassignedRows: tsSummary.unassigned.rows,
    heldTimecards: tsSummary.underReviewRows, // authoritative: Under Review && !Voided on the timecard
    heldHours: tsSummary.underReviewTotal,
    awardedBidsNoProject: bids.filter((b) => b.status === "Awarded" && b.projectIds.length === 0).length,
    bidsMissingInputs: bids.filter(
      (b) => isInFlight(b) && b.status !== "Need Weights" && (b.estimatedLbs == null || b.bidRate == null)
    ).length,
  };

  return { bids, projects, crew, timecards, recLog, pipeline, capacity, health, tsSummary };
}

// ---------------------------------------------------------------------------
// getSystemCheck() — used by the first page we ship: proves the token works,
// every DB is readable, and the core computed numbers resolve on REAL data.
// ---------------------------------------------------------------------------
export async function getSystemCheck() {
  const dbChecks = [];
  for (const key of Object.keys(DB)) {
    try {
      await probeDatabase(DB[key]);
      dbChecks.push({ key, label: DB_LABELS[key], ok: true });
    } catch (e) {
      dbChecks.push({ key, label: DB_LABELS[key], ok: false, error: String(e.message || e) });
    }
  }

  const allOk = dbChecks.every((c) => c.ok);
  if (!allOk) return { dbChecks, computed: null };

  const data = await getEverything();

  const runningCount = data.projects.filter((p) => p.phase === PHASE.RUNNING).length;
  const backlogCount = data.projects.filter((p) => p.phase === PHASE.BACKLOG).length;
  const timesheetEra = data.projects.filter((p) => p.hours.era === "timesheet" && p.hours.hours > 0).length;

  return {
    dbChecks,
    computed: {
      bidCount: data.bids.length,
      projectCount: data.projects.length,
      timecardCount: data.timecards.length,
      pipeline: data.pipeline,
      runningCount,
      backlogCount,
      timesheetEraCount: timesheetEra,
      realizedHoursNote: data.capacity.realizedHoursPerDay == null ? "no timecard history yet" : null,
      headcount: data.capacity.headcount,
      realizedHoursPerDay: data.capacity.realizedHoursPerDay,
      committedHeadroomTons: data.capacity.committedHeadroomTons,
      expectedHeadroomTons: data.capacity.expectedHeadroomTons,
      horizonWeeks: data.capacity.horizonWeeks,
      health: data.health,
    },
  };
}

// ---------------------------------------------------------------------------
// getActiveWork() — the running-jobs zone. Mobilizing + Active + Punchlist,
// each project run through the burn rules, sorted worst-first (mobilizing and
// no-bid jobs sink below real running jobs). Returns clean rows for the table
// plus the full project on each row for the detail panel (data verification).
// ---------------------------------------------------------------------------
export async function getActiveWork() {
  const data = await getEverything();
  const running = data.projects.filter((p) => p.phase === PHASE.RUNNING);

  const rows = running.map((p) => {
    const burn = computeBurn(p);
    return {
      id: p.id,
      projectId: p.projectId,
      name: p.name,
      status: p.status,
      isMobilizing: p.isMobilizing,
      foreman: p.foreman,
      awardedLbs: p.awardedLbs,
      placedLbs: p.placedLbs,
      placedFraction: p.placedFraction,
      placementAsOf: p.lastEditedAt,
      contractValue: p.bid?.contractValue ?? null,
      operatingProfit: p.bid?.operatingProfit ?? null,
      operatingMargin: p.bid?.operatingMargin ?? null,
      bidProductivity: p.bid?.productivity ?? null,
      multiBid: p.multiBid,
      hasBid: !!p.bid,
      burn,
      // full detail for the side panel + data verification
      detail: {
        actualStartDate: p.actualStartDate,
        payrollHours: p.payrollHours,
        hoursEra: p.hours?.era ?? null,
        gc: p.bid?.gc ?? [],
        fabricator: p.bid?.fabricator ?? [],
        projectType: p.bid?.projectType ?? [],
        cityCounty: p.bid?.cityCounty ?? null,
        scope: p.bid?.scope ?? null,
        baseWage: p.bid?.baseWage ?? null,
        bidRate: p.bid?.bidRate ?? null,
        financials: p.financials,
        timecardCount: p.timecards.length,
      },
    };
  });

  rows.sort((a, b) => burnSortValue(b.burn) - burnSortValue(a.burn));

  return {
    rows,
    counts: {
      total: rows.length,
      mobilizing: rows.filter((r) => r.isMobilizing).length,
      atRisk: rows.filter((r) => r.burn.severity === "danger").length,
    },
  };
}

// ---------------------------------------------------------------------------
// getPipeline() — in-flight bids for the Pipeline zone (raw + weighted totals).
// ---------------------------------------------------------------------------
export async function getPipeline() {
  const data = await getEverything();
  const inFlight = data.bids.filter(isInFlight);
  const rows = inFlight.map((b) => ({
    id: b.id,
    name: b.name,
    status: b.status,
    gc: b.gc,
    fabricator: b.fabricator,
    cityCounty: b.cityCounty,
    bidDueDate: b.bidDueDate,
    submissionDate: b.submissionDate,
    contractValue: b.contractValue,
    operatingProfit: b.operatingProfit,
    operatingMargin: b.operatingMargin,
    tons: b.tons,
    confidence: confidenceOf(b.status),
  }));
  // sort by due date (soonest first), nulls last
  rows.sort((a, b) => {
    if (!a.bidDueDate) return 1;
    if (!b.bidDueDate) return -1;
    return new Date(a.bidDueDate) - new Date(b.bidDueDate);
  });
  return { rows, totals: data.pipeline };
}

// ---------------------------------------------------------------------------
// getBidDetail(pageId) — one bid, fully mapped, for the detail/edit page.
// ---------------------------------------------------------------------------
export async function getBidDetail(pageId) {
  const { getPage } = await import("@/lib/notion/client");
  const page = await getPage(pageId);
  return mapBid(page);
}

// ---------------------------------------------------------------------------
// BILLING — the A/R workspace data. Joins Billing Events to projects (the hub)
// and computes the full picture in code (billing.js). Migration-safe.
// ---------------------------------------------------------------------------
export async function getBillingOverview() {
  const { getAllBillingEvents, groupEventsByProject } = await import("@/lib/notion/billingRepository");
  const { computeBilling, portfolioBilling } = await import("@/lib/rules/billing");
  const [data, events] = await Promise.all([getEverything(), getAllBillingEvents()]);
  const byProject = groupEventsByProject(events);

  // Show projects that are billable candidates: anything not bidding-only and
  // not fully complete, PLUS anything that already has billing data. This lets
  // you SET UP a project (no billing yet shows zeros), rather than hiding it.
  const rows = data.projects
    .filter((p) => {
      const hasBilling = (p.billingContractValue || 0) > 0 || byProject.has(p.id);
      const billable = p.phase === PHASE.RUNNING || p.phase === PHASE.BILLING || p.phase === PHASE.BACKLOG;
      return hasBilling || billable;
    })
    .map((p) => {
      const evts = byProject.get(p.id) || [];
      const b = computeBilling(p, evts);
      return {
        id: p.id,
        projectId: p.projectId,
        name: p.name,
        status: p.status,
        gc: p.bid?.gc || [],
        billing: b,
      };
    });

  // sort: overdue first, then most outstanding, then by name for the rest
  rows.sort((a, b) =>
    (b.billing.overdueTotal - a.billing.overdueTotal) ||
    (b.billing.outstanding - a.billing.outstanding) ||
    (a.name || "").localeCompare(b.name || "")
  );
  const totals = portfolioBilling(rows.map((r) => r.billing));
  return { rows, totals };
}

export async function getProjectBilling(projectId) {
  const { getAllBillingEvents, groupEventsByProject } = await import("@/lib/notion/billingRepository");
  const { computeBilling } = await import("@/lib/rules/billing");
  const [data, events] = await Promise.all([getEverything(), getAllBillingEvents()]);
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const evts = (groupEventsByProject(events).get(projectId) || []).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const billing = computeBilling(project, evts);
  return {
    id: project.id,
    projectId: project.projectId,
    name: project.name,
    status: project.status,
    gc: project.bid?.gc || [],
    installedPounds: project.placedLbs,
    placementAsOf: project.lastEditedAt,
    settings: {
      billingContractValue: project.billingContractValue,
      retentionEnabled: project.retentionEnabled,
      retentionPercent: project.retentionPercent,
      retentionFlatAmount: project.retentionFlatAmount,
    },
    bidContractValue: project.bid?.contractValue ?? null,
    billing,
    events: evts,
  };
}

// ---------------------------------------------------------------------------
// LINE ITEMS — the bid sheet / billing schedule atoms.
// ---------------------------------------------------------------------------
export async function getBidSheet(bidPageId) {
  const { getAllLineItems } = await import("@/lib/notion/lineItemRepository");
  const [bid, lines] = await Promise.all([
    getBidDetail(bidPageId),
    getAllLineItems(),
  ]);
  const items = lines
    .filter((li) => li.bidId === bidPageId)
    .sort((a, b) => (a.itemNo || "").localeCompare(b.itemNo || "", undefined, { numeric: true }));
  return { bid, items };
}
