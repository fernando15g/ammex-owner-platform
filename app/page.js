// =============================================================================
// SYSTEM CHECK — the first page of the Owner Platform.
// Proves: token works → all six DBs readable → the data-layer rules compute
// real numbers (coalesce, era detection, weighted pipeline, capacity).
// The zone dashboards replace this as the front door in the next builds;
// this page then moves to /check as a permanent diagnostic.
// =============================================================================

import { getSystemCheck } from "@/lib/data";

export const dynamic = "force-dynamic"; // always fresh — never cache a stale check

function fmtMoney(n) {
  if (typeof n !== "number") return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}
function fmtNum(n, digits = 0) {
  return typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
}

export default async function SystemCheckPage() {
  let check;
  let fatal = null;
  try {
    check = await getSystemCheck();
  } catch (e) {
    fatal = String(e.message || e);
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-8">
        <p className="text-xs tracking-widest uppercase text-rebar mb-1">Ammex OS</p>
        <h1 className="text-2xl font-semibold">Data layer check</h1>
        <p className="text-sm text-rebar mt-2">
          If everything below reads green with real numbers, the foundation works and we build zones on top of it.
        </p>
      </header>

      {fatal && (
        <div className="rounded-xl border border-danger/50 bg-danger/10 p-4 text-sm">
          <p className="font-medium text-danger mb-1">Couldn&apos;t run the check</p>
          <p className="text-concrete/80 break-words">{fatal}</p>
          <p className="text-rebar mt-2">
            Most common cause: NOTION_TOKEN missing or wrong. Locally it lives in .env.local; on Vercel it lives in
            Project Settings → Environment Variables.
          </p>
        </div>
      )}

      {check && (
        <>
          {/* --- 1. Database access --- */}
          <section className="mb-8">
            <h2 className="text-xs tracking-widest uppercase text-rebar mb-3">Database access</h2>
            <ul className="space-y-2">
              {check.dbChecks.map((db) => (
                <li
                  key={db.key}
                  className="flex items-center justify-between rounded-lg bg-graphite border border-line px-4 py-3"
                >
                  <span className="text-sm">{db.label}</span>
                  {db.ok ? (
                    <span className="text-ok text-sm font-medium">connected</span>
                  ) : (
                    <span className="text-danger text-xs max-w-[55%] text-right">
                      no access — open this DB in Notion → ••• → Connections → add the integration
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* --- 2. Computed numbers (real data through the rules) --- */}
          {check.computed && (
            <>
              <section className="mb-8">
                <h2 className="text-xs tracking-widest uppercase text-rebar mb-3">Row counts</h2>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Bids" value={fmtNum(check.computed.bidCount)} />
                  <Stat label="Projects" value={fmtNum(check.computed.projectCount)} />
                  <Stat label="Timecards" value={fmtNum(check.computed.timecardCount)} />
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-xs tracking-widest uppercase text-rebar mb-3">
                  Pipeline — raw vs. weighted (computed in code)
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label={`In flight (${fmtNum(check.computed.pipeline.count)} bids)`} value={fmtMoney(check.computed.pipeline.raw)} />
                  <Stat label="Risk-weighted" value={fmtMoney(check.computed.pipeline.weighted)} accent />
                  <Stat label="Raw tons" value={fmtNum(check.computed.pipeline.rawTons)} />
                  <Stat label="Weighted tons" value={fmtNum(check.computed.pipeline.weightedTons)} />
                </div>
                {check.computed.pipeline.missingValue > 0 && (
                  <p className="text-xs text-warn mt-2">
                    {check.computed.pipeline.missingValue} in-flight bid(s) missing LBS or rate — counted, not valued.
                  </p>
                )}
              </section>

              <section className="mb-8">
                <h2 className="text-xs tracking-widest uppercase text-rebar mb-3">Projects by phase</h2>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Running" value={fmtNum(check.computed.runningCount)} />
                  <Stat label="Backlog" value={fmtNum(check.computed.backlogCount)} />
                  <Stat label="Timesheet-era" value={fmtNum(check.computed.timesheetEraCount)} />
                </div>
                <p className="text-xs text-rebar mt-2">
                  Timesheet-era = projects with live timecard hours. Expected low at launch; grows as jobs get timecards.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xs tracking-widest uppercase text-rebar mb-3">Capacity (reservoir)</h2>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Field headcount" value={fmtNum(check.computed.headcount)} />
                  <Stat
                    label="Realized hrs/day"
                    value={
                      typeof check.computed.realizedHoursPerDay === "number"
                        ? check.computed.realizedHoursPerDay.toFixed(1)
                        : "— (no history yet)"
                    }
                  />
                  <Stat
                    label={`Headroom, committed (${check.computed.horizonWeeks} wks)`}
                    value={`${fmtNum(check.computed.committedHeadroomTons)} tons`}
                    accent
                  />
                  <Stat
                    label="Headroom incl. weighted pipeline"
                    value={`${fmtNum(check.computed.expectedHeadroomTons)} tons`}
                  />
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-xs tracking-widest uppercase text-rebar mb-3">Data health</h2>
                <ul className="space-y-2 text-sm">
                  <HealthRow label="Unassigned hours (timecards with no project set)" value={`${fmtNum(check.computed.health.unassignedHours)} hrs`} bad={check.computed.health.unassignedHours > 0} />
                  <HealthRow label="Hours under review (held)" value={`${fmtNum(check.computed.health.underReviewHours)} hrs`} bad={check.computed.health.underReviewHours > 0} />
                  <HealthRow label="Open reconciliation issues" value={fmtNum(check.computed.health.openRecIssues)} bad={check.computed.health.openRecIssues > 0} />
                  <HealthRow label="Awarded bids with no project" value={fmtNum(check.computed.health.awardedBidsNoProject)} bad={check.computed.health.awardedBidsNoProject > 0} />
                  <HealthRow label="In-flight bids missing LBS or rate" value={fmtNum(check.computed.health.bidsMissingInputs)} bad={check.computed.health.bidsMissingInputs > 0} />
                </ul>
              </section>
            </>
          )}
        </>
      )}

      <footer className="text-xs text-rebar border-t border-line pt-4">
        Phase 1 · read-only · every number computed in code from raw Notion fields (coalesce, hour guards, weighted
        pipeline, reservoir capacity).
      </footer>
    </main>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-lg bg-graphite border border-line px-3 py-3">
      <p className="text-[11px] text-rebar mb-1 leading-tight">{label}</p>
      <p className={`text-lg font-semibold ${accent ? "text-safety" : ""}`}>{value}</p>
    </div>
  );
}

function HealthRow({ label, value, bad }) {
  return (
    <li className="flex items-center justify-between rounded-lg bg-graphite border border-line px-4 py-3">
      <span className="text-concrete/85">{label}</span>
      <span className={`font-medium ${bad ? "text-warn" : "text-ok"}`}>{value}</span>
    </li>
  );
}
