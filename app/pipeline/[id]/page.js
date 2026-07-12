// Bid detail — full page. Also fetches the bid's line items so the header
// button can show "Create bid sheet" vs "View bid sheet".
import { getBidSheet, getEverything } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import BidDetailClient from "./BidDetailClient";

export const dynamic = "force-dynamic";

export default async function BidDetailPage({ params }) {
  let bid = null, lineItemCount = 0, linkedProject = null, error = null;
  try {
    const [sheet, all] = await Promise.all([getBidSheet(params.id), getEverything()]);
    bid = sheet.bid;
    lineItemCount = sheet.items.length;
    const proj = all.projects.find((p) => (p.relatedBidIds || []).includes(params.id));
    linkedProject = proj ? { id: proj.id, name: proj.name, projectId: proj.projectId } : null;
  } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="pipeline" breadcrumbs={[{ label: "All bids", href: "/pipeline" }, { label: bid?.name || "Bid" }]} title={bid?.name || "Bid"}>
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load bid: {error}</div>
      ) : (
        <BidDetailClient bid={bid} lineItemCount={lineItemCount} linkedProject={linkedProject} />
      )}
    </AppShell>
  );
}
