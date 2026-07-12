// GET /api/admin/verify-audit — does the Audit Log database actually match what
// the code expects? Reads the real Notion schema and reports every mismatch by
// name, rather than leaving you to eyeball it.
//
// The failures this catches are the silent kind: a property named "Entity name"
// instead of "Entity Name" doesn't error — it just quietly never records.
import { NextResponse } from "next/server";
import { getDatabaseSchema } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";

export const dynamic = "force-dynamic";

// name -> the Notion property type the code writes
const EXPECTED = {
  "Summary": "title",
  "Actor": "rich_text",
  "Action": "select",
  "Entity": "select",
  "Entity Name": "rich_text",
  "Entity ID": "rich_text",
  "Changes": "rich_text",
  "At": "date",
};

export async function GET() {
  try {
    let schema;
    try {
      schema = await getDatabaseSchema(DB.AUDIT_LOG);
    } catch (e) {
      const msg = String(e.message || e);
      return NextResponse.json({
        ok: false,
        reachable: false,
        error: msg.includes("404")
          ? "Notion can't see this database. The usual cause: it hasn't been shared with the integration. Open the Audit Log database → ⋯ (top right) → Connections → add your Ammex integration."
          : msg,
      });
    }

    const props = schema.properties || {};
    const found = Object.entries(props).map(([name, def]) => ({ name, type: def.type }));

    const problems = [];
    for (const [name, type] of Object.entries(EXPECTED)) {
      const actual = props[name];
      if (!actual) {
        // is it a near-miss? (wrong capitalisation / spacing is the classic)
        const near = found.find((f) => f.name.toLowerCase().replace(/\s+/g, "") === name.toLowerCase().replace(/\s+/g, ""));
        problems.push({
          property: name,
          issue: near
            ? `missing — but there's a property called "${near.name}". The name has to match exactly, including capitals.`
            : `missing — add a ${type === "rich_text" ? "Text" : type} property called "${name}".`,
        });
      } else if (actual.type !== type) {
        problems.push({
          property: name,
          issue: `is a ${actual.type}, but must be ${type === "rich_text" ? "Text" : type}.`,
        });
      }
    }

    const extra = found
      .filter((f) => !EXPECTED[f.name])
      .map((f) => f.name);

    return NextResponse.json({
      ok: problems.length === 0,
      reachable: true,
      title: (schema.title || []).map((t) => t.plain_text).join(""),
      databaseId: DB.AUDIT_LOG,
      problems,
      extraProperties: extra,          // harmless, just noted
      found,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
