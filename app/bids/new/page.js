import AppShell from "@/app/components/AppShell";
import NewBidForm from "./NewBidForm";

export const dynamic = "force-dynamic";

export default function NewBidPage() {
  return (
    <AppShell current="pipeline" subtitle="Bids" title="New bid"
      actions={<span className="text-xs text-rebar">Metadata + tracking · pricing stays in the calculator</span>}>
      <NewBidForm />
    </AppShell>
  );
}
