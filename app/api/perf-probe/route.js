// =============================================================================
// PERF PROBE — read-only diagnostic, one measurement per request.
//
// The first version timed every table AND every loader in a single request and
// blew Vercel's 60s limit, which was itself the finding: a full pass over this
// data does not fit in one function invocation.
//
// Usage:
//   /api/perf-probe                      -> list what can be measured
//   /api/perf-probe?table=LINE_ITEMS     -> time one table scan (cold)
//   /api/perf-probe?loader=getHome       -> time one page loader (cold)
//   add &warm=1 to keep the cache and see what it saves
// =============================================================================
import { NextResponse } from "next/server";
import { queryAll, bustNotionReadCache } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";
import * as data from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABLES = ["BID_TRACKER", "PROJECTS", "LINE_ITEMS", "BILLING_EVENTS", "TIMESHEET", "CREW_ROSTER", "REC_LOG"];
const LOADERS = ["getEverything", "getHome", "getPipeline", "getActiveWork", "getBook", "getPerformance", "getBillingOverview"];

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const warm = q.get("warm") === "1";
  const table = q.get("table");
  const loader = q.get("loader");

  if (!table && !loader) {
    return NextResponse.json({
      usage: "add ?table=NAME or ?loader=NAME (and &warm=1 to keep the cache)",
      tables: TABLES, loaders: LOADERS,
    });
  }

  if (!warm) bustNotionReadCache();
  const t0 = performance.now();

  try {
    if (table) {
      if (!DB[table]) return NextResponse.json({ error: `unknown table ${table}`, tables: TABLES }, { status: 400 });
      const rows = await queryAll(DB[table]);
      const ms = Math.round(performance.now() - t0);
      const requests = Math.max(1, Math.ceil(rows.length / 100));
      return NextResponse.json({
        table, warm, rows: rows.length, notionRequests: requests, ms,
        msPerRequest: Math.round(ms / requests),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const fn = data[loader];
    if (typeof fn !== "function") {
      return NextResponse.json({ error: `unknown loader ${loader}`, loaders: LOADERS }, { status: 400 });
    }
    await fn();
    return NextResponse.json({
      loader, warm, ms: Math.round(performance.now() - t0),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({
      failed: table || loader, warm, ms: Math.round(performance.now() - t0),
      error: String(e?.message || e).slice(0, 200),
    }, { status: 500 });
  }
}
