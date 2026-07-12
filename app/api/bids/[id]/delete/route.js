// POST /api/bids/[id]/delete — delete a bid, guarded.
// Blocked if the bid became a project (the project resolves its line items — and
// therefore its contract value — through this bid) or if its lines have been
// billed. In both cases: mark it Lost / No Bid instead.
// Its unbilled line items are archived with it, so no orphans are left behind.
import { NextResponse } from "next/server";
import { getPage, archivePage } from "@/lib/notion/client";
import { getAllLineItems } from "@/lib/notion/lineItemRepository";
import { getEverything } from "@/lib/data";
import { planBidDelete } from "@/lib/rules/mutations";
import { withTransaction } from "@/lib/data/tx";

export const dynamic = "force-dynamic";

export async function POST(req, { params }) {
  try {
    const [data, lines] = await Promise.all([getEverything(), getAllLineItems()]);
    const bid = data.bids.find((b) => b.id === params.id);
    if (!bid) throw new Error("Bid not found.");

    const plan = planBidDelete(bid, data.projects, lines);
    if (!plan.canDelete) {
      return NextResponse.json({ ok: false, blocked: true, error: plan.reason }, { status: 409 });
    }

    await withTransaction(async () => {
      for (const lineId of plan.lineItemsToArchive) await archivePage(lineId);
      await archivePage(params.id);
    });

    return NextResponse.json({ ok: true, deleted: true, linesArchived: plan.lineItemsToArchive.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
