// =============================================================================
// WIN RATE — how often we win the bids we actually compete for.
//
// A bid is "decided" only if it's Awarded or Lost. In-flight bids (Submitted,
// Negotiating, etc.) have no outcome yet; No Bid means we chose not to compete,
// so it's neither a win nor a loss. Win rate = Awarded / (Awarded + Lost).
//
// Windowed by the bid's submission date (fallback: bid due date) so we can see
// CURRENT pricing behavior, not ancient history. Sample counts travel with every
// number so a "0% (0 of 1)" reads as thin data, not alarm.
// =============================================================================

const WON = "Awarded";
const LOST = "Lost";

function bidDateOf(b) {
  return b.submissionDate || b.bidDueDate || null;
}

function inWindow(b, sinceMs) {
  if (sinceMs == null) return true; // all-time
  const d = bidDateOf(b);
  if (!d) return false;
  const t = new Date(d).getTime();
  return !isNaN(t) && t >= sinceMs;
}

// A bid's primary project type (first tag). Untyped -> "Unclassified".
function typeOf(b) {
  const t = (b.projectType || [])[0];
  return t || "Unclassified";
}

export function computeWinRate(bids, { windowMonths = 12 } = {}) {
  const sinceMs = windowMonths == null ? null
    : (() => { const d = new Date(); d.setMonth(d.getMonth() - windowMonths); return d.getTime(); })();

  const decided = (bids || []).filter(
    (b) => (b.status === WON || b.status === LOST) && inWindow(b, sinceMs)
  );

  const won = decided.filter((b) => b.status === WON);
  const lost = decided.filter((b) => b.status === LOST);
  const overall = {
    won: won.length,
    lost: lost.length,
    decided: decided.length,
    rate: decided.length ? won.length / decided.length : null,
  };

  // by project type
  const byTypeMap = new Map();
  for (const b of decided) {
    const t = typeOf(b);
    if (!byTypeMap.has(t)) byTypeMap.set(t, { type: t, won: 0, lost: 0, wonRates: [], lostRates: [] });
    const e = byTypeMap.get(t);
    if (b.status === WON) { e.won++; if (b.bidRate > 0) e.wonRates.push(b.bidRate); }
    else { e.lost++; if (b.bidRate > 0) e.lostRates.push(b.bidRate); }
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const byType = [...byTypeMap.values()].map((e) => ({
    type: e.type,
    won: e.won,
    lost: e.lost,
    decided: e.won + e.lost,
    rate: (e.won + e.lost) ? e.won / (e.won + e.lost) : null,
    wonAvgRate: avg(e.wonRates),   // avg bid ¢/lb on wins — the "is it price?" signal
    lostAvgRate: avg(e.lostRates), // avg bid ¢/lb on losses
    lowSample: (e.won + e.lost) < 4, // flag thin data
  }))
  // surface the actionable ones: decent volume, lower win rate, first
  .sort((a, b) => (b.decided - a.decided) || ((a.rate ?? 1) - (b.rate ?? 1)));

  return { overall, byType, windowMonths };
}
