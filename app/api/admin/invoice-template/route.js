// The invoice template — read, replace, or revert. Same pattern as the proposal
// template, its own storage.
//
// GET    — download whichever invoice template is currently in use.
// POST   — upload a new one. Validated, then SAVED, live immediately.
// DELETE — go back to the version baked into the build.
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getInvoiceTemplateBuffer, putInvoiceTemplate, resetInvoiceTemplate } from "@/lib/documents/templateStore";
import { audit } from "@/lib/notion/auditRepository";
import { currentActor } from "@/lib/actor";

export const dynamic = "force-dynamic";

// A template with a column in the wrong place would produce invoices that look
// right and are wrong — and you'd only find out after one reached a GC's AP.
// So the layout is checked before it's ever allowed to generate anything.
async function validate(buf) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch { return { problems: ["That doesn't look like a valid .xlsx file."] }; }

  const ws = wb.worksheets[0];
  if (!ws) return { problems: ["The workbook has no sheets."] };

  const problems = [];
  const cell = (addr) => String(ws.getCell(addr).value ?? "").trim();

  // Section labels (row 10)
  const secLabels = { C10: "ESTIMATE", E10: "TOTAL WORK TO DATE", G10: "PREVIOUS WORK", I10: "WORK THIS ESTIMATE" };
  for (const [addr, want] of Object.entries(secLabels)) {
    if (cell(addr) !== want) problems.push(`Cell ${addr} should read "${want}" — found "${cell(addr) || "(empty)"}".`);
  }
  // Column subheaders (row 11)
  const subLabels = { A11: "BID NO.", B11: "DESCRIPTION", C11: "QUANTITY", D11: "PRICE" };
  for (const [addr, want] of Object.entries(subLabels)) {
    if (cell(addr) !== want) problems.push(`Cell ${addr} should read "${want}" — found "${cell(addr) || "(empty)"}".`);
  }

  // The per-row amount formula (F12 = SUM(D12*E12)) makes the invoice compute
  // itself from the quantities we fill.
  const f12 = ws.getCell("F12").value;
  if (!(f12 && typeof f12 === "object" && String(f12.formula || "").replace(/\s/g, "").toUpperCase().startsWith("SUM(D12*E12"))) {
    problems.push("Cell F12 should hold the amount formula (=SUM(D12*E12)).");
  }
  // The column total (F29 = SUM(F12:F28)) and the 10% retention (F30 = SUM(F29*10%)).
  const f29 = ws.getCell("F29").value;
  if (!(f29 && typeof f29 === "object" && String(f29.formula || "").replace(/\s/g, "").toUpperCase().startsWith("SUM(F12:F28"))) {
    problems.push("Cell F29 should hold the column total (=SUM(F12:F28)).");
  }
  const f30 = ws.getCell("F30").value;
  if (!(f30 && typeof f30 === "object" && String(f30.formula || "").replace(/\s/g, "").toUpperCase().includes("10%"))) {
    problems.push("Cell F30 should hold the retention formula (=SUM(F29*10%)).");
  }

  return { problems, hasLogo: (wb.model.media || []).length > 0, sheetName: ws.name };
}

export async function GET() {
  const { buffer, source, uploadedAt } = await getInvoiceTemplateBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="invoice-template.xlsx"',
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
        error: "The layout doesn't match what the generator expects, so invoices would come out wrong.",
        problems,
      }, { status: 400 });
    }

    await putInvoiceTemplate(buf);
    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Bid",
      entityName: "Invoice template",
      entityId: "invoice-template",
      changes: `Replaced the invoice template (${(buf.length / 1024).toFixed(0)} KB${hasLogo ? ", logo included" : ", no logo"}).`,
    });

    return NextResponse.json({ ok: true, bytes: buf.length, hasLogo, live: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    await resetInvoiceTemplate();
    await audit({
      actor: currentActor(),
      action: "Update",
      entity: "Bid",
      entityName: "Invoice template",
      entityId: "invoice-template",
      changes: "Reverted to the invoice template built into the app.",
    });
    return NextResponse.json({ ok: true, reverted: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 400 });
  }
}
