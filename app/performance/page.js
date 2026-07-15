// Performance — server component: fetch through the data layer, render the client.
import { getPerformance } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import PerformanceClient from "./PerformanceClient";

export const dynamic = "force-dynamic";

export default async function PerformancePage() {
  let data = null;
  let error = null;
  try {
    data = await getPerformance();
  } catch (e) {
    error = String(e.message || e);
  }

  return (
    <AppShell current="performance" breadcrumbs={[{ label: "Performance" }]} title="Performance">
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">
          Couldn&apos;t load performance data: {error}
        </div>
      ) : (
        <PerformanceClient data={data} />
      )}
    </AppShell>
  );
}
