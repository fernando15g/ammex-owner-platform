// One-time bulk merge of Project Type values on bids, per the agreed 13-bucket
// map. This edits RECORD VALUES (which works through the OS), not the option
// schema (which doesn't). Dry run reports what it would change and writes
// nothing. Execute rewrites each affected bid's Project Type — and ONLY that
// field, so it can't clobber anything else.
import { NextResponse } from "next/server";
import { getEverything } from "@/lib/data";
import { updateBid } from "@/lib/notion/bidRepository";

export const dynamic = "force-dynamic";

// old value -> target value. Anything not listed is left untouched.
const MERGE_MAP = {
  "Water Treatment Facility": "Water Treatment Plant",
  "Tank": "Water Treatment Plant",
  "Building w/ PT": "Building",
  "Multifamily": "Building",
  "Parking Garage": "Building",
  "Commercial Structure": "Commercial/Industrial",
  "Industrial Structure": "Commercial/Industrial",
  "Data Center": "Commercial/Industrial",
  "Self Storage Facility": "Commercial/Industrial",
  "Foundation": "Foundation/Footing",
  "Footing": "Foundation/Footing",
  "Pad": "Foundation/Footing",
  "Spread Footing": "Foundation/Footing",
  "Substation": "Utility/Infrastructure",
  "Light Pole": "Utility/Infrastructure",
  "Transportation": "Utility/Infrastructure",
  "Cage Basin": "Cages",
};

function remap(types) {
  // apply the map, dedupe, preserve anything not in the map
  const out = [];
  for (const t of types || []) {
    const mapped = MERGE_MAP[t] || t;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

export async function POST(req) {
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const all = await getEverything();
    const bids = all.bids || [];

    const changes = [];
    for (const b of bids) {
      const before = b.projectType || [];
      if (before.length === 0) continue;
      const after = remap(before);
      // did anything actually change?
      const changed = before.length !== after.length || before.some((t, i) => t !== after[i]) || before.some((t) => MERGE_MAP[t]);
      if (changed && JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({ id: b.id, name: b.projectName || b.name || "(unnamed)", before, after });
      }
    }

    if (dry) {
      // summarize which merges fire and how often
      const tally = {};
      for (const c of changes) {
        for (const t of c.before) {
          if (MERGE_MAP[t]) {
            const k = `${t} → ${MERGE_MAP[t]}`;
            tally[k] = (tally[k] || 0) + 1;
          }
        }
      }
      return NextResponse.json({ ok: true, dry: true, affected: changes.length, tally, sample: changes.slice(0, 50) });
    }

    // EXECUTE — rewrite only projectType, paced to respect Notion rate limits
    let done = 0; const failures = [];
    for (const c of changes) {
      try {
        await updateBid(c.id, { projectType: c.after });
        done++;
        await new Promise((r) => setTimeout(r, 120)); // ~8/sec, under Notion's 3/sec avg burst limit with headroom
      } catch (e) {
        failures.push({ name: c.name, error: String(e.message || e) });
      }
    }
    return NextResponse.json({ ok: true, dry: false, rewrote: done, failed: failures.length, failures: failures.slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
