// POST /api/admin/setup-audit — stand up the audit log database in Notion.
//
// Creates it as a sibling of the Bid Tracker (same parent page), so it lands
// where the rest of the Ammex data lives. Returns the new database id, which
// then goes into Vercel as AUDIT_DB_ID.
//
// If Notion won't allow it (the databases live at workspace root rather than
// under a page), it says so and hands back the exact spec to create by hand.
import { NextResponse } from "next/server";
import { getDatabaseSchema, createDatabase } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";
import { AUDIT_DB } from "@/lib/notion/auditRepository";

export const dynamic = "force-dynamic";

const SPEC = {
  Summary: { title: {} },
  Actor: { rich_text: {} },
  Action: { select: { options: [
    { name: "Create" }, { name: "Update" }, { name: "Delete" }, { name: "Void" },
  ] } },
  Entity: { select: { options: [
    { name: "Bid" }, { name: "Project" }, { name: "Line Item" },
    { name: "Invoice" }, { name: "Payment" }, { name: "Change Order" },
  ] } },
  "Entity Name": { rich_text: {} },
  "Entity ID": { rich_text: {} },
  Changes: { rich_text: {} },
  At: { date: {} },
};

export async function POST() {
  try {
    if (AUDIT_DB) {
      return NextResponse.json({ ok: true, alreadyConfigured: true, databaseId: AUDIT_DB });
    }

    const bidDb = await getDatabaseSchema(DB.BID_TRACKER);
    const parent = bidDb.parent || {};

    if (parent.type !== "page_id" || !parent.page_id) {
      return NextResponse.json({
        ok: false,
        manual: true,
        error:
          "Your databases don't live under a parent page, so Notion won't let the app create one there. " +
          "Create a database called \"Audit Log\" in Notion by hand, share it with the integration, and set its ID as AUDIT_DB_ID in Vercel.",
        spec: Object.entries(SPEC).map(([name, def]) => ({
          name,
          type: Object.keys(def)[0],
          options: def.select?.options?.map((o) => o.name) || undefined,
        })),
      }, { status: 400 });
    }

    const created = await createDatabase({
      parentPageId: parent.page_id,
      title: "Audit Log",
      properties: SPEC,
    });

    return NextResponse.json({
      ok: true,
      databaseId: created.id,
      next:
        "Add this as AUDIT_DB_ID in Vercel (Settings → Environment Variables), then redeploy. " +
        "Until then, changes are made normally but nothing is recorded.",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
