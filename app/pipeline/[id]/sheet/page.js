// Bid Sheet — the itemized proposal (mimics the Excel template). Line items are
// born here; the same list becomes the billing schedule when the job is won.
import { getBidSheet, getEverything } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import BidSheetClient from "./BidSheetClient";

export const dynamic = "force-dynamic";

export default async function BidSheetPage({ params }) {
  let data = null, error = null;
  let linkedProject = null;
  try {
    const [sheet, all] = await Promise.all([getBidSheet(params.id), getEverything()]);
    data = sheet;
    const proj = all.projects.find((p) => (p.relatedBidIds || []).includes(params.id));
    linkedProject = proj ? { id: proj.id, name: proj.name, projectId: proj.projectId } : null;
  } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="pipeline" breadcrumbs={[{ label: "All bids", href: "/pipeline" }, { label: data?.bid?.name || "Bid", href: `/pipeline/${params.id}` }, { label: "Bid sheet" }]} title={data?.bid?.name || "Bid sheet"}>
      {error ? <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load: {error}</div> : <BidSheetClient data={data} linkedProject={linkedProject} />}
    </AppShell>
  );
}
