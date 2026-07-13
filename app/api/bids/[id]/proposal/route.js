// GET /api/bids/[id]/proposal — the itemized proposal, as an .xlsx.
//
// It's the real template with the line items dropped in, so it opens in Excel
// exactly as it always has: same logo, same terms, same formats, live formulas.
// She can adjust anything before it goes out, or export a PDF from Excel — the
// step she already knows.
//
// Deliberately NOT a rebuilt-from-scratch PDF: a GC's AP department has been
// receiving this exact document for years, and a document that looks different
// is a document that gets queried.
import { NextResponse } from "next/server";
import { getBidSheet } from "@/lib/data";
import { buildProposal, proposalFilename } from "@/lib/documents/proposal";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  try {
    const { bid, items } = await getBidSheet(params.id);
    if (!bid) throw new Error("Bid not found.");
    if (!items.length) throw new Error("This bid has no line items — build the bid sheet first.");

    const wb = await buildProposal({ bid, items });
    const buf = await wb.xlsx.writeBuffer();

    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${proposalFilename(bid)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
