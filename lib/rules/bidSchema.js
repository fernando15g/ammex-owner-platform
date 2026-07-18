// =============================================================================
// BID SCHEMA — shared Zod validation, imported by the form + write layer.
// A bid TRACKING record: metadata + raw inputs + money figures (all stored,
// none calculated by the OS). Backend-agnostic — no Notion concepts.
// =============================================================================

import { z } from "zod";

export const BID_STATUSES = [
  "Need Weights", "Reviewing", "Estimating", "No Bid", "Contingent",
  "Submitted", "Follow Up", "Negotiating", "Awarded", "Lost",
];

const optNum = z.union([z.number(), z.null()]).optional();

export const bidMetadataSchema = z.object({
  // metadata
  projectName: z.string().trim().min(1, "Project name is required"),
  gc: z.array(z.string()).default([]),
  fabricator: z.array(z.string()).default([]),
  projectType: z.array(z.string()).default([]),
  cityCounty: z.string().trim().optional().default(""),
  bidDueDate: z.string().optional().nullable(),
  submissionDate: z.string().optional().nullable(),
  lastFollowUp: z.string().optional().nullable(),
  status: z.enum(BID_STATUSES).default("Reviewing"),
  scope: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  // raw estimating inputs (stored)
  estimatedLbs: optNum,
  productivity: optNum,
  crewSize: optNum,
  baseWage: optNum,
  bidRate: optNum,
  ptSpecialty: optNum,
  // money figures (stored as entered; margin is a ratio 0.17 = 17%)
  operatingProfit: optNum,
  operatingMargin: optNum,
  fullyLoadedCost: optNum,
  burdenedLaborCost: optNum,
  // assumptions (stored so an amended bid records what was actually used)
  burdenPct: optNum,
  toolsPct: optNum,
  contingencyPct: optNum,
  mobilizationHrs: optNum,
  targetMarginPct: optNum,
});

export const createBidInputSchema = bidMetadataSchema;
export const updateBidInputSchema = bidMetadataSchema.partial();

export function validateCreate(input) { return createBidInputSchema.parse(input); }
export function validateUpdate(input) { return updateBidInputSchema.parse(input); }
