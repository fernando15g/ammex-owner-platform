import AppShell from "@/app/components/AppShell";
import NewBidForm from "./NewBidForm";

export const dynamic = "force-dynamic";

export default function NewBidPage() {
  return (
    <AppShell current="pipeline" breadcrumbs={[{ label: "All bids", href: "/pipeline" }, { label: "New bid" }]} title="New bid"
      actions={<span className="text-xs text-rebar">Price the full bid here — rebar plus PT and mesh</span>}>
      <NewBidForm />
    </AppShell>
  );
}
