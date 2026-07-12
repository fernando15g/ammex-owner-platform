import AppShell from "@/app/components/AppShell";
import HistoryClient from "./HistoryClient";
import { getAuditLog, isAuditConfigured } from "@/lib/notion/auditRepository";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  let entries = [], error = null;
  const configured = isAuditConfigured();
  if (configured) {
    try { entries = await getAuditLog({ limit: 300 }); } catch (e) { error = String(e.message || e); }
  }
  return (
    <AppShell current="history" breadcrumbs={[{ label: "History" }]} title="History">
      <HistoryClient entries={entries} configured={configured} error={error} />
    </AppShell>
  );
}
