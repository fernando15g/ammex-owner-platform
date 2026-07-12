// Create Bill — the itemized billing screen, mimicking the admin's Excel
// billing template: per line, Estimate Qty | Unit Price | Total Work To Date |
// Previous Work | Work This Estimate, retention off the total, TOTAL DUE.
import { getProjectBillingWithLines } from "@/lib/data";
import AppShell from "@/app/components/AppShell";
import CreateBillClient from "./CreateBillClient";

export const dynamic = "force-dynamic";

export default async function CreateBillPage({ params }) {
  let data = null, error = null;
  try { data = await getProjectBillingWithLines(params.id); } catch (e) { error = String(e.message || e); }
  return (
    <AppShell current="billing" breadcrumbs={[{ label: "All billing", href: "/billing" }, { label: data?.projectId || data?.name || "Project", href: `/billing/${params.id}` }, { label: "New invoice" }]} title={data?.name || "New invoice"}>
      {error ? <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load: {error}</div> : !data ? <div className="text-rebar">Project not found.</div> : <CreateBillClient data={data} />}
    </AppShell>
  );
}
