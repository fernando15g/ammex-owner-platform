// =============================================================================
// ENTITIES — the core Ammex OS domain objects (build spec §15).
//
// Each factory returns an object shaped like a future Postgres ROW. Some are
// fully populated from Notion today; some (Production, Invoice, Payment) return
// mostly-null until their data/DBs exist. Defining the SHAPE now means adding
// those modules later is "fill the mapper," never "restructure the system."
//
// THE PROJECT IS THE HUB. Bids, production, time, invoices, payments all hang
// off a Project. Every metric reads from the project.
// =============================================================================

// ---- Production Entry (admin-authored daily installed pounds) ----------------
// Separate stream from timecards: the office admin logs installed lbs after
// reconciling fabricator shipments with field-reported installs. Joined to
// labor hours at project+date to compute actual lbs/MH. No DB yet → empty.
export function makeProductionEntry({ id = null, projectId = null, date = null, foreman = null, installedLbs = null, laborHours = null, notes = null, issues = null } = {}) {
  return { id, projectId, date, foreman, installedLbs, laborHours, notes, issues };
}

// ---- Invoice -----------------------------------------------------------------
// Billing by installed/approved pounds (Ammex-specific), not generic invoices.
// No DB yet → empty; Project Financials module fills this later.
export function makeInvoice({ id = null, projectId = null, number = null, date = null, billedLbs = null, amount = null, status = null, dueDate = null } = {}) {
  return { id, projectId, number, date, billedLbs, amount, status, dueDate };
}

// ---- Payment -----------------------------------------------------------------
export function makePayment({ id = null, projectId = null, invoiceId = null, date = null, amount = null } = {}) {
  return { id, projectId, invoiceId, date, amount };
}

// ---- The four pounds/paid figures every Project carries ----------------------
// Distinct on purpose — never collapse them (spec §5.3 / recalibration):
//   installed = field placed it        (Rebar Placed To-Date, live today)
//   billable  = approved to invoice     (no field yet)
//   billed    = actually on an invoice  (needs Invoices)
//   paidAmount= received                (needs Payments)
export function makeFinancials({ contractLbs = null, contractRate = null, contractValue = null, installedLbs = null, billableLbs = null, billedLbs = null, paidAmount = null, retentionOutstanding = null } = {}) {
  const remainingContractLbs =
    typeof contractLbs === "number" && typeof installedLbs === "number"
      ? Math.max(contractLbs - installedLbs, 0)
      : null;
  const unbilledInstalledLbs =
    typeof installedLbs === "number" && typeof billedLbs === "number"
      ? Math.max(installedLbs - billedLbs, 0)
      : null; // "pounds sitting in the field, placed but not yet billed"
  const outstandingAR =
    typeof billedLbs === "number" && typeof contractRate === "number" && typeof paidAmount === "number"
      ? billedLbs * contractRate - paidAmount
      : null;
  return {
    contractLbs, contractRate, contractValue,
    installedLbs, billableLbs, billedLbs, paidAmount,
    retentionOutstanding, remainingContractLbs, unbilledInstalledLbs, outstandingAR,
  };
}
