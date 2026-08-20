import { getProjectAdmin } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import ProjectForm from "@/app/projects/ProjectForm";
import POEmailButton from "@/app/projects/POEmailButton";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }) {
  let data = null, error = null;
  try { data = await getProjectAdmin(params.id); } catch (e) { error = String(e.message || e); }
  const proj = data?.project;
  const isClosed = proj && /closed|complete/i.test(proj.status || "");
  return (
    <AppShell current="active" breadcrumbs={[{ label: "Active work", href: "/active" }, { label: proj?.name || "Project" }]} title={proj?.name || "Project"}>
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load: {error}</div>
      ) : !proj ? (
        <div className="text-rebar">Project not found.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <POEmailButton project={proj} mode="open" />
            {isClosed && <POEmailButton project={proj} mode="close" />}
          </div>
          <ProjectForm project={proj} bidOptions={data.bidOptions} />
        </>
      )}
    </AppShell>
  );
}
