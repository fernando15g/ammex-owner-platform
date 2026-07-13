// The proposal template — read, replace, or revert.
//
// GET    — download whichever template is currently in use.
// POST   — upload a new one. It's validated, then SAVED, and takes effect
//          immediately. No file to download, nothing to push.
// DELETE — go back to the version baked into the build.
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getTemplateBuffer, putTemplate, resetTemplate, blobConfigured } from "@/lib/documents/templateStore";
import { audit } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

// A template with a column in the wrong place would produce proposals that look
// right and are wrong — and you'd only find out after one reached a GC. So the
// layout is checked before it's ever allowed to generate anything.
async function validate(buf) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch { return { problems: ["That doesn't look like a valid .xlsx file."] }; }

  const ws = wb.worksheets[0];
  if (!ws) return { problems: ["The workbook has no sheets."] };

  const problems = [];
  ["Item No.", "Description", "Quantity", "Unit", "Unit Price", "Extended", "Furn/Inst"].forEach((h, i) => {
    const got = String(ws.getCell(17, i + 1).value ?? "").trim();
    if (got !== h) problems.push(`Row 17, column ${String.fromCharCode(65 + i)} should read "${h}" — found "${got || "(empty)"}".`);
  });
  if (String(ws.getCell("A12").value ?? "").trim() !== "Project Name:") problems.push('Cell A12 should read "Project Name:".');
  if (String(ws.getCell("E12").value ?? "").trim() !== "Proposal Date:") problems.push('Cell E12 should read "Proposal Date:".');

  const total = ws.getCell("F27").value;
  if (!(total && typeof total === "object" && String(total.formula || "").startsWith("SUM("))) {
    problems.push("Cell F27 should hold the total formula (=SUM(F18:F26)).");
  }

  return { problems, hasLogo: (wb.model.media || []).length > 0, sheetName: ws.name };
}

export async function GET() {
  const { buffer, source, uploadedAt } = await getTemplateBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="proposal-template.xlsx"',
      "X-Template-Source": source,
      "X-Template-Updated": uploadedAt ? String(uploadedAt) : "",
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
    if (buf.length > 4_000_000) throw new Error("That file is over 4 MB — too large.");

    const { problems, hasLogo } = await validate(buf);
    if (problems.length) {
      return NextResponse.json({
        ok: false,
        error: "The layout doesn't match what the generator expects, so proposals would come out wrong.",
        problems,
      }, { status: 400 });
    }

    await putTemplate(buf);
    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Bid",
      entityName: "Proposal template",
      entityId: "template",
      changes: `Replaced the proposal template (${(buf.length / 1024).toFixed(0)} KB${hasLogo ? ", logo included" : ", no logo"}).`,
    });

    return NextResponse.json({ ok: true, bytes: buf.length, hasLogo, live: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    await resetTemplate();
    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Bid",
      entityName: "Proposal template",
      entityId: "template",
      changes: "Reverted to the template built into the app.",
    });
    return NextResponse.json({ ok: true, reverted: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
