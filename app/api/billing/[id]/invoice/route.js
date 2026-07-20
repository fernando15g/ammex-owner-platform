// GET /api/billing/[id]/invoice?bill=<eventId> — the progress-billing invoice
// for one Bill event, as an .xlsx.
//
// It's Fern's real invoice template with the numbers dropped in: same header,
// same SUM() formulas, the 10% retention computing the Total Due — so it opens
// in Excel exactly as her invoices always have. She reviews and exports a PDF
// from Excel, the step she already knows. Deliberately NOT a rebuilt-from-scratch
// PDF: the GC's AP department has received this exact document for years.
//
// [id] is the projectId. ?bill=<eventId> picks which invoice; without it we take
// the most recent Bill event on the project.
import { NextResponse } from "next/server";
import { getProjectBillingWithLines } from "@/lib/data";
import { buildInvoice, invoiceFilename } from "@/lib/documents/invoice";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const data = await getProjectBillingWithLines(params.id);
    if (!data) throw new Error("Project not found.");

    const bills = (data.events || []).filter((e) => e.type === "Bill");
    if (!bills.length) throw new Error("No invoices on this project yet — create a bill first.");

    const url = new URL(req.url);
    const billId = url.searchParams.get("bill");
    // most-recent first (events come sorted desc), so bills[0] is the latest
    const bill = billId ? bills.find((b) => b.id === billId) : bills[0];
    if (!bill) throw new Error("That invoice couldn't be found on this project.");

    if (!data.lines || !data.lines.length) {
      throw new Error("This project has no line items — the invoice needs a bid sheet / schedule of values first.");
    }

    const wb = await buildInvoice({
      project: data,
      bill,
      bills,
      lines: data.lines,
    });
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${invoiceFilename(data, bill)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
