// Bid detail — full page (roomy for editing; URL pattern maps cleanly to the
// future Postgres migration). Server fetches, client handles view/edit.
import { getBidDetail } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import BidDetailClient from "./BidDetailClient";

export const dynamic = "force-dynamic";

export default async function BidDetailPage({ params }) {
  let bid = null, error = null;
  try { bid = await getBidDetail(params.id); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="pipeline" subtitle="Pipeline" title={bid?.name || "Bid"}>
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load bid: {error}</div>
      ) : (
        <BidDetailClient bid={bid} />
      )}
    </AppShell>
  );
}
