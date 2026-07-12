import { getProjectAdmin } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import ProjectForm from "@/app/projects/ProjectForm";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }) {
  let data = null, error = null;
  try { data = await getProjectAdmin(params.id); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="active" breadcrumbs={[{ label: "Active work", href: "/active" }, { label: data?.project?.name || "Project" }]} title={data?.project?.name || "Project"}>
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load: {error}</div>
      ) : !data?.project ? (
        <div className="text-rebar">Project not found.</div>
      ) : (
        <ProjectForm project={data.project} bidOptions={data.bidOptions} takenBidIds={data.takenBidIds} />
      )}
    </AppShell>
  );
}
