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
  // Out-of-town (travel) add-on — inputs + computed outputs
  travelOn: z.boolean().optional(),
  hotelRooms: optNum, hotelNightlyRate: optNum, hotelNights: optNum,
  hotelTaxPct: optNum, hotelNightsBasis: optNum,
  fuelMiles: optNum, fuelTrips: optNum, fuelMPG: optNum, fuelPerGal: optNum,
  subsistenceRate: optNum, subsistenceInLabor: z.boolean().optional(),
  travelMarkupOn: z.boolean().optional(), travelMarkupPct: optNum,
  travelAddToBid: z.boolean().optional(),
  hotelCost: optNum, fuelCost: optNum, subsistenceCost: optNum,
  travelTotal: optNum, travelAddOnCents: optNum,
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
  hoursPerDay: optNum,
  targetMarginPct: optNum,
  // Specialty scope (PT + mesh). NOTE: z.object() silently STRIPS unknown keys,
  // so anything the app saves must be declared here or it vanishes without error.
  rebarRevenue: optNum,
  specialtyRevenue: optNum,
  specialtyCost: optNum,
  specialtyHours: optNum,
  specialtyTypes: z.array(z.string()).optional(),
  detailer: z.string().optional().nullable(),
});

export const createBidInputSchema = bidMetadataSchema;
export const updateBidInputSchema = bidMetadataSchema.partial();

export function validateCreate(input) { return createBidInputSchema.parse(input); }
export function validateUpdate(input) {
  // CRITICAL: on an update, a field the caller didn't send means "leave it
  // alone" — NOT "reset to default". Zod's .partial() still fires .default()
  // for absent keys (e.g. gc -> [], cityCounty -> ""), which then get written
  // to Notion as blanks and WIPE the stored values. So we validate, then keep
  // only the keys the caller actually provided. This makes a status-only update
  // send only status, and protects every field from the same clobbering.
  const parsed = updateBidInputSchema.parse(input);
  const out = {};
  for (const key of Object.keys(input)) {
    if (key in parsed) out[key] = parsed[key];
  }
  return out;
}
