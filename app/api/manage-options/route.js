// Manage select/multi-select OPTIONS at the schema level (rename cascades to all
// records; delete removes the choice everywhere). Guarded: GET returns options
// with usage counts; POST performs the action.
//
// Deliberately NOT manageable: Bid Status, Line Type, Billing Basis, Specialty
// Type, crew roles — the app's logic depends on those exact values. They're
// system vocabulary, not user-cleanup fields.
import { NextResponse } from "next/server";
import { getSelectOptionsWithIds, updateSelectOption, queryAll } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";

export const dynamic = "force-dynamic";

const FIELDS = {
  GC:             { db: DB.BID_TRACKER },
  Fabricator:     { db: DB.BID_TRACKER },
  "Project Type": { db: DB.BID_TRACKER },
  Detailer:       { db: DB.BID_TRACKER },
  Foreman:        { db: DB.PROJECTS },
  Unit:           { db: DB.LINE_ITEMS },
};

async function usageCounts(databaseId, propName) {
  const rows = await queryAll(databaseId);
  const counts = {};
  for (const page of rows) {
    const prop = page.properties?.[propName];
    if (!prop) continue;
    const vals = prop.multi_select ? prop.multi_select.map((o) => o.name)
      : prop.select ? [prop.select.name] : [];
    for (const v of vals) if (v) counts[v] = (counts[v] || 0) + 1;
  }
  return counts;
}

export async function GET(req) {
  try {
    const prop = new URL(req.url).searchParams.get("prop");
    const cfg = FIELDS[prop];
    if (!cfg) throw new Error(`Unknown field: ${prop}`);
    const [opts, counts] = await Promise.all([
      getSelectOptionsWithIds(cfg.db, prop),
      usageCounts(cfg.db, prop),
    ]);
    const options = opts.map((o) => ({ ...o, count: counts[o.name] || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, options });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}

export async function POST(req) {
  try {
    const { prop, action, optionId, newName } = await req.json();
    const cfg = FIELDS[prop];
    if (!cfg) throw new Error(`Unknown field: ${prop}`);
    if (!optionId) throw new Error("optionId required");
    await updateSelectOption(cfg.db, prop, { action, optionId, newName });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
