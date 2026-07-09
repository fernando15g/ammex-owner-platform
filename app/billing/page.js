import { getBillingOverview } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import BillingOverviewClient from "./BillingOverviewClient";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  let data = null, error = null;
  try { data = await getBillingOverview(); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="billing" subtitle="Due billing" title="Billing & Receivables">
      {error ? <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load billing: {error}</div> : <BillingOverviewClient data={data} />}
    </AppShell>
  );
}
