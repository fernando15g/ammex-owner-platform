// GET /api/notion-options?db=bids — the real option lists behind Notion's
// multi-select fields (GC, Fabricator, Project Type).
//
// Why this exists: those were free-text boxes. Notion CREATES an option for any
// name it hasn't seen, so "CMC", "cmc" and "C.M.C." quietly became three
// different fabricators — and grouping or filtering by fabricator silently broke.
// Reading the real options lets the app offer them as a dropdown, and makes
// adding a genuinely new one a deliberate act rather than a typo.
import { NextResponse } from "next/server";
import { getDatabaseSchema } from "@/lib/notion/client";
import { DB } from "@/lib/notion/ids";

export const dynamic = "force-dynamic";

const FIELDS = {
  bids: { db: DB.BID_TRACKER, props: ["GC", "Fabricator", "Project Type"] },
  projects: { db: DB.PROJECTS, props: ["Foreman"] },
};

export async function GET(req) {
  try {
    const which = new URL(req.url).searchParams.get("db") || "bids";
    const cfg = FIELDS[which];
    if (!cfg) throw new Error(`Unknown option set: ${which}`);

    const schema = await getDatabaseSchema(cfg.db);
    const out = {};
    for (const name of cfg.props) {
      const prop = schema.properties?.[name];
      const opts = prop?.multi_select?.options || prop?.select?.options || [];
      out[name] = opts.map((o) => o.name).sort((a, b) => a.localeCompare(b));
    }
    return NextResponse.json({ ok: true, options: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
