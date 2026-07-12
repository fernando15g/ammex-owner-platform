import { getPipeline } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  let data = null, error = null;
  try { data = await getPipeline(); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="pipeline" breadcrumbs={[{ label: "All bids" }]} title="Bids"
      actions={<a href="/bids/new" className="text-sm px-3.5 py-2 rounded-md bg-safety text-steel font-medium">+ New Bid</a>}>
      {error ? <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load bids: {error}</div> : <PipelineClient data={data} />}
    </AppShell>
  );
}
