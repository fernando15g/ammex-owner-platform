// Bid Sheet — the itemized proposal (mimics the Excel template). Line items are
// born here; the same list becomes the billing schedule when the job is won.
import { getBidSheet } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import BidSheetClient from "./BidSheetClient";

export const dynamic = "force-dynamic";

export default async function BidSheetPage({ params }) {
  let data = null, error = null;
  try { data = await getBidSheet(params.id); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="pipeline" subtitle="Bid sheet" title={data?.bid?.name || "Bid sheet"}>
      {error ? <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load: {error}</div> : <BidSheetClient data={data} />}
    </AppShell>
  );
}
