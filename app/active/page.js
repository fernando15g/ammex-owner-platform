// Active Work — server component: fetch through the data layer, render the client table.
import { getActiveWork } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import ActiveWorkClient from "./ActiveWorkClient";

export const dynamic = "force-dynamic";

export default async function ActiveWorkPage() {
  let data = null;
  let error = null;
  try {
    data = await getActiveWork();
  } catch (e) {
    error = String(e.message || e);
  }

  return (
    <AppShell current="active" breadcrumbs={[{ label: "Active work" }]} title="Active Work"
      actions={<a href="/projects/new" className="text-sm px-3.5 py-2 rounded-md bg-safety text-steel font-medium">+ New project</a>}>
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">
          Couldn&apos;t load projects: {error}
        </div>
      ) : (
        <ActiveWorkClient data={data} />
      )}
    </AppShell>
  );
}
