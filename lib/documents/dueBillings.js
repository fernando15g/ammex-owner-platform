// =============================================================================
// DUE BILLINGS — AMMEX. The company-wide A/R report, built to read like the
// paper one: grouped by job under a fabricator/gc header, one row per invoice
// (billing date/amt, payment date/amt received, total due), grand total — then
// a second section, RETENTION BILLINGS, fed by the retention event track, ending
// in TOTAL RETENTION DUE.
//
// One workbook, two tabs. "Due billings" is the full running ledger — paid rows
// and all, exactly how the report has always been read. "Open items" is the same
// format filtered to what's actually owed. Nothing about how it reads changes;
// the second tab is just the short version.
//
// Built from scratch (no uploaded template yet). If Fern's associate supplies
// the real Excel later, this becomes a template-fill like the invoice.
// =============================================================================

import ExcelJS from "exceljs";

const MONEY = '"$"#,##0.00';
const DATE = "m/d/yyyy";
const EPS = 0.005;

// strip machine tags from event notes, same rules as the billing page
function cleanNotes(notes) {
  return String(notes || "")
    .split("[snap]")[0].split("[carry]")[0].split("[adjust]")[0]
    .replace(/\[short pay\][\s\S]*/, "").replace(/\[voided\][\s\S]*/, "")
    .trim();
}

function readAdjust(notes) {
  const m = String(notes || "").match(/\[adjust\](\{.*?\})\s*$/s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function parseLocalDate(v) {
  if (v instanceof Date) return v;
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

const byDate = (a, b) => (parseLocalDate(a.date)?.getTime() || 0) - (parseLocalDate(b.date)?.getTime() || 0);

// Pair bills with their payments and work out each invoice's remaining due.
// Payments match by invoice number; payments with no invoice number apply FIFO
// (oldest unpaid bill first) and are listed as their own received-only rows.
// Due per invoice = billed − retention withheld − received − rolled forward:
// retention isn't owed here (it lives in section 2), and a short-pay's rolled
// balance re-bills on a later invoice, so it isn't owed on THIS one either.
function jobLedger(bills, payments) {
  const paysByInv = new Map();
  const loosePays = [];
  for (const p of payments) {
    const k = (p.invoiceNumber || "").trim();
    if (k) { if (!paysByInv.has(k)) paysByInv.set(k, []); paysByInv.get(k).push(p); }
    else loosePays.push(p);
  }

  const rows = bills.slice().sort(byDate).map((b) => {
    const adj = readAdjust(b.notes);
    const matched = paysByInv.get((b.invoiceNumber || "").trim()) || [];
    const received = matched.reduce((a, p) => a + (p.amount || 0), 0);
    const lastPay = matched.slice().sort(byDate).at(-1) || null;
    const due = Math.max((b.amount || 0) - (b.retentionWithheld || 0) - received - (adj?.rolledForward || 0), 0);
    return {
      kind: "bill",
      date: b.date, amount: b.amount || 0,
      payDate: lastPay?.date || null, received,
      due, note: cleanNotes(b.notes),
      shortPaid: !!adj,
    };
  });

  // loose payments: FIFO against remaining dues, then shown as received-only rows
  for (const p of loosePays.sort(byDate)) {
    let left = p.amount || 0;
    for (const r of rows) {
      if (left <= EPS) break;
      const take = Math.min(r.due, left);
      r.due -= take; left -= take;
    }
    rows.push({ kind: "loose", date: null, amount: null, payDate: p.date, received: p.amount || 0, due: 0, note: cleanNotes(p.notes) || "payment (no invoice)", shortPaid: false });
  }

  return rows;
}

// Retention section rows: retention bills with retention payments applied —
// by invoice number when present, FIFO otherwise.
function retentionLedger(retBills, retPays) {
  const rows = retBills.slice().sort(byDate).map((b) => ({
    kind: "ret",
    date: b.date, amount: b.amount || 0,
    payDate: null, received: 0,
    due: b.amount || 0, note: cleanNotes(b.notes), invoiceNumber: (b.invoiceNumber || "").trim(),
  }));
  const unmatched = [];
  for (const p of retPays.slice().sort(byDate)) {
    const k = (p.invoiceNumber || "").trim();
    const target = k ? rows.find((r) => r.invoiceNumber === k && r.due > EPS) : null;
    if (target) {
      const take = Math.min(target.due, p.amount || 0);
      target.due -= take; target.received += take; target.payDate = p.date;
      if ((p.amount || 0) - take > EPS) unmatched.push({ ...p, amount: (p.amount || 0) - take });
    } else unmatched.push(p);
  }
  for (const p of unmatched) {
    let left = p.amount || 0;
    for (const r of rows) {
      if (left <= EPS) break;
      if (r.due <= EPS) continue;
      const take = Math.min(r.due, left);
      r.due -= take; r.received += take; r.payDate = p.date; left -= take;
    }
  }
  return rows;
}

function thinBottom(ws, rowNo, fromCol, toCol, style = "medium") {
  const row = ws.getRow(rowNo);
  for (let c = fromCol; c <= toCol; c++) {
    row.getCell(c).border = { ...(row.getCell(c).border || {}), bottom: { style } };
  }
}

// Write one section (jobs + rows) onto the sheet starting at rowNo. Returns
// { next, total }.
function writeSection(ws, rowNo, jobs, openOnly) {
  let total = 0;
  for (const job of jobs) {
    let rows = job.rows;
    if (openOnly) rows = rows.filter((r) => r.due > EPS);
    if (!rows.length) continue;

    // fabricator/gc header line
    if (job.party) {
      const r = ws.getRow(rowNo);
      r.getCell(1).value = job.party;
      r.getCell(1).alignment = { indent: 2 };
      r.getCell(1).font = { size: 10 };
      rowNo++;
    }

    rows.forEach((it, i) => {
      const r = ws.getRow(rowNo);
      // col A: job label on the first row; the row's note on later rows
      r.getCell(1).value = i === 0 ? job.label : (it.note || null);
      if (i === 0) r.getCell(1).font = { size: 10 };
      else { r.getCell(1).font = { size: 9, color: { argb: "FF666666" } }; }
      if (it.date) { r.getCell(2).value = parseLocalDate(it.date); r.getCell(2).numFmt = DATE; }
      if (it.amount != null) { r.getCell(3).value = it.amount; r.getCell(3).numFmt = MONEY; }
      if (it.payDate) { r.getCell(4).value = parseLocalDate(it.payDate); r.getCell(4).numFmt = DATE; }
      if (it.received > EPS) { r.getCell(5).value = it.received; r.getCell(5).numFmt = MONEY; }
      if (it.due > EPS) { r.getCell(6).value = it.due; r.getCell(6).numFmt = MONEY; r.getCell(6).font = { bold: true, size: 10 }; }
      total += it.due;
      rowNo++;
    });
    thinBottom(ws, rowNo - 1, 1, 6);
  }
  return { next: rowNo, total };
}

function writeSheet(ws, { asOf, jobs, retJobs, openOnly }) {
  ws.columns = [
    { width: 36 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 14 },
  ];

  // title + as-of date
  ws.getCell("C1").value = "DUE BILLINGS-AMMEX";
  ws.getCell("C1").font = { bold: true, size: 13 };
  ws.getCell("F1").value = parseLocalDate(asOf) || new Date();
  ws.getCell("F1").numFmt = DATE;
  ws.getCell("F1").alignment = { horizontal: "right" };

  // column headers
  const H = ["JOB NAME/JOB #", "BILLING DATE", "BILLING AMT.", "DATE PYMT. RECEIVED", "AMT. RECEIVED", "TOTAL DUE"];
  const hr = ws.getRow(3);
  H.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 9 };
    c.alignment = { horizontal: i === 0 ? "left" : "center", wrapText: true };
  });
  thinBottom(ws, 3, 1, 6, "thick");

  let rowNo = 5;
  const due = writeSection(ws, rowNo, jobs, openOnly);
  rowNo = due.next + 1;

  // grand total for due billings
  {
    const r = ws.getRow(rowNo);
    r.getCell(1).value = "TOTAL DUE BILLINGS";
    r.getCell(1).font = { bold: true, size: 11 };
    r.getCell(6).value = due.total;
    r.getCell(6).numFmt = MONEY;
    r.getCell(6).font = { bold: true, size: 11 };
    thinBottom(ws, rowNo, 5, 6, "double");
    rowNo += 3;
  }

  // retention section
  const anyRet = retJobs.some((j) => (openOnly ? j.rows.some((r) => r.due > EPS) : j.rows.length));
  if (anyRet) {
    const t = ws.getRow(rowNo);
    t.getCell(2).value = "RETENTION BILLINGS";
    t.getCell(2).font = { bold: true, size: 12 };
    thinBottom(ws, rowNo, 1, 6, "thick");
    rowNo += 2;

    const ret = writeSection(ws, rowNo, retJobs, openOnly);
    rowNo = ret.next + 1;

    const r = ws.getRow(rowNo);
    r.getCell(1).value = "TOTAL RETENTION DUE";
    r.getCell(1).font = { bold: true, size: 11 };
    r.getCell(6).value = ret.total;
    r.getCell(6).numFmt = MONEY;
    r.getCell(6).font = { bold: true, size: 11 };
    thinBottom(ws, rowNo, 5, 6, "double");
  }
}

// projects: [{ projectId, name, fabricator: [], gc: [], events: [] }]
export function buildDueBillingsReport(projects, asOf = new Date()) {
  const jobs = [];
  const retJobs = [];

  const sorted = projects.slice().sort((a, b) =>
    String(a.projectId || a.name || "~").localeCompare(String(b.projectId || b.name || "~"), undefined, { numeric: true })
  );

  for (const p of sorted) {
    const evts = p.events || [];
    const bills = evts.filter((e) => e.type === "Bill");
    const pays = evts.filter((e) => e.type === "Payment");
    const retBills = evts.filter((e) => e.type === "Retention Bill");
    const retPays = evts.filter((e) => e.type === "Retention Payment");

    const fab = (p.fabricator || []).filter(Boolean).join(", ");
    const gc = (p.gc || []).filter(Boolean).join(", ");
    const party = fab && gc ? `${fab}/${gc}` : (fab || gc || "");
    const label = [p.projectId, p.name].filter(Boolean).join(" ") || "(unnamed job)";

    if (bills.length || pays.length) jobs.push({ party, label, rows: jobLedger(bills, pays) });
    if (retBills.length) retJobs.push({ party, label, rows: retentionLedger(retBills, retPays) });
  }

  const wb = new ExcelJS.Workbook();
  writeSheet(wb.addWorksheet("Due billings"), { asOf, jobs, retJobs, openOnly: false });
  writeSheet(wb.addWorksheet("Open items"), { asOf, jobs, retJobs, openOnly: true });
  return wb;
}

export function dueBillingsFilename(asOf = new Date()) {
  const d = asOf.toISOString().slice(0, 10);
  return `due-billings-${d}.xlsx`;
}
