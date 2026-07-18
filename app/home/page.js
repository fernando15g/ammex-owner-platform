import { getHome } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import HomeClient from "./HomeClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let data = null, error = null;
  try { data = await getHome(); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="home" title="Home">
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">
          Couldn&apos;t load Home: {error}
        </div>
      ) : (
        <HomeClient data={data} />
      )}
    </AppShell>
  );
}
