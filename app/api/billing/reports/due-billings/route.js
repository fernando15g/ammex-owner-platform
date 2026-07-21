// GET /api/billing/reports/due-billings — the company-wide DUE BILLINGS report
// as an .xlsx: every job's invoices and payments with what's still due, then the
// RETENTION BILLINGS section from the retention track. Two tabs: the full
// running ledger (how the report has always read) and an open-items-only view.
import { NextResponse } from "next/server";
import { getEverything } from "@/lib/data";
import { buildDueBillingsReport, dueBillingsFilename } from "@/lib/documents/dueBillings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getAllBillingEvents, groupEventsByProject } = await import("@/lib/notion/billingRepository");
    const [data, events] = await Promise.all([getEverything(), getAllBillingEvents()]);
    const byProject = groupEventsByProject(events);

    const projects = data.projects
      .filter((p) => byProject.has(p.id))
      .map((p) => ({
        projectId: p.projectId,
        name: p.name,
        fabricator: p.bid?.fabricator || [],
        gc: p.bid?.gc || [],
        events: byProject.get(p.id) || [],
      }));

    if (!projects.length) throw new Error("No billing activity yet — the report would be empty.");

    const wb = buildDueBillingsReport(projects, new Date());
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${dueBillingsFilename(new Date())}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
