// POST /api/bids/[id]/submitted — record that the proposal went out.
//
// Downloading the proposal IS the act of submitting it — that's the document you
// email. But it isn't ALWAYS: you might pull it down to proofread. So this is a
// deliberate confirmation rather than a silent side effect. Guessing wrong here
// would put a false submission date on a bid, and dates on bids are evidence.
import { NextResponse } from "next/server";
import { getPage } from "@/lib/notion/client";
import { updateBid } from "@/lib/notion/bidRepository";
import { mapBid } from "@/lib/rules/money";
import { audit } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function POST(req, { params }) {
  try {
    const bid = mapBid(await getPage(params.id));
    const date = todayLocal();

    const changes = { submissionDate: date };
    // only advance the status if the bid hasn't already moved past submitting —
    // a bid in Negotiating shouldn't be dragged backwards by a re-download
    const preSubmit = ["Need Weights", "Reviewing", "Estimating", "Contingent"];
    if (preSubmit.includes(bid.status)) changes.status = "Submitted";

    await updateBid(params.id, changes);
    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Bid",
      entityName: bid.name || "",
      entityId: params.id,
      changes: `Proposal sent — submitted ${date}${changes.status ? `; status ${bid.status} → Submitted` : ""}`,
    });

    return NextResponse.json({ ok: true, submissionDate: date, status: changes.status || bid.status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
