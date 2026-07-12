"use client";

// HISTORY — who changed what, when. Append-only: nothing in the app edits or
// deletes an entry, which is the entire point of it.

import { useState } from "react";

const ENTITIES = ["All", "Bid", "Project", "Line Item", "Invoice", "Payment", "Change Order"];

const when = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const TONE = {
  Create: "text-ok border-ok/40",
  Update: "text-info border-info/40",
  Delete: "text-danger border-danger/40",
  Void: "text-warn border-warn/40",
};

export default function HistoryClient({ entries, configured, error }) {
  const [entity, setEntity] = useState("All");
  const [who, setWho] = useState("All");

  const actors = ["All", ...new Set(entries.map((e) => e.actor).filter(Boolean))];
  const shown = entries.filter(
    (e) => (entity === "All" || e.entity === entity) && (who === "All" || e.actor === who)
  );

  if (!configured) {
    return (
      <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 max-w-2xl">
        <p className="text-concrete font-medium mb-1">History isn&apos;t recording yet</p>
        <p className="text-sm text-rebar">
          The audit log needs its Notion database. Go to <a href="/check" className="text-info hover:underline">System Check</a> and
          run the audit-log setup — then add the database ID it gives you to Vercel as <code className="text-concrete">AUDIT_DB_ID</code> and redeploy.
        </p>
        <p className="text-xs text-rebar/80 mt-2">
          Until then, changes still work normally — they just aren&apos;t being recorded. Nothing that happens
          before this is switched on can be recovered later.
        </p>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border border-danger/50 bg-danger/10 p-4 text-sm text-concrete/80">Couldn&apos;t load history: {error}</div>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {ENTITIES.map((e) => (
          <button
            key={e}
            onClick={() => setEntity(e)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              entity === e ? "bg-safety text-steel border-safety font-medium" : "border-line text-rebar hover:text-concrete"
            }`}
          >
            {e}
          </button>
        ))}
        {actors.length > 2 && (
          <select value={who} onChange={(e) => setWho(e.target.value)} className="inp text-xs ml-2" style={{ width: "auto" }}>
            {actors.map((a) => <option key={a} value={a}>{a === "All" ? "Everyone" : a}</option>)}
          </select>
        )}
      </div>

      <div className="rounded-lg border border-line overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 720 }}>
          <thead>
            <tr className="bg-graphite text-rebar text-[11px] uppercase tracking-wider">
              <th className="text-left font-medium px-4 py-2.5 w-40">When</th>
              <th className="text-left font-medium px-3 py-2.5 w-28">Who</th>
              <th className="text-left font-medium px-3 py-2.5 w-24">Action</th>
              <th className="text-left font-medium px-3 py-2.5 w-32">What</th>
              <th className="text-left font-medium px-4 py-2.5">Change</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="px-4 py-2.5 text-concrete/70 whitespace-nowrap">{when(e.at)}</td>
                <td className="px-3 py-2.5 text-concrete">{e.actor || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block text-xs rounded-full px-2 py-0.5 border whitespace-nowrap ${TONE[e.action] || "text-concrete border-line"}`}>
                    {e.action}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-concrete/80 whitespace-nowrap">
                  {e.entity}
                  {e.entityName ? <span className="text-rebar text-xs block">{e.entityName}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-rebar text-xs">{e.changes || "—"}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-rebar">Nothing recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-rebar mt-3">
        Append-only — entries are never edited or deleted. If a change isn&apos;t here, it happened before
        history was switched on.
      </p>
    </div>
  );
}
