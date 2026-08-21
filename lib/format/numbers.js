// =============================================================================
// CANONICAL NUMBER FORMATTING for the whole OS. One source of truth so display
// never drifts between screens. Import these instead of re-defining money/lbs/
// rate helpers per file.
//
// Storage is unchanged: rates live as decimal dollars ($/lb, e.g. 0.4080),
// weights and dollars as plain numbers. These helpers only format for DISPLAY.
// Input stays decimal (you type .4080 / .245 / .25) — see parseRate for reading
// a typed rate back to a number.
// =============================================================================

const isNum = (n) => typeof n === "number" && !isNaN(n);

// MONEY — whole dollars with comma separators: $1,234. Negatives: -$1,234.
export function money(n) {
  if (!isNum(n)) return "—";
  const s = `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
  return n < 0 ? `-${s}` : s;
}

// MONEY (abbreviated) — for tight dashboard tiles only: $1.2M / $12k / $340.
export function moneyShort(n) {
  if (!isNum(n)) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
}

// MONEY with cents — $1,234.56 — for bid sheets / invoices where cents matter.
export function moneyCents(n) {
  if (!isNum(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// WEIGHT — whole pounds with commas and a "lbs" suffix: 1,500,000 lbs.
export function lbs(n) {
  if (!isNum(n)) return "—";
  return `${Math.round(n).toLocaleString("en-US")} lbs`;
}

// WEIGHT, bare — commas, no suffix (for when the column header already says lbs).
export function lbsBare(n) {
  if (!isNum(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

// BID RATE — stored as decimal dollars ($/lb). Display as cents, 2 decimals:
// 0.4080 -> "40.80¢/lb". Handles quarter/half/three-quarter cents cleanly.
export function rate(nDollars) {
  if (!isNum(nDollars)) return "—";
  return `${(nDollars * 100).toFixed(2)}¢/lb`;
}

// BID RATE, bare cents — "40.80¢" (no /lb), for tight columns like the pipeline.
export function rateCents(nDollars) {
  if (!isNum(nDollars)) return "—";
  return `${(nDollars * 100).toFixed(2)}¢`;
}

// PERCENT — 0.25 -> "25%". Optional decimals.
export function pct(f, decimals = 0) {
  if (!isNum(f)) return "—";
  return `${(f * 100).toFixed(decimals)}%`;
}

// NUMBER — commas, optional decimals: 1,234 or 1,234.5.
export function num(n, decimals = 0) {
  if (!isNum(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

// Parse a typed rate (".4080", ".245", ".25", or "0.408") back to a number.
// Input convention is the leading-dot decimal; this just tolerantly reads it.
export function parseRate(str) {
  if (str == null || str === "") return null;
  const n = Number(str);
  return isNaN(n) ? null : n;
}

// --- Null-returning variants (for places that use .filter(Boolean) to drop
// missing values from a joined list, e.g. BidPicker). Same format, but return
// null instead of "—" when the value is absent. ---
export function moneyOrNull(n) { return isNum(n) ? money(n) : null; }
export function lbsOrNull(n) { return isNum(n) ? lbs(n) : null; }

// PRODUCTIVITY — lbs per man-hour. Distinct concept from bid rate; kept separate
// so the two never collide. Whole number by default: 92 -> "92 lbs/MH".
export function lbsPerMH(n, decimals = 0) {
  if (!isNum(n)) return "—";
  return `${n.toFixed(decimals)} lbs/MH`;
}
// Bare productivity number (no suffix), for when a label already says lbs/MH.
export function lbsPerMHBare(n, decimals = 0) {
  if (!isNum(n)) return "—";
  return n.toFixed(decimals);
}
