import { getProjectAdmin } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import ProjectForm from "@/app/projects/ProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({ searchParams }) {
  let data = null, error = null;
  try { data = await getProjectAdmin(null); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="active" subtitle="Projects" title="New project">
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load: {error}</div>
      ) : (
        <ProjectForm
          bidOptions={data.bidOptions}
          takenBidIds={data.takenBidIds}
          presetBidId={searchParams?.fromBid || null}
          presetName={searchParams?.name || ""}
        />
      )}
    </AppShell>
  );
}
