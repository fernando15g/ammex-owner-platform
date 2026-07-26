// GET /api/projects/[id]/summary — everything worth knowing about a project
// WHILE BILLING, in one shot. Read-only.
import { NextResponse } from "next/server";
import { getProjectBillingWithLines } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const d = await getProjectBillingWithLines(params.id);
    if (!d) throw new Error("Project not found.");
    const b = d.billing;

    // Pounds billed IS pounds placed — installed-pounds was killed as a manual
    // field precisely because what you've billed is what you've put in the ground.
    const billedLbs = d.lines.reduce((a, l) => a + (l.qtyToDate || 0), 0);
    const estimatedLbs = d.lines.reduce((a, l) => a + (l.quantity || 0), 0) || d.bid?.estimatedLbs || null;

    // The productivity indicator: is the job beating the bid, or losing to it?
    // Use the RESOLVED hours (timesheet / payroll / combined), the same figure
    // Active Work shows — not the raw payroll number, or the two would disagree.
    const payrollHours = d.hours?.hours ?? d.payrollHours ?? null;
    // lbs/MH measures rebar output, so the bid's specialty (PT/mesh) hours come
    // out of the denominator — same correction performance.js applies. Labour
    // hours DISPLAY stays total (that's real time worked).
    const specH = Number(d.bid?.specialtyHours) || 0;
    const prodHours = payrollHours != null && specH > 0 && payrollHours > specH ? payrollHours - specH : payrollHours;
    const actualLbsPerMH = prodHours > 0 ? billedLbs / prodHours : null;
    const estimatedLbsPerMH = d.bid?.productivity ?? null;
    const productivityDelta =
      actualLbsPerMH != null && estimatedLbsPerMH > 0
        ? ((actualLbsPerMH - estimatedLbsPerMH) / estimatedLbsPerMH) * 100
        : null;

    return NextResponse.json({
      ok: true,
      summary: {
        name: d.name,
        projectId: d.projectId,
        status: d.status,
        gc: d.bid?.gc || [],
        relatedBidId: d.relatedBidId,
        actualStartDate: d.actualStartDate ?? null,

        contractValue: b.revisedContract,
        bidRate: d.bid?.bidRate ?? null,
        billedToDate: b.billedToDate,
        remainingToBill: b.remainingToBill,
        outstanding: b.outstanding,
        retentionEnabled: b.retentionEnabled,
        retentionHeld: b.retention,
        retentionPercent: d.settings?.retentionPercent ?? null,

        estimatedLbs,
        billedLbs,
        pctComplete: estimatedLbs > 0 ? (billedLbs / estimatedLbs) * 100 : null,
        payrollHours,
        actualLbsPerMH,
        estimatedLbsPerMH,
        productivityDelta,
        beatingBid: productivityDelta != null ? productivityDelta >= 0 : null,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
