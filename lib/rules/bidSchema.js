// =============================================================================
// BID SCHEMA — shared Zod validation, the single source of truth imported by
// BOTH the admin form and the write layer (architect's write-layer contract).
// Backend-agnostic by construction — no Notion concepts here.
//
// Two layers of shape:
//   • coreBidFields  — the six locked fields required on every bid (never change)
//   • metadataFields — build-and-grow tracking fields (add freely)
// =============================================================================

import { z } from "zod";

// Pipeline status — mirrors the Bid Tracker's Bid Status options.
export const BID_STATUSES = [
  "Need Weights", "Reviewing", "Estimating", "No Bid", "Contingent",
  "Submitted", "Follow Up", "Negotiating", "Awarded", "Lost",
];

// ---- Metadata (build-and-grow) ----------------------------------------------
// What the OS admin actually fills in. Pricing stays in the calculator; the OS
// owns tracking/metadata. Grow this set as needed.
export const bidMetadataSchema = z.object({
  projectName: z.string().trim().min(1, "Project name is required"),
  gc: z.array(z.string()).default([]),
  fabricator: z.array(z.string()).default([]),
  projectType: z.array(z.string()).default([]),
  cityCounty: z.string().trim().optional().default(""),
  bidDueDate: z.string().optional().nullable(), // ISO date string or null
  status: z.enum(BID_STATUSES).default("Reviewing"),
  notes: z.string().trim().optional().default(""),
  scope: z.string().trim().optional().default(""),
});

// ---- Create input (what the form submits) -----------------------------------
export const createBidInputSchema = bidMetadataSchema;

// ---- Update input (partial — only changed metadata; version checked separately)
export const updateBidInputSchema = bidMetadataSchema.partial();

// ---- The six locked core fields (attached by the write path, not the form) ---
// Documented here so every backend implements them identically.
// 1. bidNumber    string  YYYY-NNNN, immutable once assigned
// 2. finalBidPrice currency, the single canonical bid price (in metadata above)
// 3. origin       'calculator' | 'manual', set at create, never changed
// 4. version      integer, starts at 1, +1 every write (optimistic concurrency)
// 5. audit        createdBy, createdAt, modifiedBy, modifiedAt
// 6. void         isVoided(false), voidedAt, voidedBy — never hard-delete
export const ORIGINS = ["calculator", "manual"];

export function validateCreate(input) {
  return createBidInputSchema.parse(input);
}
export function validateUpdate(input) {
  return updateBidInputSchema.parse(input);
}
