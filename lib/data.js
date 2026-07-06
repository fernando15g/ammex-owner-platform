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
import { phaseOf, PHASE } from "@/lib/rules/phase";
import { pipelineTotals, confidenceOf, isInFlight } from "@/lib/rules/pipeline";
import { demandHours, supplyHours, computeCapacity, CAPACITY_DEFAULTS } from "@/lib/rules/capacity";

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
    placedLbs: getNumber(page, "Rebar Placed To-Date"),
    payrollHours: getNumber(page, "Labor Hours To-Date"), // payroll-era manual number
    actualStartDate: getDate(page, "Actual Start Date"),
    foreman: getMultiSelect(page, "Foreman"),
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
  for (const p of projects) {
    const entry = tsSummary.perProject.get(p.id);
    p.hours = actualHoursForProject(entry, p.payrollHours);

    // join to the bid for money + projected side
    p.bid = p.relatedBidId ? bidsById.get(p.relatedBidId) || null : null;
    p.multiBid = p.relatedBidIds.length > 1;

    // placement progress (guarded — never divide by zero/blank)
    const awardedLbs = p.bid?.estimatedLbs ?? p.estimatedLbsRollup;
    p.awardedLbs = typeof awardedLbs === "number" ? awardedLbs : null;
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
  const health = {
    unassignedHours: tsSummary.unassigned.hours,
    unassignedRows: tsSummary.unassigned.rows,
    underReviewHours: tsSummary.underReviewTotal,
    openRecIssues: recLog.filter((r) => r.status === "Under Review").length,
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
      headcount: data.capacity.headcount,
      realizedHoursPerDay: data.capacity.realizedHoursPerDay,
      committedHeadroomTons: data.capacity.committedHeadroomTons,
      expectedHeadroomTons: data.capacity.expectedHeadroomTons,
      horizonWeeks: data.capacity.horizonWeeks,
      health: data.health,
    },
  };
}
