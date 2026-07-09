// POST /api/billing/next-invoice — generate the next invoice number for a
// project: {ProjectID}-INV-{N}. Body: { projectId, projectIdLabel }.
import { NextResponse } from "next/server";
import { nextInvoiceNumber } from "@/lib/notion/billingRepository";
export const dynamic = "force-dynamic";
export async function POST(req) {
  try {
    const { projectId, projectIdLabel } = await req.json();
    const invoiceNumber = await nextInvoiceNumber(projectId, projectIdLabel);
    return NextResponse.json({ ok: true, invoiceNumber });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
