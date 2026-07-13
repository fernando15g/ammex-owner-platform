// Proposal template management.
//
// GET  — download the template currently baked into the app.
// POST — take a new .xlsx, check it's actually a usable template, and hand back
//        the code file that embeds it.
//
// WHY IT WORKS THIS WAY: Vercel's filesystem is read-only, so an uploaded file
// can't simply be saved. And Fern deploys by dragging files into GitHub — there's
// no terminal to run a script in. So the app does the conversion and gives him
// the two files to drop in. No new infrastructure, and it fits the way he
// actually ships.
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { proposalTemplateBuffer } from "@/lib/documents/proposalTemplate";

export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(proposalTemplateBuffer(), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="proposal-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") throw new Error("No file uploaded.");

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > 4_000_000) throw new Error("That file is over 4 MB — too large to embed.");

    // Validate it BEFORE handing back code. A template missing its header row or
    // its total formula would generate proposals that look right and are wrong —
    // exactly the failure you'd only notice after sending one to a GC.
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buf); } catch { throw new Error("That doesn't look like a valid .xlsx file."); }
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("The workbook has no sheets.");

    const problems = [];
    const headers = ["Item No.", "Description", "Quantity", "Unit", "Unit Price", "Extended", "Furn/Inst"];
    headers.forEach((h, i) => {
      const got = String(ws.getCell(17, i + 1).value ?? "").trim();
      if (got !== h) problems.push(`Row 17, column ${String.fromCharCode(65 + i)} should be "${h}" — found "${got || "(empty)"}".`);
    });
    if (String(ws.getCell("A12").value ?? "").trim() !== "Project Name:") {
      problems.push('Cell A12 should read "Project Name:".');
    }
    if (String(ws.getCell("E12").value ?? "").trim() !== "Proposal Date:") {
      problems.push('Cell E12 should read "Proposal Date:".');
    }
    const total = ws.getCell("F27").value;
    if (!(total && typeof total === "object" && String(total.formula || "").startsWith("SUM("))) {
      problems.push("Cell F27 should hold the total formula (=SUM(F18:F26)).");
    }

    if (problems.length) {
      return NextResponse.json({
        ok: false,
        error: "The layout doesn't match what the generator expects, so proposals would come out wrong.",
        problems,
      }, { status: 400 });
    }

    const b64 = buf.toString("base64");
    const code = `// AUTO-GENERATED — the proposal template, embedded as code.
// Replaced via System Check on ${new Date().toISOString().slice(0, 10)}.
//
// It lives here rather than as a loose file because Vercel's build prunes files
// it thinks are unused — which killed the download in production while working
// perfectly in local builds. Code always ships.

export const PROPOSAL_TEMPLATE_B64 = "${b64}";

export function proposalTemplateBuffer() {
  return Buffer.from(PROPOSAL_TEMPLATE_B64, "base64");
}
`;

    return NextResponse.json({
      ok: true,
      bytes: buf.length,
      code,
      sheetName: ws.name,
      rows: ws.rowCount,
      hasLogo: (wb.model.media || []).length > 0,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
