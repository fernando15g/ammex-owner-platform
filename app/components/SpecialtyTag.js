// Small tag marking a bid or job that carries specialty scope, so post-tension
// and mesh work is visible from a list instead of only inside the bid.
//
// "PT Bridge" and "PT Building" both collapse to PT — at a glance what matters
// is whether there IS post-tension work; the exact type shows on the bid page.
//
// Reads the stored "Specialty Type" column, so it marks bids the calculator
// priced or that used the specialty editor. Older jobs entered before that
// column existed will not be tagged.
export default function SpecialtyTag({ types }) {
  const list = Array.isArray(types) ? types : [];
  if (list.length === 0) return null;
  const tags = [];
  if (list.some((t) => String(t).startsWith("PT"))) tags.push("PT");
  if (list.some((t) => String(t) === "Mesh")) tags.push("Mesh");
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((t) => (
        <sup key={t}
          className="ml-1 align-super text-[9px] font-semibold uppercase tracking-wide text-safety whitespace-nowrap">
          {t}
        </sup>
      ))}
    </>
  );
}
