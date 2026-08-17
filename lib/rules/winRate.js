// =============================================================================
// WIN RATE — how often we win the bids we compete for, and whether losses are
// a pricing problem. Segmented by project type AND by GC (both read from the
// BID, since that's where wins and losses both live). Carries per-bid rate
// arrays so the UI can draw a won/lost dot strip and show ranges, not just means.
// =============================================================================

const WON = "Awarded";
const LOST = "Lost";

// Directional industry context for hard-bid / public sub work (George Hedley,
// ENR): hard-bid public ~10-20%, private ~15-25%. Ammex target: 25% (top of the
// healthy band — hitting it means outperforming typical public-work subs).
export const WIN_RATE_TARGET = 0.25;
export const WIN_RATE_BENCHMARK = { publicLow: 0.10, publicHigh: 0.20, privateHigh: 0.25 };

function bidDateOf(b) { return b.submissionDate || b.bidDueDate || null; }
function inWindow(b, sinceMs) {
  if (sinceMs == null) return true;
  const d = bidDateOf(b);
  if (!d) return false;
  const t = new Date(d).getTime();
  return !isNaN(t) && t >= sinceMs;
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const range = (a) => (a.length ? { min: Math.min(...a), max: Math.max(...a) } : null);

// Build a segment summary from a list of {won:bool, rate:number} entries.
function summarize(label, entries) {
  const wonRates = entries.filter((e) => e.won && e.rate > 0).map((e) => e.rate);
  const lostRates = entries.filter((e) => !e.won && e.rate > 0).map((e) => e.rate);
  const won = entries.filter((e) => e.won).length;
  const lost = entries.length - won;
  return {
    label,
    won, lost, decided: entries.length,
    rate: entries.length ? won / entries.length : null,
    wonAvgRate: avg(wonRates), lostAvgRate: avg(lostRates),
    wonRange: range(wonRates), lostRange: range(lostRates),
    // per-bid dots for the strip (rate + outcome), only bids with a real rate
    dots: entries.filter((e) => e.rate > 0).map((e) => ({ rate: e.rate, won: e.won })),
    lowSample: entries.length < 4,
  };
}

export function computeWinRate(bids, { windowMonths = 12 } = {}) {
  const sinceMs = windowMonths == null ? null
    : (() => { const d = new Date(); d.setMonth(d.getMonth() - windowMonths); return d.getTime(); })();

  const decided = (bids || []).filter(
    (b) => (b.status === WON || b.status === LOST) && inWindow(b, sinceMs)
  );

  const won = decided.filter((b) => b.status === WON).length;
  const overall = summarize("Overall", decided.map((b) => ({ won: b.status === WON, rate: b.bidRate || 0 })));

  // by project type (first tag; untyped skipped from breakdown)
  const byTypeMap = new Map();
  for (const b of decided) {
    const t = (b.projectType || [])[0];
    if (!t) continue;
    if (!byTypeMap.has(t)) byTypeMap.set(t, []);
    byTypeMap.get(t).push({ won: b.status === WON, rate: b.bidRate || 0 });
  }
  const byType = [...byTypeMap.entries()]
    .map(([t, entries]) => summarize(t, entries))
    .filter((s) => s.decided > 0)                        // hide segments with no decided bids
    .sort((a, b) => (b.decided - a.decided) || ((a.rate ?? 1) - (b.rate ?? 1)));

  // by GC (a bid may list several GCs; count the bid toward EACH — a lost bid
  // is a loss for every GC it was bid to, per Fern's call)
  const byGCMap = new Map();
  for (const b of decided) {
    for (const gc of (b.gc || [])) {
      if (!gc) continue;
      if (!byGCMap.has(gc)) byGCMap.set(gc, []);
      byGCMap.get(gc).push({ won: b.status === WON, rate: b.bidRate || 0 });
    }
  }
  const byGC = [...byGCMap.entries()]
    .map(([g, entries]) => summarize(g, entries))
    .filter((s) => s.decided > 0)
    .sort((a, b) => (b.decided - a.decided) || ((a.rate ?? 1) - (b.rate ?? 1)));

  return { overall, byType, byGC, windowMonths, target: WIN_RATE_TARGET };
}
