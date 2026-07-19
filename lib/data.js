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
export function mapProjectLite(page) {
  return mapProject(page);
}

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
    siteStreet: getText(page, "Site Street"),
    siteCity: getText(page, "Site City"),
    siteState: getText(page, "Site State"),
    siteZip: getText(page, "Site Zip"),
    siteLat: getNumber(page, "Site Lat"),
    siteLng: getNumber(page, "Site Lng"),
    payrollHours: getNumber(page, "Labor Hours To-Date"), // payroll-era manual number
    manualHoursOverride: getCheckbox(page, "Manual Hours Override"), // force payroll hours (historical jobs)
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
    p.hours = actualHoursForProject(entry, p.payrollHours, p.manualHoursOverride);

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
  const { inferredStatus } = await import("@/lib/rules/phase");
  const { getAllBillingEvents, groupEventsByProject } = await import("@/lib/notion/billingRepository");
  const { getAllLineItems } = await import("@/lib/notion/lineItemRepository");
  const { projectLineItems } = await import("@/lib/rules/lineItems");

  const [data, events, allLines] = await Promise.all([getEverything(), getAllBillingEvents(), getAllLineItems()]);
  const eventsByProject = groupEventsByProject(events);
  const activeLines = allLines.filter((li) => li.status !== "Closed");

  // ---- STATUS FROM EVIDENCE ------------------------------------------------
  // A job sitting in "Awarded" with hours charged to it hasn't been forgotten —
  // it's been started, and nobody flipped the dropdown. Correct it from the
  // facts, and write the correction back so every other view agrees.
  const corrected = [];
  for (const p of data.projects) {
    const evts = eventsByProject.get(p.id) || [];
    const infer = inferredStatus(p, {
      payrollHours: p.payrollHours || 0,
      invoiceCount: evts.filter((e) => e.type === "Bill").length,
    });
    if (!infer) continue;

    p.status = infer.status;                       // reflect it immediately
    p.phase = PHASE.RUNNING;
    corrected.push({ project: p, because: infer.because });
  }

  // persist quietly; a failure here must never break the page
  if (corrected.length) {
    Promise.all(corrected.map(async ({ project, because }) => {
      try {
        const { updateProject } = await import("@/lib/notion/projectRepository");
        const { audit } = await import("@/lib/notion/auditRepository");
        await updateProject(project.id, { status: "Active" });
        await audit({
          actor: "System",
          action: "Update",
          entity: "Project",
          entityName: project.name,
          entityId: project.projectId || project.id,
          changes: `Status: Awarded → Active (${because})`,
        });
      } catch (e) {
        console.error("[status] couldn't auto-advance", project.name, e.message || e);
      }
    })).catch(() => {});
  }

  const running = data.projects.filter((p) => p.phase === PHASE.RUNNING);

  // BACKLOG — won, but crews aren't on it yet (status "Awarded").
  // These used to be invisible everywhere in the OS, which meant a project could
  // be created and then simply vanish: won, never mobilised, never billed, and
  // nothing showing it to you. Work you've won is work; it belongs on this page.
  const backlog = data.projects
    .filter((p) => p.phase === PHASE.BACKLOG)
    .map((p) => ({
      id: p.id,
      projectId: p.projectId,
      name: p.name,
      status: p.status,
      gc: p.bid?.gc || [],
      contractValue: p.bid?.contractValue ?? null,
      awardedLbs: p.awardedLbs ?? p.bid?.estimatedLbs ?? null,
      hasBid: !!p.relatedBidId,
    }))
    .sort((a, b) => String(a.projectId || "~").localeCompare(String(b.projectId || "~"), undefined, { numeric: true }));

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
      bidId: p.relatedBidId ?? null,
      hasSheet: projectLineItems(p, activeLines).length > 0,
      site: { street: p.siteStreet, city: p.siteCity, state: p.siteState, zip: p.siteZip, lat: p.siteLat, lng: p.siteLng },
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
    backlog,
    counts: {
      total: rows.length,
      mobilizing: rows.filter((r) => r.isMobilizing).length,
      atRisk: rows.filter((r) => r.burn.severity === "danger").length,
      backlog: backlog.length,
    },
  };
}

// ---------------------------------------------------------------------------
// getPipeline() — in-flight bids for the Pipeline zone (raw + weighted totals).
// ---------------------------------------------------------------------------
export async function getPipeline() {
  const data = await getEverything();
  const inFlight = data.bids.filter(isInFlight);

  // The LIST shows every bid — closed-out ones (Awarded / Lost / No Bid) are
  // still real records you need to reach: an Awarded bid is where a project gets
  // created from. The TOTALS below stay in-flight only, so a won or lost bid can
  // never inflate the pipeline's value.
  const projectByBid = new Map();
  for (const p of data.projects) {
    for (const bidId of p.relatedBidIds || []) projectByBid.set(bidId, { id: p.id, name: p.name, projectId: p.projectId });
  }

  const rows = data.bids.map((b) => ({
    id: b.id,
    name: b.name,
    status: b.status,
    gc: b.gc,
    fabricator: b.fabricator,
    cityCounty: b.cityCounty,
    bidDueDate: b.bidDueDate,
    submissionDate: b.submissionDate,
    lastFollowUp: b.lastFollowUp,
    contractValue: b.contractValue,
    operatingProfit: b.operatingProfit,
    operatingMargin: b.operatingMargin,
    tons: b.tons,
    confidence: confidenceOf(b.status),
    inFlight: isInFlight(b),
    project: projectByBid.get(b.id) || null,   // so a won bid can link to its project
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
  const { getAllLineItems } = await import("@/lib/notion/lineItemRepository");
  const { groupLineItems } = await import("@/lib/rules/lineItems");
  const { computeBilling, portfolioBilling } = await import("@/lib/rules/billing");
  const { reconcile } = await import("@/lib/rules/reconcile");
  const [data, events, allLines] = await Promise.all([getEverything(), getAllBillingEvents(), getAllLineItems()]);
  const byProject = groupEventsByProject(events);
  const activeLines = allLines.filter((li) => li.status !== "Closed");
  const linesByProject = new Map();
  for (const li of activeLines) {
    // attach by projectId, or by the project's related bid
    const keyP = li.projectId;
    if (keyP) { if (!linesByProject.has(keyP)) linesByProject.set(keyP, []); linesByProject.get(keyP).push(li); }
  }
  // resolve per project across ALL its bids (a second bid must not be dropped)
  const { projectLineItems } = await import("@/lib/rules/lineItems");

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
      const plines = projectLineItems(p, activeLines);
      const b = computeBilling(p, evts, plines);
      return {
        id: p.id,
        projectId: p.projectId,
        name: p.name,
        status: p.status,
        gc: p.bid?.gc || [],
        hasBilling: plines.length > 0 || evts.length > 0 || (p.billingContractValue || 0) > 0,
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

  // Reconciliation rides along: this page already has everything it needs, so
  // checking that the books agree with themselves costs nothing extra — and a
  // check nobody remembers to run is a check that never runs.
  const health = reconcile({ projects: data.projects, events, lines: activeLines });
  return { rows, totals, health };
}

// ---------------------------------------------------------------------------
// getHome() — the front door. One headline per zone, plus the short list of
// exceptions that actually need action today. Reuses the zone functions so the
// numbers always match their zones (can be collapsed to a single getEverything
// pass later if load matters).
// ---------------------------------------------------------------------------
export async function getHome() {
  const [pipeline, active, billing, book, perf] = await Promise.all([
    getPipeline(), getActiveWork(), getBillingOverview(), getBook(), getPerformance(),
  ]);

  const now = Date.now();
  const daysSince = (d) => (d ? Math.floor((now - new Date(d)) / 86400000) : null);
  const m = (n) =>
    typeof n !== "number" ? "$0" : `$${Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}k` : Math.round(n)}`;

  // Overdue receivables (60+ days), per project — billed, unpaid, aging.
  const overdueItems = billing.rows
    .map((r) => {
      const a = r.billing.aging || {};
      const over60 = (a.d61_90 || 0) + (a.d90_plus || 0);
      return { id: r.id, projectId: r.projectId, name: r.name, gc: r.gc || [], over60, over90: a.d90_plus || 0, outstanding: r.billing.outstanding || 0 };
    })
    .filter((r) => r.over60 > 0)
    .sort((a, b) => b.over60 - a.over60);
  const overdueTotal = overdueItems.reduce((s, r) => s + r.over60, 0);

  // Jobs bleeding hours — forecast to blow the budget.
  const overPaceItems = active.rows
    .filter((r) => r.burn?.severity === "danger")
    .map((r) => ({
      id: r.id, projectId: r.projectId, name: r.name, bidId: r.bidId,
      projectedHours: r.burn.projectedHours ?? null, actualHours: r.burn.actualHours ?? null,
      hoursPct: r.burn.hoursPct ?? null, forecastPct: r.burn.forecastPct ?? null,
    }));

  // Cold bids: out for a decision, 14+ days since the later of submission or
  // last follow-up. Snoozing sets Last Follow-Up = today, resetting the clock.
  const COLD_DAYS = 14;
  const coldBids = pipeline.rows
    .filter((r) => r.inFlight && (r.status === "Submitted" || r.status === "Follow Up"))
    .map((r) => {
      const anchor = [r.submissionDate, r.lastFollowUp].filter(Boolean).sort().pop() || null;
      return { id: r.id, name: r.name, gc: r.gc || [], status: r.status, contractValue: r.contractValue, submissionDate: r.submissionDate, coldDays: daysSince(anchor) };
    })
    .filter((r) => r.coldDays != null && r.coldDays >= COLD_DAYS)
    .sort((a, b) => b.coldDays - a.coldDays);

  // Running jobs with NO progress recorded anywhere — no placement logged and
  // nothing billed. Clears via placement today, or via the first invoice once
  // billed-is-truth takes over, so the alert survives that transition instead of
  // nagging every job forever once placed-to-date is retired.
  const billedByProject = new Map(billing.rows.map((b) => [b.id, b.billing.billedToDate || 0]));
  const placementItems = active.rows
    .filter((r) => (r.placedLbs == null || r.placedLbs === 0) && !(billedByProject.get(r.id) > 0))
    .map((r) => ({ id: r.id, projectId: r.projectId, name: r.name, bidId: r.bidId, awardedLbs: r.awardedLbs ?? null, placedLbs: r.placedLbs ?? 0 }));

  // Active jobs with no bid sheet — nothing to invoice against.
  const noSheetItems = active.rows
    .filter((r) => r.hasSheet === false)
    .map((r) => ({ id: r.id, projectId: r.projectId, name: r.name, bidId: r.bidId, contractValue: r.contractValue ?? null }));

  const alerts = [];
  if (overdueItems.length) alerts.push({ id: "overdue", sev: "danger", label: `${m(overdueTotal)} past 60 days`, count: overdueItems.length, items: overdueItems });
  if (overPaceItems.length) alerts.push({ id: "overpace", sev: "danger", label: `${overPaceItems.length} job${overPaceItems.length === 1 ? "" : "s"} over pace`, count: overPaceItems.length, items: overPaceItems });
  if (coldBids.length) alerts.push({ id: "cold", sev: "warn", label: `${coldBids.length} bid${coldBids.length === 1 ? "" : "s"} gone cold`, count: coldBids.length, items: coldBids });
  if (placementItems.length) alerts.push({ id: "placement", sev: "warn", label: `${placementItems.length} job${placementItems.length === 1 ? "" : "s"} missing placement`, count: placementItems.length, items: placementItems });
  if (noSheetItems.length) alerts.push({ id: "nosheet", sev: "warn", label: `${noSheetItems.length} job${noSheetItems.length === 1 ? "" : "s"} with no bid sheet`, count: noSheetItems.length, items: noSheetItems });

  // ---- analytics canvas data ----------------------------------------------

  // The book, as a shape: contract value by stage.
  const bookStages = {
    backlog: book.backlogTotals.contract,
    active: book.activeTotals.contract,
    closed: book.closedTotals.contract,
  };

  // Work mix: share of active jobs by primary project type.
  const mix = {};
  for (const r of active.rows) {
    const t = (r.detail?.projectType || [])[0] || "Unclassified";
    mix[t] = (mix[t] || 0) + 1;
  }
  const workMix = Object.entries(mix).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

  // Foreman scorecard: realized lbs/MH vs bid, from trusted completed jobs that
  // carry a foreman. A job with two foremen counts toward both. Small samples
  // are surfaced, not ranked — one pour isn't a verdict.
  const fm = new Map();
  for (const r of perf.trusted) {
    if (typeof r.placedLbs !== "number" || typeof r.hours !== "number" || r.hours <= 0) continue;
    for (const f of r.foreman || []) {
      const c = fm.get(f) || { name: f, lbs: 0, hours: 0, bidSum: 0, bidN: 0, jobs: 0 };
      c.lbs += r.placedLbs; c.hours += r.hours; c.jobs += 1;
      if (typeof r.bidProductivity === "number" && r.bidProductivity > 0) { c.bidSum += r.bidProductivity; c.bidN += 1; }
      fm.set(f, c);
    }
  }
  const foremen = [...fm.values()]
    .map((f) => {
      const realized = f.hours > 0 ? f.lbs / f.hours : null;
      const bid = f.bidN ? f.bidSum / f.bidN : null;
      return { name: f.name, jobs: f.jobs, lbs: f.lbs, realized, bid, gap: realized != null && bid ? realized / bid - 1 : null };
    })
    .sort((a, b) => (b.realized || 0) - (a.realized || 0));

  // Job concentration by Arizona county — best-effort from City/County text,
  // widened by a small map of the big cities. Jobs we can't place are counted
  // honestly rather than dropped or guessed onto the map.
  const AZ = ["Apache", "Cochise", "Coconino", "Gila", "Graham", "Greenlee", "La Paz", "Maricopa", "Mohave", "Navajo", "Pima", "Pinal", "Santa Cruz", "Yavapai", "Yuma"];
  const CITY_COUNTY = { phoenix: "Maricopa", mesa: "Maricopa", chandler: "Maricopa", gilbert: "Maricopa", glendale: "Maricopa", scottsdale: "Maricopa", tempe: "Maricopa", peoria: "Maricopa", surprise: "Maricopa", goodyear: "Maricopa", buckeye: "Maricopa", avondale: "Maricopa", tucson: "Pima", marana: "Pima", "oro valley": "Pima", flagstaff: "Coconino", sedona: "Coconino", yuma: "Yuma", "casa grande": "Pinal", maricopa: "Pinal", "lake havasu": "Mohave", kingman: "Mohave", bullhead: "Mohave", prescott: "Yavapai", "sierra vista": "Cochise" };

  const { geocodeAddress, isGeocodable } = await import("@/lib/geo/geocode");
  const { updateProject } = await import("@/lib/notion/projectRepository");
  const county = {};
  const pins = [];
  let needLocation = 0;
  let geocodeBudget = 8; // cap fresh geocodes per load; the rest resolve next visit

  for (const r of active.rows) {
    const s = r.site || {};
    let pinned = false;
    if (typeof s.lat === "number" && typeof s.lng === "number") {
      pins.push({ name: r.name, lat: s.lat, lng: s.lng }); pinned = true;
    } else if (isGeocodable(s) && geocodeBudget > 0) {
      geocodeBudget -= 1;
      const coords = await geocodeAddress(s);
      if (coords) {
        pins.push({ name: r.name, lat: coords.lat, lng: coords.lng }); pinned = true;
        try { await updateProject(r.id, { siteLat: coords.lat, siteLng: coords.lng }); } catch {}
      }
    }
    // county shading is independent — a pinned job still colors its county
    const cc = (r.detail?.cityCounty || "").toLowerCase();
    let hit = AZ.find((c) => cc.includes(c.toLowerCase()));
    if (!hit) { const city = Object.keys(CITY_COUNTY).find((c) => cc.includes(c)); if (city) hit = CITY_COUNTY[city]; }
    if (hit) county[hit] = (county[hit] || 0) + 1;
    // "needs a location" = we can't place it as a pin OR a county, and there's
    // no address to geocode either — the honest nudge to fill site info in.
    if (!pinned && !hit && !isGeocodable(s)) needLocation += 1;
  }

  return {
    tiles: {
      pipeline: { weighted: pipeline.totals.weighted, count: pipeline.totals.count },
      active: { running: active.counts.total, overPace: overPaceItems.length },
      billing: { outstanding: billing.totals.outstanding, overdue60: overdueTotal },
      book: { contract: book.totals.contract, profit: book.totals.operatingProfit },
      performance: { realized: perf.fleet.blendedRealized, gapPct: perf.fleet.gap ? perf.fleet.gap.pct : null },
    },
    alerts,
    analytics: { bookStages, workMix, foremen, county, pins, needLocation },
  };
}

// ---------------------------------------------------------------------------
// getBook() — The Book: money on AWARDED work (spec §121). A WIP schedule —
// one row per won job with contract, expected profit, billed, remaining and
// outstanding. Read-only: every number is computed here from the same billing
// engine the Billing zone uses, so the two always agree. Open work is the live
// book; Complete jobs collapse into history with their own subtotal.
// ---------------------------------------------------------------------------
export async function getBook() {
  const { getAllBillingEvents, groupEventsByProject } = await import("@/lib/notion/billingRepository");
  const { getAllLineItems } = await import("@/lib/notion/lineItemRepository");
  const { computeBilling } = await import("@/lib/rules/billing");
  const { projectLineItems } = await import("@/lib/rules/lineItems");
  const [data, events, allLines] = await Promise.all([getEverything(), getAllBillingEvents(), getAllLineItems()]);
  const byProject = groupEventsByProject(events);
  const activeLines = allLines.filter((li) => li.status !== "Closed");

  // Awarded = everything won (any phase but bidding).
  const awarded = data.projects.filter((p) => p.phase && p.phase !== PHASE.BIDDING);

  const toRow = (p) => {
    const evts = byProject.get(p.id) || [];
    const plines = projectLineItems(p, activeLines);
    const b = computeBilling(p, evts, plines);
    // Contract = the revised billing contract when one is set (includes change
    // orders); fall back to the bid's contract value so backlog jobs with no
    // billing yet still show their real number instead of $0.
    const contract = b.revisedContract && b.revisedContract > 0 ? b.revisedContract : (p.bid?.contractValue ?? 0);
    const billed = b.billedToDate || 0;
    return {
      id: p.id,
      projectId: p.projectId,
      name: p.name,
      status: p.status,
      phase: p.phase,
      gc: p.bid?.gc || [],
      contract,
      operatingProfit: p.bid?.operatingProfit ?? null, // expected (bid)
      operatingMargin: p.bid?.operatingMargin ?? null,
      billed,
      remaining: Math.max(contract - billed, 0),
      outstanding: b.outstanding || 0,
      retention: b.retention || 0,
      billingStatus: b.status,
    };
  };

  // Split three ways, the way a bonding company reads a book:
  //   backlog = awarded, not started (signed future revenue, nothing billed)
  //   active  = underway — the real work-in-progress
  //   closed  = complete (history)
  const backlog = awarded.filter((p) => p.phase === PHASE.BACKLOG).map(toRow);
  const active = awarded.filter((p) => p.phase === PHASE.RUNNING || p.phase === PHASE.BILLING).map(toRow);
  const closed = awarded.filter((p) => p.phase === PHASE.COMPLETE).map(toRow);

  const byOutstanding = (a, b) => (b.outstanding - a.outstanding) || (a.name || "").localeCompare(b.name || "");
  const byContract = (a, b) => (b.contract - a.contract) || (a.name || "").localeCompare(b.name || "");
  const byName = (a, b) => (a.name || "").localeCompare(b.name || "");
  active.sort(byOutstanding);
  backlog.sort(byContract);
  closed.sort(byName);

  const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const totalsOf = (rows) => ({
    jobs: rows.length,
    contract: sum(rows, "contract"),
    operatingProfit: sum(rows, "operatingProfit"),
    billed: sum(rows, "billed"),
    remaining: sum(rows, "remaining"),
    outstanding: sum(rows, "outstanding"),
  });

  return {
    active,
    backlog,
    closed,
    totals: totalsOf([...active, ...backlog]), // the live book — powers the KPI tiles
    activeTotals: totalsOf(active),
    backlogTotals: totalsOf(backlog),
    closedTotals: totalsOf(closed),
  };
}

export async function getProjectBilling(projectId) {
  const { getAllBillingEvents, groupEventsByProject } = await import("@/lib/notion/billingRepository");
  const { getAllLineItems } = await import("@/lib/notion/lineItemRepository");
  const { computeBilling, shortPayCarryover } = await import("@/lib/rules/billing");
  const [data, events, allLines] = await Promise.all([getEverything(), getAllBillingEvents(), getAllLineItems()]);
  const project = data.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const evts = (groupEventsByProject(events).get(projectId) || []).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const { projectLineItems } = await import("@/lib/rules/lineItems");
  const plines = projectLineItems(project, allLines);   // across ALL attached bids
  const billing = computeBilling(project, evts, plines);
  const carryover = shortPayCarryover(evts);
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
    relatedBidId: project.relatedBidId,
    relatedBidIds: project.relatedBidIds || [],
    billing,
    carryover,
    events: evts,
    lines: [], // filled by getProjectBillingWithLines
  };
}

// Same as getProjectBilling but includes the project's LINE ITEMS (matched by
// projectId, or by the project's related bid — lines are born on the bid sheet).
export async function getProjectBillingWithLines(projectId) {
  const base = await getProjectBilling(projectId);
  if (!base) return null;
  const { getAllLineItems } = await import("@/lib/notion/lineItemRepository");
  const { projectLineItems } = await import("@/lib/rules/lineItems");
  const all = await getAllLineItems();
  const data = await getEverything();

  base.lines = projectLineItems({ id: projectId, relatedBidId: base.relatedBidId, relatedBidIds: base.relatedBidIds }, all)
    .sort((a, b) => (a.itemNo || "").localeCompare(b.itemNo || "", undefined, { numeric: true }));

  // Tag each line with the phase it came from. Only meaningful once a project
  // carries more than one bid — but when it does, two lines can share an item
  // number, and nothing else on screen would tell them apart.
  const bidIds = base.relatedBidIds?.length ? base.relatedBidIds : base.relatedBidId ? [base.relatedBidId] : [];
  base.phases = bidIds.map((id) => {
    const b = data.bids.find((x) => x.id === id);
    return { bidId: id, label: b?.name || "Bid" };
  });
  base.multiPhase = base.phases.length > 1;
  for (const li of base.lines) {
    li.phaseLabel = base.phases.find((ph) => ph.bidId === li.bidId)?.label || null;
  }
  return base;
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

// --- project admin (create/edit screens) -------------------------------------
// Bids available to attach, and the project itself when editing.
export async function getProjectAdmin(projectId = null) {
  const { priceBid } = await import("@/lib/rules/bidCostEngine");
  const data = await getEverything();

  // Projected hours and duration are COMPUTED by the pricing engine, not stored
  // on the bid — so run it, rather than shipping undefined to the screen that's
  // meant to let Fern sanity-check the job before committing to it.
  const econOf = (b) => {
    if (!b.estimatedLbs) return {};
    try {
      const inputs = { weightLb: b.estimatedLbs, ptSpecialty: b.ptSpecialty ?? 0 };
      const add = (k, v) => { if (v != null && v !== "") inputs[k] = Number(v); };
      add("outputLbPerMH", b.productivity);
      add("crewSize", b.crewSize);
      add("wageRate", b.baseWage);
      add("mobilizationHrs", b.mobilizationHrs);
      add("burdenPct", b.burdenPct);
      add("toolsPct", b.toolsPct);
      add("contingencyPct", b.contingencyPct);
      add("targetMarginPct", b.targetMarginPct);
      const e = priceBid(inputs, b.bidRate ?? null);
      return { projectedHours: e.totalMH, durationDays: e.crewDays };
    } catch { return {}; }
  };
  // A bid already on another project can't be attached again, so it isn't an
  // option — it's noise. Filter it out rather than listing it greyed.
  const takenBidIds = new Set(
    data.projects.filter((p) => p.id !== projectId).flatMap((p) => p.relatedBidIds || [])
  );

  const project = projectId ? data.projects.find((p) => p.id === projectId) || null : null;

  const attached = new Set(project?.relatedBidIds || (project?.relatedBidId ? [project.relatedBidId] : []));
  const bidOptions = data.bids
    .filter((b) => !takenBidIds.has(b.id) || attached.has(b.id))
    .map((b) => ({
      id: b.id,
      name: b.name,                       // `name`, not `projectName` — bids map it as `name`
      status: b.status,
      gc: b.gc || [],
      // what this bid BRINGS to a project — shown on the confirmation screen so a
      // wrong number is caught at creation, not three weeks into billing
      contractValue: b.contractValue ?? null,
      bidRate: b.bidRate ?? null,
      estimatedLbs: b.estimatedLbs ?? null,
      productivity: b.productivity ?? null,
      crewSize: b.crewSize ?? null,
      ...econOf(b),
      // an Awarded bid is the one you're most likely reaching for
      rank: b.status === "Awarded" ? 0 : b.status === "Negotiating" ? 1 : 2,
    }))
    .sort((a, b) => a.rank - b.rank || String(a.name || "").localeCompare(String(b.name || "")));

  return { project, bidOptions, takenBidIds: [...takenBidIds] };
}

// ---------------------------------------------------------------------------
// getPerformance() — realized vs. bid productivity with trust states (the
// strategic feedback loop). Rides entirely on getEverything(); no new reads.
// Trusted jobs feed the averages; needs-review jobs are shown with their
// discrepancy but excluded; running jobs get projections, not verdicts.
// ---------------------------------------------------------------------------
export async function getPerformance() {
  const { computePerformance } = await import("@/lib/rules/performance");
  const { getAllBillingEvents, groupEventsByProject } = await import("@/lib/notion/billingRepository");
  const { getAllLineItems, } = await import("@/lib/notion/lineItemRepository");
  const { projectLineItems } = await import("@/lib/rules/lineItems");
  const { computeBilling } = await import("@/lib/rules/billing");

  const [data, events, allLines] = await Promise.all([getEverything(), getAllBillingEvents(), getAllLineItems()]);
  const eventsByProject = groupEventsByProject(events);
  const activeLines = allLines.filter((li) => li.status !== "Closed");

  // Per-project billing context — lets the engine auto-flip a job's weight
  // source to billed LBS once it's ≥98% billed, and bound matched-productivity
  // hours to the last invoice date. Projects with no billing simply stay on
  // placed-to-date (the engine handles a missing context).
  const billingByProject = new Map();
  for (const p of data.projects) {
    const evts = eventsByProject.get(p.id) || [];
    const plines = projectLineItems(p, activeLines);
    if (!evts.length && !plines.length) continue;
    billingByProject.set(p.id, { lines: plines, events: evts, billing: computeBilling(p, evts, plines) });
  }

  return computePerformance(data.projects, billingByProject);
}

// --- reconciliation ----------------------------------------------------------
// Does the system still agree with itself? Reads everything and runs the checks.
export async function getReconciliation() {
  const { getAllBillingEvents } = await import("@/lib/notion/billingRepository");
  const { getAllLineItems } = await import("@/lib/notion/lineItemRepository");
  const { reconcile } = await import("@/lib/rules/reconcile");

  const [data, events, lines] = await Promise.all([
    getEverything(),
    getAllBillingEvents(),
    getAllLineItems(),
  ]);

  return reconcile({
    projects: data.projects,
    events,
    lines: lines.filter((l) => l.status !== "Closed"),
  });
}
