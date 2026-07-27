// GET /api/bids/export?ids=<id,id,...> — Excel of EXACTLY the bids the person
// is looking at, in the on-screen order. The client sends the visible row ids,
// so the export can never disagree with the filters: what you see is what you
// export, and there's no second filter UI to keep in sync.
//
// Built from scratch (no template round-trip) and deliberately WITHOUT
// fitToPage: setting it makes ExcelJS emit <pageSetUpPr> before <outlinePr>,
// which violates the OOXML element order and makes Excel flag the file as
// corrupt — the invoice generator carries a re-zip fix for exactly that. A
// plain worksheet doesn't need the fix because it never touches sheetPr.
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getPipeline } from "@/lib/data";

export const dynamic = "force-dynamic";

const daysSince = (iso) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86400000);
  return Number.isFinite(d) ? d : null;
};

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean);
    const { rows } = await getPipeline();
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Preserve the on-screen order; ignore ids that no longer resolve.
    const picked = ids.length ? ids.map((id) => byId.get(id)).filter(Boolean) : rows;
    if (!picked.length) throw new Error("Nothing to export — no bids matched.");

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Bids");
    ws.columns = [
      { header: "Bid", key: "name", width: 34 },
      { header: "GC", key: "gc", width: 18 },
      { header: "Fabricator", key: "fab", width: 14 },
      { header: "Detailer", key: "detailer", width: 14 },
      { header: "City / County", key: "city", width: 16 },
      { header: "Status", key: "status", width: 14 },
      { header: "Submitted", key: "submitted", width: 12 },
      { header: "Bid due", key: "due", width: 12 },
      { header: "Last follow-up", key: "fu", width: 13 },
      { header: "Days since contact", key: "cold", width: 16 },
      { header: "Est. weight (tons)", key: "tons", width: 15 },
      { header: "Contract value", key: "value", width: 15 },
      { header: "Margin", key: "margin", width: 9 },
    ];

    for (const r of picked) {
      // same anchor logic as the cold-bid alert: follow-up, else submission,
      // else bid due date — so "days since contact" here matches the dashboard.
      const anchor =
        [r.submissionDate, r.lastFollowUp].filter(Boolean).sort().pop() ||
        r.bidDueDate || null;
      const cold = daysSince(anchor);
      ws.addRow({
        name: r.name || "",
        gc: (r.gc || []).join(", "),
        fab: (r.fabricator || []).join(", "),
        detailer: r.detailer || "",
        city: r.cityCounty || "",
        status: r.status || "",
        submitted: r.submissionDate || "",
        due: r.bidDueDate || "",
        fu: r.lastFollowUp || "",
        cold: cold != null && cold >= 0 ? cold : "",
        tons: typeof r.tons === "number" ? Number(r.tons.toFixed(1)) : "",
        value: typeof r.contractValue === "number" ? Math.round(r.contractValue) : "",
        margin: typeof r.operatingMargin === "number" ? r.operatingMargin : "",
      });
    }

    // header styling + practical touches for a working follow-up sheet
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).border = { bottom: { style: "thin" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columns.length } };
    ws.getColumn("value").numFmt = '"$"#,##0';
    ws.getColumn("margin").numFmt = "0.0%";
    ws.getColumn("tons").numFmt = "#,##0.0";

    const buf = await wb.xlsx.writeBuffer();
    const d = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bids-${d}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
