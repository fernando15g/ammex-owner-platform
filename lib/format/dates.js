// A stored date like "2026-08-04" must be shown as that calendar day, period.
// new Date("2026-08-04") parses as UTC midnight, which in Phoenix (UTC-7) is the
// evening BEFORE — so toLocaleDateString would render "Aug 3". Splitting the
// Y-M-D and building a LOCAL date keeps the day exactly as stored.
export function fmtDateLocal(value, opts = { month: "short", day: "numeric", year: "numeric" }) {
  if (!value) return "—";
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", opts);
}
