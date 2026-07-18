import { getBook } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import BookClient from "./BookClient";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  let data = null, error = null;
  try { data = await getBook(); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="book" breadcrumbs={[{ label: "The Book" }]} title="The Book">
      {error ? (
        <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">
          Couldn&apos;t load The Book: {error}
        </div>
      ) : (
        <BookClient data={data} />
      )}
    </AppShell>
  );
}
