// =============================================================================
// MUTATION RULES — the single gate every edit/delete must pass through.
//
// Why this file exists: two routes used to accept an arbitrary bag of fields and
// pass it straight to the repository. That is how invoices drifted out of sync
// with their line items (edit an invoice's amount, and the quantities it billed
// never moved). Repositories should not decide what a legal change is; rules do.
//
// Pure functions only — no Notion, no fetch. Everything here is testable, and
// none of it changes when the database changes.
// =============================================================================

// Tags we stamp into an event's notes. These are structured records living in a
// text field (a Notion workaround); in Postgres they become real tables. Parsing
// lives HERE so there is exactly one place to change at migration time.
export function readTag(notes, tag) {
  const m = String(notes || "").match(new RegExp(`\\[${tag}\\](\\{.*?\\})\\s*(?:\\n|$)`, "s"));
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export function stripTag(notes, tag) {
  return String(notes || "")
    .replace(new RegExp(`\\n?\\[${tag}\\]\\{.*?\\}\\s*(?=\\n|$)`, "s"), "")
    .trim();
}

export function writeTag(notes, tag, obj) {
  const base = stripTag(notes, tag);
  return `${base}\n[${tag}]${JSON.stringify(obj)}`.trim();
}

// -----------------------------------------------------------------------------
// EVENT EDITS
// -----------------------------------------------------------------------------
// An itemized invoice's amount is DERIVED from the quantities it billed. Editing
// that total directly is incoherent — the number would no longer describe the
// work. So: invoice money fields are not directly editable. Metadata is.
// To change what an invoice billed, undo it and re-create it from the grid.
const EDITABLE = {
  Bill: ["invoiceNumber", "date", "dueDate", "notes"],
  Payment: ["amount", "date", "invoiceNumber", "notes"],
  "Change Order": ["amount", "date", "notes"],
};

const MONEY_FIELDS = ["amount", "retentionWithheld", "pounds"];

export function validateEventEdit(event, changes) {
  const allowed = EDITABLE[event.type];
  if (!allowed) throw new Error(`Unknown event type: ${event.type}`);

  const requested = Object.keys(changes);
  const illegal = requested.filter((k) => !allowed.includes(k));

  if (illegal.length) {
    if (event.type === "Bill" && illegal.some((k) => MONEY_FIELDS.includes(k))) {
      throw new Error(
        "An invoice's amount comes from the quantities it billed — it can't be edited directly, " +
        "or the invoice would no longer match its line items. Undo the invoice and re-create it " +
        "with the correct quantities. (Invoice number, dates and notes can be edited here.)"
      );
    }
    throw new Error(`Can't edit ${illegal.join(", ")} on a ${event.type}.`);
  }

  if ("amount" in changes) {
    const amt = Number(changes.amount);
    if (isNaN(amt) || amt < 0) throw new Error("Amount must be a number of zero or more.");
  }
  return changes;
}

// -----------------------------------------------------------------------------
// SHORT PAY — the side effects that must unwind together
// -----------------------------------------------------------------------------
// A short pay does three things at once:
//   1. stamps [adjust] on the INVOICE (billed vs received vs rolled forward)
//   2. reduces the qtyToDate of the LINE ITEMS it rolled back
//   3. records the payment with a [carry] tag holding the line detail
// Editing or deleting that payment must unwind ALL THREE, or the books lie.
// planShortPayUnwind returns the exact reversal — no writes, just the plan.
export function planShortPayUnwind(payment, invoice) {
  const carry = readTag(payment?.notes, "carry");
  if (!carry) return null; // not a short pay: nothing to unwind

  return {
    // put the rolled-back quantities BACK on the lines. The ref carries the
    // application-owned Line ID (lid) with the page id as a legacy fallback.
    lineRestores: (carry.lines || []).map((l) => ({ ref: { lid: l.lid || null, id: l.id || null }, addQty: l.qty || 0 })),
    // remove the adjustment stamp from the invoice
    invoiceId: invoice?.id || null,
    invoiceNotes: invoice ? stripShortPayNotes(invoice.notes) : null,
    rolledForward: carry.netShort || 0,
    fromInvoice: carry.fromInvoice || "",
  };
}

// remove both the human-readable [short pay] line and the [adjust] record
export function stripShortPayNotes(notes) {
  return stripTag(String(notes || "").replace(/\n?\[short pay\][^\n]*/g, ""), "adjust").trim();
}

// -----------------------------------------------------------------------------
// LINE ITEM EDITS
// -----------------------------------------------------------------------------
// qtyToDate is owned by the invoicing flow — it records what has been BILLED.
// Nothing else may write it, or the line will disagree with its invoices.
const LINE_EDITABLE = ["description", "itemNo", "quantity", "unit", "unitPrice", "furnInst", "lineType", "status", "notes"];

// IMPORTANT: callers (the bid sheet) send the whole row, not a diff. So a rule
// must only fire when a value ACTUALLY changes — otherwise editing a billed
// line's description would be rejected for "changing" a price that never moved.
const changed = (changes, line, key) =>
  key in changes && Number(changes[key] ?? 0) !== Number(line[key] ?? 0);

export function validateLineEdit(line, changes, { allowQtyToDate = false } = {}) {
  const requested = Object.keys(changes);
  const illegal = requested.filter((k) => !LINE_EDITABLE.includes(k) && !(allowQtyToDate && k === "qtyToDate"));
  if (illegal.length) {
    if (illegal.includes("qtyToDate")) {
      throw new Error(
        "Billed-to-date quantity is set by invoicing — it can't be edited directly. " +
        "Create or undo an invoice to change what's been billed."
      );
    }
    throw new Error(`Can't edit ${illegal.join(", ")} on a line item.`);
  }

  const billed = (line.qtyToDate || 0) > 0;

  if (changed(changes, line, "quantity") && Number(changes.quantity) < (line.qtyToDate || 0)) {
    throw new Error(
      `Bid quantity (${changes.quantity}) can't be less than what's already billed (${line.qtyToDate}). ` +
      "Undo the invoices first, or close this line instead."
    );
  }

  if (billed && changed(changes, line, "unitPrice")) {
    throw new Error(
      `"${line.description || "This line"}" has already been billed — changing its unit price would make ` +
      "past invoices disagree with the contract. Close it and add a corrected line instead."
    );
  }

  return changes;
}

// A line can be deleted only if nothing has been billed against it. Otherwise it
// must be CLOSED: the history stays, future billing stops.
export function planLineDelete(line) {
  const billed = (line.qtyToDate || 0) > 0;
  return {
    canDelete: !billed,
    mustCloseInstead: billed,
    reason: billed
      ? `"${line.description}" has ${line.qtyToDate} billed — deleting it would leave invoices billing work that no longer exists in the contract.`
      : null,
  };
}

// -----------------------------------------------------------------------------
// PROJECT EDITS / DELETE
// -----------------------------------------------------------------------------
// `gc` is accepted here but does NOT live on the project — it lives on the BID.
// The route writes it through to the attached bid, so there is exactly one place
// a job's GC is recorded and the two can never disagree.
const PROJECT_EDITABLE = ["name", "projectId", "status", "actualStartDate", "foreman", "relatedBidId", "relatedBidIds", "gc", "phaseLabels", "payrollHours", "manualHoursOverride", "placedLbs", "siteStreet", "siteCity", "siteState", "siteZip", "siteLat", "siteLng", "sitePinManual", "notes", "hoursMode", "combineBaseline"];

export function validateProjectEdit(changes) {
  const illegal = Object.keys(changes).filter((k) => !PROJECT_EDITABLE.includes(k));
  if (illegal.length) throw new Error(`Can't edit ${illegal.join(", ")} on a project here.`);
  if ("name" in changes && !String(changes.name || "").trim()) {
    throw new Error("A project needs a name.");
  }
  return changes;
}

// A project carrying billing history can't be deleted — invoices and payments
// would be orphaned and the money record would lose its subject. Close it
// instead: the history stays, the job stops showing as live work.
export function planProjectDelete(project, events = [], lines = []) {
  const hasBilling = events.length > 0;
  const billedLines = lines.filter((l) => (l.qtyToDate || 0) > 0);

  if (hasBilling || billedLines.length) {
    return {
      canDelete: false,
      mustCloseInstead: true,
      reason:
        `"${project.name}" has ${events.length} billing record${events.length === 1 ? "" : "s"}` +
        `${billedLines.length ? ` and ${billedLines.length} billed line item${billedLines.length === 1 ? "" : "s"}` : ""}. ` +
        "Deleting it would orphan that money history. Set it to Closed instead — the record stays, " +
        "and it stops showing as live work.",
    };
  }
  return { canDelete: true, mustCloseInstead: false, reason: null };
}

// -----------------------------------------------------------------------------
// BID DELETE
// -----------------------------------------------------------------------------
// A bid that became a project is load-bearing: the project resolves its line
// items through the bid relation, so deleting the bid would strip the project's
// contract. A bid whose line items have been billed is likewise off-limits.
export function planBidDelete(bid, projects = [], lines = []) {
  const linkedProject = projects.find((p) => p.relatedBidId === bid.id || (p.relatedBidIds || []).includes(bid.id));
  const bidLines = lines.filter((l) => l.bidId === bid.id);
  const billedLines = bidLines.filter((l) => (l.qtyToDate || 0) > 0);

  if (linkedProject) {
    return {
      canDelete: false,
      reason:
        `This bid is attached to project "${linkedProject.name}", which resolves its line items ` +
        "through it — deleting the bid would strip that project's contract value. " +
        "Mark the bid Lost or No Bid instead, or detach the project first.",
    };
  }
  if (billedLines.length) {
    return {
      canDelete: false,
      reason: `${billedLines.length} of this bid's line items have already been billed. Mark it Lost or No Bid instead.`,
    };
  }
  return { canDelete: true, lineItemsToArchive: bidLines.map((l) => l.id), reason: null };
}
