import { getProjectBillingWithLines } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import ProjectBillingClient from "./ProjectBillingClient";

export const dynamic = "force-dynamic";

export default async function ProjectBillingPage({ params }) {
  let data = null, error = null;
  try { data = await getProjectBillingWithLines(params.id); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="billing" breadcrumbs={[{ label: "All billing", href: "/billing" }, { label: data?.projectId || data?.name || "Project" }]} title={data?.name || "Project billing"}>
      {error ? <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load: {error}</div> : !data ? <div className="text-rebar">Project not found.</div> : <ProjectBillingClient data={data} />}
    </AppShell>
  );
}
