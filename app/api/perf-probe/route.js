// =============================================================================
// PERF PROBE — where do the seconds actually go?
//
// Read-only diagnostic. Times every table scan and every zone loader, with the
// read cache cleared first so the numbers reflect a COLD load — which is what
// most page loads really are, since Vercel spins instances down between visits.
//
// Run it twice: the first pass is cold, the second warm. The gap between them
// is how much the cache is currently buying you.
//
// Heavy by design (it pulls everything), so it is a diagnostic, not something
// to leave on a dashboard.
// =============================================================================
import { NextResponse } from "next/server";
import { queryAll, bustNotionReadCache } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";
import * as data from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ms = (t) => Math.round(t);

async function timeIt(label, fn) {
  const t0 = performance.now();
  try {
    const out = await fn();
    return { label, ms: ms(performance.now() - t0), rows: Array.isArray(out) ? out.length : undefined, ok: true };
  } catch (e) {
    return { label, ms: ms(performance.now() - t0), ok: false, error: String(e?.message || e).slice(0, 120) };
  }
}

export async function GET(req) {
  const warm = new URL(req.url).searchParams.get("warm") === "1";
  if (!warm) bustNotionReadCache();

  // 1) each table on its own, sequentially, so timings don't overlap
  const tables = [];
  for (const [key, id] of Object.entries({
    BID_TRACKER: DB.BID_TRACKER, PROJECTS: DB.PROJECTS, LINE_ITEMS: DB.LINE_ITEMS,
    BILLING_EVENTS: DB.BILLING_EVENTS, TIMESHEET: DB.TIMESHEET,
    CREW_ROSTER: DB.CREW_ROSTER, REC_LOG: DB.REC_LOG,
  })) {
    if (!id) continue;
    const r = await timeIt(key, () => queryAll(id));
    // Notion pages at 100 rows, so this is how many round-trips that scan cost
    r.requests = r.rows != null ? Math.max(1, Math.ceil(r.rows / 100)) : undefined;
    tables.push(r);
  }

  // 2) the zone loaders, cold, one at a time
  const loaders = [];
  for (const [label, fn] of [
    ["getEverything", data.getEverything],
    ["getHome", data.getHome],
    ["getPipeline", data.getPipeline],
    ["getActiveWork", data.getActiveWork],
    ["getBook", data.getBook],
    ["getPerformance", data.getPerformance],
    ["getBillingOverview", data.getBillingOverview],
  ]) {
    if (typeof fn !== "function") continue;
    if (!warm) bustNotionReadCache();
    loaders.push(await timeIt(label, () => fn()));
  }

  const totalRows = tables.reduce((a, t) => a + (t.rows || 0), 0);
  const totalRequests = tables.reduce((a, t) => a + (t.requests || 0), 0);

  return NextResponse.json({
    mode: warm ? "warm (cache kept)" : "cold (cache cleared before each step)",
    tables,
    loaders,
    totals: { rows: totalRows, notionRequests: totalRequests },
    note: "requests = round-trips to Notion at 100 rows per page",
  }, { headers: { "Cache-Control": "no-store" } });
}
