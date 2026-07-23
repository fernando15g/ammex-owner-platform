// =============================================================================
// buildInvoice — the progress-billing invoice (the AIA-style estimate Fern
// sends the GC / fabricator), as an .xlsx.
//
// Same idea as the proposal: it's her real template with the numbers dropped in,
// so it opens in Excel exactly as it always has — same header, same SUM()
// formulas, retention driven by the contract's setting computing the Total Due.
// She reviews and
// exports a PDF from Excel, the step she already knows. NOT a rebuilt-from-
// scratch PDF: the GC's AP department has received this exact document for years.
//
// The template's columns and formulas (per row r, rows 12..28):
//   A itemNo · B description · C estimate qty · D unit price
//   E to-date qty · F =SUM(D*E)        (total work to date $)
//   G previous qty · H =SUM(D*G)       (previous work $)
//   I =SUM(E-G) (this estimate qty) · J =SUM(D*I) (this estimate $)
// Totals row: F/H/J = SUM of the column; retention driven by the invoice's own
// recorded rate (see below); Total Due = SUM(J29-J30). We fill ONLY A,B,C,D,E,G
// — the template computes everything else.
// =============================================================================

import ExcelJS from "exceljs";
import { getInvoiceTemplateBuffer } from "@/lib/documents/templateStore";

const FIRST_ITEM_ROW = 12;
const LAST_ITEM_ROW = 28;      // the template's seventeen line rows
const TOTAL_ROW = 29;          // subtotals; 30 = retention; 31 = net / Total Due
const RETENTION_ROW = 30;
const NET_ROW = 31;
const TEMPLATE_ROWS = LAST_ITEM_ROW - FIRST_ITEM_ROW + 1;

// A bill saves a snapshot in its notes: [snap]{"r":pct,"lines":[{lid,id,u,q}]}
// where q is the quantity billed on THAT invoice for that line. Pull it out.
function parseSnap(notes) {
  const s = String(notes || "");
  const at = s.indexOf("[snap]");
  if (at === -1) return null;
  const rest = s.slice(at + "[snap]".length);
  const start = rest.indexOf("{");
  if (start === -1) return null;
  // balanced-brace scan so trailing tags after the JSON don't break the parse
  let depth = 0, end = -1;
  for (let i = start; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  try {
    return JSON.parse(rest.slice(start, end + 1));
  } catch {
    return null;
  }
}

// "2026-07-13" via new Date() is UTC midnight, which prints the day BEFORE in
// Arizona. Parse the parts explicitly. Accepts Date objects too.
function parseLocalDate(v) {
  if (v instanceof Date) return v;
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : (v ? new Date(v) : new Date());
}

// Chronological order for bills: by date, then by invoice number, then id — a
// stable order so cumulative reconstruction is deterministic even for same-day
// invoices.
function billOrder(a, b) {
  const da = parseLocalDate(a.date).getTime();
  const db = parseLocalDate(b.date).getTime();
  if (da !== db) return da - db;
  const ia = String(a.invoiceNumber || "");
  const ib = String(b.invoiceNumber || "");
  if (ia !== ib) return ia < ib ? -1 : 1;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

// Does a snapshot line refer to this project line item? Match on the
// application-owned Line ID first, then the Notion page id.
function snapMatchesLine(snapLine, line) {
  if (snapLine.lid && line.lineId && snapLine.lid === line.lineId) return true;
  if (snapLine.id && line.id && snapLine.id === line.id) return true;
  return false;
}

// project: the project (name, ids, gc/fabricator). bill: the target Bill event.
// bills: ALL of the project's Bill events (to reconstruct cumulative through and
// before the target). lines: the project's line items.
export async function buildInvoice({ project, bill, bills = [], lines = [] }) {
  const wb = new ExcelJS.Workbook();
  const { buffer } = await getInvoiceTemplateBuffer();   // uploaded if there is one, built-in otherwise
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];

  const allBills = (bills && bills.length ? bills : [bill]).slice().sort(billOrder);
  const parsed = allBills.map((b) => parseSnap(b.notes));
  const targetIdx = allBills.findIndex((b) => b.id === bill.id);
  const tIdx = targetIdx === -1 ? allBills.length - 1 : targetIdx;

  // ---- header -------------------------------------------------------------
  const snapRef = (parsed[tIdx] && parsed[tIdx].ref) || "";
  const invNo = bill.invoiceNumber || "";
  ws.getCell("I1").value = invNo ? `Invoice# ${invNo}` : "Invoice#";
  ws.getCell("E6").value = invNo ? `INVOICE/${invNo}` : "INVOICE/";
  ws.getCell("B7").value = parseLocalDate(bill.date);
  ws.getCell("B7").numFmt = "mm/dd/yyyy";
  // "CONTRACTOR:" on this document is who it's billed to. The billing record
  // carries the GC (as an array); the fabricator (e.g. CMC REBAR) often isn't
  // stored separately, so this is a best-effort starting point Fern confirms
  // before the invoice goes out.
  const gc = Array.isArray(project.gc) ? project.gc.filter(Boolean).join(", ") : (project.gc || project.fabricator || "");
  ws.getCell("A9").value = gc ? `CONTRACTOR: ${gc}` : "CONTRACTOR:";
  // PROJECT NAME is what the CUSTOMER calls this job — their AP matches the
  // invoice by their own reference, not ours. Per-invoice override first (a phase
  // or CO can carry a different one), then the project's Billing Job Reference,
  // then our own name as the fallback. Our project ID still rides along in the
  // invoice number and filename, so nothing becomes untraceable on our side.
  const ref = (bill.billingJobReference || snapRef || project.billingJobReference || "").trim();
  const projName = ref || project.name || "";
  const projId = ref ? "" : (project.projectId ? ` / ${project.projectId}` : "");
  ws.getCell("E9").value = `PROJECT NAME: ${projName}${projId}`.trim();

  // ---- which lines appear -------------------------------------------------
  // Every priced contract line (has a description) is listed — a progress
  // invoice shows the full schedule of values, billed lines and not-yet-billed
  // lines alike, cumulative to date vs. previously. Skip empty/placeholder rows.
  const contractLines = lines.filter(
    (l) => (l.description && String(l.description).trim()) || (l.itemNo && String(l.itemNo).trim())
  );

  // per-line cumulative: through the target bill (E) and before it (G)
  const rowsData = contractLines.map((L) => {
    let cumThrough = 0, cumBefore = 0;
    for (let i = 0; i < allBills.length; i++) {
      const snap = parsed[i];
      if (!snap || !Array.isArray(snap.lines)) continue;
      const q = snap.lines
        .filter((s) => snapMatchesLine(s, L))
        .reduce((a, s) => a + (Number(s.q) || 0), 0);
      if (i <= tIdx) cumThrough += q;
      if (i < tIdx) cumBefore += q;
    }
    return {
      itemNo: L.itemNo || "",
      description: L.description || "",
      estimateQty: L.quantity ?? null,
      unitPrice: L.unitPrice ?? null,
      toDateQty: cumThrough,
      prevQty: cumBefore,
    };
  });

  // ---- expand rows if the schedule is longer than the template ------------
  // Copy style + numFmt from a template line row so a longer invoice looks like
  // the template, not like something a computer bolted on. Insert BEFORE the
  // totals block so the SUM ranges and retention rows shift with it.
  const extra = Math.max(rowsData.length - TEMPLATE_ROWS, 0);
  if (extra > 0) {
    ws.spliceRows(LAST_ITEM_ROW + 1, 0, ...Array.from({ length: extra }, () => []));
    for (let i = 0; i < extra; i++) {
      const src = ws.getRow(FIRST_ITEM_ROW);
      const dst = ws.getRow(LAST_ITEM_ROW + 1 + i);
      dst.height = src.height;
      for (let c = 1; c <= 10; c++) {           // columns A..J
        const from = src.getCell(c);
        const to = dst.getCell(c);
        to.style = { ...from.style };
        to.numFmt = from.numFmt;
      }
    }
  }

  const lastRow = FIRST_ITEM_ROW + Math.max(rowsData.length, TEMPLATE_ROWS) - 1;

  // ---- fill the line rows -------------------------------------------------
  rowsData.forEach((it, i) => {
    const r = FIRST_ITEM_ROW + i;
    ws.getCell(`A${r}`).value = it.itemNo || null;
    ws.getCell(`B${r}`).value = it.description || null;
    ws.getCell(`C${r}`).value = it.estimateQty ?? null;   // ESTIMATE quantity (contract)
    ws.getCell(`D${r}`).value = it.unitPrice ?? null;      // unit price
    ws.getCell(`E${r}`).value = it.toDateQty ?? null;      // TOTAL WORK TO DATE quantity
    ws.getCell(`G${r}`).value = it.prevQty ?? null;        // PREVIOUS WORK quantity
    // keep the template's own formulas so the file stays a working spreadsheet
    ws.getCell(`F${r}`).value = { formula: `SUM(D${r}*E${r})` };
    ws.getCell(`H${r}`).value = { formula: `SUM(D${r}*G${r})` };
    ws.getCell(`I${r}`).value = { formula: `SUM(E${r}-G${r})` };
    ws.getCell(`J${r}`).value = { formula: `SUM(D${r}*I${r})` };
  });

  // clear any template rows we didn't fill (keep their formulas so blanks read 0)
  for (let r = FIRST_ITEM_ROW + rowsData.length; r <= lastRow; r++) {
    ["A", "B", "C", "D", "E", "G"].forEach((c) => { ws.getCell(`${c}${r}`).value = null; });
    ws.getCell(`F${r}`).value = { formula: `SUM(D${r}*E${r})` };
    ws.getCell(`H${r}`).value = { formula: `SUM(D${r}*G${r})` };
    ws.getCell(`I${r}`).value = { formula: `SUM(E${r}-G${r})` };
    ws.getCell(`J${r}`).value = { formula: `SUM(D${r}*I${r})` };
  }

  // ---- totals / retention / total due -------------------------------------
  // Rows shift down by `extra` if we inserted lines. Column subtotals and the
  // Total Due (subtotal minus retention) are always live formulas.
  const totalRow = TOTAL_ROW + extra;
  const retRow = RETENTION_ROW + extra;
  const netRow = NET_ROW + extra;
  for (const col of ["F", "H", "J"]) {
    ws.getCell(`${col}${totalRow}`).value = { formula: `SUM(${col}${FIRST_ITEM_ROW}:${col}${lastRow})` };
    ws.getCell(`${col}${netRow}`).value = { formula: `SUM(${col}${totalRow}-${col}${retRow})` };
  }

  // ---- retention: settings-driven, frozen per invoice ---------------------
  // Each bill was billed at whatever retention rate was in effect that day — the
  // snapshot records it (`r`, a percent; 0 means none). We honor that rate per
  // invoice instead of a blanket 10%, and we never re-rate an old invoice if the
  // contract changes later: a reprint matches the paper the GC already has.
  //
  // Retention off (rate 0) → the retention rows are 0 and Total Due = subtotal.
  // When the rate is the same across every invoice up to this one (the usual
  // case) the retention cells stay LIVE formulas you can nudge in Excel. If the
  // rate changed mid-job the cumulative columns (to-date, previous) are a blend
  // — 5% on the old work, 10% on the new — so those two are written as computed
  // dollars, while THIS invoice's own retention stays a live formula at its rate.
  const rateOf = (i) => {
    const sn = parsed[i];
    const r = sn ? Number(sn.r) : 0;
    return Number.isFinite(r) && r > 0 ? r : 0;
  };
  // one bill's this-estimate dollars, in the invoice's current unit prices
  const billThisEstDollars = (i) => {
    const sn = parsed[i];
    if (!sn || !Array.isArray(sn.lines)) return 0;
    return contractLines.reduce((sum, L) => {
      const q = sn.lines.filter((s) => snapMatchesLine(s, L)).reduce((a, s) => a + (Number(s.q) || 0), 0);
      return sum + q * (Number(L.unitPrice) || 0);
    }, 0);
  };
  const rTarget = rateOf(tIdx);
  const ratesUpTo = new Set();
  let retToDate = 0, retPrev = 0;
  for (let i = 0; i <= tIdx; i++) {
    const rate = rateOf(i);
    ratesUpTo.add(rate);
    const ret = billThisEstDollars(i) * (rate / 100);
    retToDate += ret;
    if (i < tIdx) retPrev += ret;
  }
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const pctText = (r) => String(r).replace(/\.0+$/, ""); // 5 not 5.0, 7.5 stays 7.5

  if (ratesUpTo.size <= 1) {
    // one rate across the whole job so far (possibly 0) → clean live formulas
    for (const col of ["F", "H", "J"]) {
      ws.getCell(`${col}${retRow}`).value = rTarget > 0 ? { formula: `SUM(${col}${totalRow}*${pctText(rTarget)}%)` } : 0;
    }
  } else {
    // rate changed mid-job → cumulative columns are a blend (computed dollars);
    // this invoice's retention stays live at its own rate
    ws.getCell(`F${retRow}`).value = round2(retToDate);
    ws.getCell(`H${retRow}`).value = round2(retPrev);
    ws.getCell(`J${retRow}`).value = rTarget > 0 ? { formula: `SUM(J${totalRow}*${pctText(rTarget)}%)` } : 0;
  }

  // ---- print setup: make a long invoice paginate itself --------------------
  // Rows 1-11 (the company block, invoice header and column labels) repeat at
  // the top of every printed page, so page 2 isn't a naked list of numbers.
  // Columns are scaled to fit the page width so nothing spills sideways, and the
  // page number becomes a real field — the template's literal "PAGE 1 OF 1"
  // would still say "1 OF 1" on a three-page invoice.
  ws.pageSetup = {
    ...(ws.pageSetup || {}),
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,          // as many pages tall as it needs
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printArea: `A1:J${netRow}`,
  };
  ws.pageSetup.printTitlesRow = "1:11";
  // real page numbers, top-right where the template's static one sat
  ws.headerFooter = {
    ...(ws.headerFooter || {}),
    oddHeader: "&R&\"Arial,Regular\"&10PAGE &P OF &N",
    evenHeader: "&R&\"Arial,Regular\"&10PAGE &P OF &N",
  };
  ws.getCell(`I7`).value = null;   // the static "PAGE 1 OF 1" is now dynamic

  return wb;
}

export function invoiceFilename(project, bill) {
  const base = project.projectId || project.name || "invoice";
  const inv = bill.invoiceNumber ? `-${bill.invoiceNumber}` : "";
  const safe = String(`${base}${inv}`).replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const d = new Date().toISOString().slice(0, 10);
  return `${safe}-invoice-${d}.xlsx`;
}
