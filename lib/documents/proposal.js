// =============================================================================
// PROPOSAL GENERATOR
//
// This does NOT recreate the bid sheet. It OPENS the real template
// (templates/proposal-template.xlsx — the same file Fern has always sent) and
// fills in the cells. The logo, the fonts, the number formats, the terms, the
// formulas: identical by construction, because none of it was rebuilt.
//
// That matters for a reason beyond laziness. A GC's AP department has been
// receiving this exact document for years. Change how it looks and an invoice
// gets "lost". Fidelity here isn't polish — it's the whole point.
//
// And it answers "what if the template changes?" for free: replace the file.
// No export/reimport machinery to build, and none to go stale.
//
// TEMPLATE MAP (read off the real file, not guessed):
//   C3:C9    company block (address, phone, licences)
//   A12      Project Name:      B12 = the value
//   E12      Proposal Date:     F12 = the value
//   row 17   headers: Item No | Description | Quantity | Unit | Unit Price | Extended | Furn/Inst
//   18–26    nine line-item rows;  F = SUM(E*C)
//   27       total = SUM(F18:F26)
//   30–37    Notes / terms
// =============================================================================

import ExcelJS from "exceljs";
import path from "path";

const TEMPLATE = path.join(process.cwd(), "templates", "proposal-template.xlsx");

const FIRST_ITEM_ROW = 18;
const LAST_ITEM_ROW = 26;      // the template's nine rows
const TOTAL_ROW = 27;
const TEMPLATE_ROWS = LAST_ITEM_ROW - FIRST_ITEM_ROW + 1;

export async function buildProposal({ bid, items }) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE);
  const ws = wb.worksheets[0];

  // ---- header -------------------------------------------------------------
  ws.getCell("B12").value = bid.name || "";
  // the date the proposal is dated: when it was submitted, else today
  const dated = bid.submissionDate || bid.proposalDate;
  ws.getCell("F12").value = dated ? parseLocalDate(dated) : new Date();
  ws.getCell("F12").numFmt = "mm/dd/yyyy";

  // ---- line items ---------------------------------------------------------
  // More items than the template has rows? Insert more — but copy the style and
  // the formula from an existing row, so a longer proposal looks like the
  // template rather than like something a computer bolted on.
  const extra = Math.max(items.length - TEMPLATE_ROWS, 0);
  if (extra > 0) {
    ws.spliceRows(LAST_ITEM_ROW + 1, 0, ...Array.from({ length: extra }, () => []));
    for (let i = 0; i < extra; i++) {
      const src = ws.getRow(FIRST_ITEM_ROW);
      const dst = ws.getRow(LAST_ITEM_ROW + 1 + i);
      dst.height = src.height;
      for (let c = 1; c <= 7; c++) {
        const from = src.getCell(c);
        const to = dst.getCell(c);
        to.style = { ...from.style };
        to.numFmt = from.numFmt;
      }
    }
  }

  const lastRow = FIRST_ITEM_ROW + Math.max(items.length, TEMPLATE_ROWS) - 1;

  items.forEach((it, i) => {
    const r = FIRST_ITEM_ROW + i;
    ws.getCell(`A${r}`).value = it.itemNo || "";
    ws.getCell(`B${r}`).value = it.description || "";
    ws.getCell(`C${r}`).value = it.quantity ?? null;
    ws.getCell(`D${r}`).value = it.unit || "";
    ws.getCell(`E${r}`).value = it.unitPrice ?? null;
    // keep the template's own formula rather than pasting a number in — the file
    // stays a working spreadsheet, which is what makes it editable
    ws.getCell(`F${r}`).value = { formula: `SUM(E${r}*C${r})` };
    ws.getCell(`G${r}`).value = it.furnInst || "";
  });

  // clear any template rows we didn't fill
  for (let r = FIRST_ITEM_ROW + items.length; r <= lastRow; r++) {
    ["A", "B", "C", "D", "E", "G"].forEach((c) => { ws.getCell(`${c}${r}`).value = null; });
    ws.getCell(`F${r}`).value = { formula: `SUM(E${r}*C${r})` };
  }

  // ---- total --------------------------------------------------------------
  const totalRow = extra > 0 ? TOTAL_ROW + extra : TOTAL_ROW;
  ws.getCell(`F${totalRow}`).value = { formula: `SUM(F${FIRST_ITEM_ROW}:F${lastRow})` };

  return wb;
}

// "2026-07-13" parsed by new Date() is UTC midnight, which prints as the day
// BEFORE in Arizona. Parse the parts explicitly.
function parseLocalDate(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
}

export function proposalFilename(bid) {
  const safe = String(bid.name || "proposal").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const d = new Date().toISOString().slice(0, 10);
  return `${safe}-proposal-${d}.xlsx`;
}
