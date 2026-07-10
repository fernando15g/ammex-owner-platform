// Bid detail — full page. Also fetches the bid's line items so the header
// button can show "Create bid sheet" vs "View bid sheet".
import { getBidSheet } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import BidDetailClient from "./BidDetailClient";

export const dynamic = "force-dynamic";

export default async function BidDetailPage({ params }) {
  let bid = null, lineItemCount = 0, error = null;
  try {
    const sheet = await getBidSheet(params.id);
    bid = sheet.bid;
    lineItemCount = sheet.items.length;
  } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="pipeline" subtitle="Pipeline" title={bid?.name || "Bid"}>
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load bid: {error}</div>
      ) : (
        <BidDetailClient bid={bid} lineItemCount={lineItemCount} />
      )}
    </AppShell>
  );
}
