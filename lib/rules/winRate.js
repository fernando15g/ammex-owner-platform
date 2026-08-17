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
// Median resists outliers — with tiny samples (4-9 bids) and the occasional
// moonshot bid, the mean lies (one 140¢ win drags the "average won price" up
// past the losses). Median = the typical bid, which is what we actually want.
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

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
    wonMedRate: median(wonRates), lostMedRate: median(lostRates),
    wonRange: range(wonRates), lostRange: range(lostRates),
    dots: entries.filter((e) => e.rate > 0).map((e) => ({ rate: e.rate, won: e.won })),
    lowSample: entries.length < 4,
  };
}

// Sort: segments with wins first (highest volume, then lowest win-rate so the
// "losing a lot but not zero" ones surface), then the 0%-win segments at the
// very bottom (still visible — they're real signal — just deprioritized).
function segSort(a, b) {
  const aZero = !a.rate;   // 0 or null
  const bZero = !b.rate;
  if (aZero !== bZero) return aZero ? 1 : -1;      // zeros sink
  return (b.decided - a.decided) || ((a.rate ?? 1) - (b.rate ?? 1));
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
    .sort(segSort);

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
    .sort(segSort);

  return { overall, byType, byGC, windowMonths, target: WIN_RATE_TARGET };
}
