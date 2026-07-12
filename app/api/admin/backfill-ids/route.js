// POST /api/admin/backfill-ids — one-time (idempotent) migration prep.
//
// Does three things, in order:
//   1. Gives every existing LINE ITEM a Line ID (LI-000001…)
//   2. Gives every existing BILLING EVENT an Event ID (EV-000001…)
//   3. Rewrites every money snapshot — [snap] on invoices, [carry] on payments —
//      so its line references carry the application-owned Line ID (`lid`)
//      alongside the old Notion page id.
//
// Step 3 is the point of the exercise. Until it runs, your invoices identify the
// line items they billed by NOTION PAGE ID — which becomes a dead reference the
// moment the data lives anywhere else. After it runs, the money records point at
// IDs the application owns, and a database swap stops being archaeology.
//
// Safe to run repeatedly: anything already carrying an ID is left alone.
// Run with ?dry=1 to see what WOULD change without writing anything.
import { NextResponse } from "next/server";
import { getAllLineItems, updateLineItem, allocateLineIds } from "@/lib/notion/lineItemRepository";
import { getAllBillingEvents, updateBillingEvent, allocateEventIds } from "@/lib/notion/billingRepository";
import { readTag, writeTag } from "@/lib/rules/mutations";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const report = { dryRun: dry, linesIdAssigned: 0, eventsIdAssigned: 0, snapshotsRewritten: 0, carriesRewritten: 0, unresolved: [] };

    // ---- 1. Line IDs --------------------------------------------------------
    const lines = await getAllLineItems();
    const linesMissing = lines.filter((l) => !l.lineId);
    if (linesMissing.length) {
      const ids = await allocateLineIds(linesMissing.length);
      for (let i = 0; i < linesMissing.length; i++) {
        if (!dry) await updateLineItem(linesMissing[i].id, { lineId: ids[i] });
        linesMissing[i].lineId = ids[i]; // keep the in-memory copy current for step 3
        report.linesIdAssigned++;
      }
    }
    // page id -> app id, for rewriting the snapshots
    const appIdByPage = new Map(lines.filter((l) => l.lineId).map((l) => [l.id, l.lineId]));

    // ---- 2. Event IDs -------------------------------------------------------
    const events = await getAllBillingEvents();
    const eventsMissing = events.filter((e) => !e.eventId);
    if (eventsMissing.length) {
      const ids = await allocateEventIds(eventsMissing.length);
      for (let i = 0; i < eventsMissing.length; i++) {
        if (!dry) await updateBillingEvent(eventsMissing[i].id, { eventId: ids[i] });
        report.eventsIdAssigned++;
      }
    }

    // ---- 3. Rewrite the money snapshots -------------------------------------
    for (const ev of events) {
      let notes = ev.notes || "";
      let touched = false;

      const snap = readTag(notes, "snap");
      if (snap?.lines?.length && snap.lines.some((l) => !l.lid)) {
        snap.lines = snap.lines.map((l) => {
          if (l.lid) return l;
          const lid = appIdByPage.get(l.id) || null;
          if (!lid) report.unresolved.push({ event: ev.invoiceNumber || ev.id, tag: "snap", pageId: l.id });
          return { ...l, lid };
        });
        notes = writeTag(notes, "snap", snap);
        touched = true;
        report.snapshotsRewritten++;
      }

      const carry = readTag(notes, "carry");
      if (carry?.lines?.length && carry.lines.some((l) => !l.lid)) {
        carry.lines = carry.lines.map((l) => {
          if (l.lid) return l;
          const lid = appIdByPage.get(l.id) || null;
          if (!lid) report.unresolved.push({ event: ev.invoiceNumber || ev.id, tag: "carry", pageId: l.id });
          return { ...l, lid };
        });
        notes = writeTag(notes, "carry", carry);
        touched = true;
        report.carriesRewritten++;
      }

      if (touched && !dry) await updateBillingEvent(ev.id, { notes });
    }

    report.ok = true;
    report.summary = dry
      ? `DRY RUN — would assign ${report.linesIdAssigned} Line IDs and ${report.eventsIdAssigned} Event IDs, and rewrite ${report.snapshotsRewritten} invoice snapshots + ${report.carriesRewritten} short-pay records.`
      : `Assigned ${report.linesIdAssigned} Line IDs and ${report.eventsIdAssigned} Event IDs. Rewrote ${report.snapshotsRewritten} invoice snapshots and ${report.carriesRewritten} short-pay records to use application-owned IDs.`;

    if (report.unresolved.length) {
      report.warning =
        `${report.unresolved.length} snapshot reference(s) point at line items that no longer exist ` +
        `(deleted or archived). They keep their old page id and still resolve to nothing — the same as before. ` +
        `Listed under "unresolved".`;
    }

    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
