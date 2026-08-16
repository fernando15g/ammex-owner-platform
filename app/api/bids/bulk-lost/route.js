// Bulk mark bids Lost in ONE request. The per-bid route reads project attachment
// for each bid separately; here we read the Projects table ONCE, check every bid
// against it, then mark the safe ones lost and close their line items. Bids with
// a project built on them are returned as "blocked" (not marked), same rule as
// the single path — just batched so bulk isn't N full round-trips.
import { NextResponse } from "next/server";
import { queryAll } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";
import { updateBid } from "@/lib/notion/bidRepository";
import { closeLineItemsForBid } from "@/lib/notion/lineItemRepository";
import { audit } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("No bids provided");

    // ONE read of all projects; build a set of bid ids that have a project on them.
    const projectPages = await queryAll(DB.PROJECTS);
    const attachedBidIds = new Set();
    const attachedName = {};
    for (const pg of projectPages) {
      const rel = pg.properties?.["Related Bid"]?.relation || [];
      const nm = pg.properties?.["Actual Project Name"]?.title?.[0]?.plain_text || "(unnamed project)";
      for (const r of rel) { attachedBidIds.add(r.id); if (!attachedName[r.id]) attachedName[r.id] = nm; }
    }

    const marked = [], blocked = [];
    for (const id of ids) {
      if (attachedBidIds.has(id)) {
        blocked.push({ id, error: `Attached to project "${attachedName[id]}" — detach it first.` });
        continue;
      }
      try {
        await updateBid(id, { status: "Lost" });
        await closeLineItemsForBid(id);
        marked.push(id);
        await new Promise((r) => setTimeout(r, 80)); // pace writes under Notion's limit
      } catch (e) {
        blocked.push({ id, error: String(e.message || e) });
      }
    }

    // one audit entry for the batch
    try {
      await audit({
        actor: currentActor(), action: "Update", entity: "Bid",
        entityName: `${marked.length} bids`, entityId: marked[0] || "",
        changes: `Bulk marked ${marked.length} bids Lost`,
      });
    } catch {}

    return NextResponse.json({ ok: true, marked, blocked });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
