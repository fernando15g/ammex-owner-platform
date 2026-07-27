// /pipeline/print?ids=<id,id,...> — a clean, print-ready view of exactly the
// bids that were on screen, in the same order. The browser's print dialog does
// the PDF (File → Print → Save as PDF), which keeps the OS dependency-free and
// works the same on desktop and phone. Light background on purpose: this page
// is for paper/PDF, not the dark UI.
import { getPipeline } from "@/lib/data";
import AutoPrint from "./AutoPrint";

export const dynamic = "force-dynamic";

const money = (v) => (typeof v === "number" ? `$${Math.round(v).toLocaleString()}` : "");
const pct = (v) => (typeof v === "number" ? `${(v * 100).toFixed(1)}%` : "");
const daysSince = (iso) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86400000);
  return Number.isFinite(d) ? d : null;
};

export default async function PrintBidsPage({ searchParams }) {
  const ids = (searchParams?.ids || "").split(",").filter(Boolean);
  const { rows } = await getPipeline();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const picked = ids.length ? ids.map((id) => byId.get(id)).filter(Boolean) : rows;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const cell = { padding: "5px 8px", borderBottom: "1px solid #ddd", fontSize: 11, verticalAlign: "top" };
  const head = { ...cell, borderBottom: "2px solid #333", fontWeight: 700, textAlign: "left", whiteSpace: "nowrap" };

  return (
    <div style={{ background: "#fff", color: "#111", fontFamily: "Arial, Helvetica, sans-serif", padding: 24, minHeight: "100vh" }}>
      {/* the app's root layout paints the body dark; this page is for paper */}
      <style>{`body { background: #fff !important; } nav, header { display: none !important; } @media print { body { margin: 0 } }`}</style>
      <AutoPrint />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <h1 style={{ fontSize: 16, margin: 0 }}>Ammex Rebar Placers — Bid List</h1>
          <span style={{ fontSize: 11, color: "#555" }}>{today} · {picked.length} bid{picked.length === 1 ? "" : "s"}</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={head}>Bid</th>
              <th style={head}>GC</th>
              <th style={head}>Detailer</th>
              <th style={head}>Status</th>
              <th style={head}>Submitted</th>
              <th style={head}>Bid due</th>
              <th style={{ ...head, textAlign: "right" }}>Days quiet</th>
              <th style={{ ...head, textAlign: "right" }}>Value</th>
              <th style={{ ...head, textAlign: "right" }}>Margin</th>
            </tr>
          </thead>
          <tbody>
            {picked.map((r) => {
              const anchor = [r.submissionDate, r.lastFollowUp].filter(Boolean).sort().pop() || r.bidDueDate || null;
              const cold = daysSince(anchor);
              return (
                <tr key={r.id}>
                  <td style={cell}>{r.name}{r.cityCounty ? <span style={{ color: "#777" }}> · {r.cityCounty}</span> : null}</td>
                  <td style={cell}>{(r.gc || []).join(", ")}</td>
                  <td style={cell}>{r.detailer || ""}</td>
                  <td style={cell}>{r.status}</td>
                  <td style={cell}>{r.submissionDate || ""}</td>
                  <td style={cell}>{r.bidDueDate || ""}</td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: cold >= 14 ? 700 : 400 }}>{cold != null && cold >= 0 ? cold : ""}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{money(r.contractValue)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{pct(r.operatingMargin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      <p style={{ fontSize: 10, color: "#777", marginTop: 10 }}>
        Days quiet = days since last follow-up, submission, or bid due date (whichever is latest). Bold = 14+ days.
      </p>
    </div>
  );
}
