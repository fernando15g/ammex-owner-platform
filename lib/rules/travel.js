// =============================================================================
// OUT-OF-TOWN (TRAVEL) COST ADD-ON
//
// PORTED VERBATIM from the bid calculator (ammex-bid-calculator lib/calc.js).
// Both apps must price travel identically, so this file is a copy, not a
// re-implementation — if the calculator's travel math changes, re-copy it here.
//
// Travel is labor-independent: it does NOT pass through the burden / tools /
// contingency multipliers and does NOT inherit the placement target margin.
// It carries its own optional markup (default 12%), converts to c/lb on the
// rebar weight, and only folds into the quoted rate when the user asks.
// =============================================================================

// mirrors the workbook's IFERROR(...,0)
const safeDiv = (n, d) => (d ? n / d : 0);

export const TRAVEL_DEFAULTS = {
  travelOn: false,
  // Hotel
  hotelRooms: "",
  hotelNightlyRate: "",
  hotelNights: "",           // prefilled from crew days, editable
  hotelTaxPct: 0.125,        // 12.5% default (AZ lodging tax ballpark)
  hotelNightsBasis: 5,       // 5 = weekdays only, 7 = include weekends
  // Fuel (either type the total via fuelCost, or compute from mileage)
  fuelMiles: "",             // round-trip miles Phoenix <-> job
  fuelTrips: "",
  fuelMPG: 18,               // F-150 default
  fuelPerGal: "",
  fuelCostManual: "",        // if set, overrides the mileage calc
  // Subsistence
  subsistenceRate: 6,        // $/worker/day default
  subsistenceInLabor: false, // if true, subsistence = $0 (already in wage)
  // Markup
  travelMarkupOn: true,
  travelMarkupPct: 0.12,     // 12% default premium on travel
  // Whether the computed travel add-on folds into the recommended bid rate
  travelAddToBid: false,
};

const nz = (x) => (x === "" || x == null || isNaN(Number(x)) ? 0 : Number(x));

/**
 * Compute the travel add-on.
 *   i     - the main input object (for weightLb, crewSize, and crew days)
 *   t     - the travel input object (fields above)
 *   crewDays - project crew days from computeEstimate (for prefills/subsistence)
 * Returns component costs, total (with optional markup), and the ¢/lb add-on.
 */
export function computeTravel(i, t, crewDays) {
  const on = !!t.travelOn;

  // Hotel: rooms × nightly × nights × (1 + tax)
  const hotelNights = nz(t.hotelNights);
  const hotelCost =
    nz(t.hotelRooms) * nz(t.hotelNightlyRate) * hotelNights * (1 + nz(t.hotelTaxPct));

  // Fuel: manual total wins; otherwise (miles × trips ÷ mpg) × $/gal
  const fuelFromMiles =
    safeDiv(nz(t.fuelMiles) * nz(t.fuelTrips), nz(t.fuelMPG)) * nz(t.fuelPerGal);
  const fuelCost = t.fuelCostManual !== "" && t.fuelCostManual != null
    ? nz(t.fuelCostManual)
    : fuelFromMiles;

  // Subsistence: workers × crew days × rate, unless already in labor
  const workers = nz(i.crewSize);
  const days = nz(crewDays);
  const subsistenceCost = t.subsistenceInLabor
    ? 0
    : workers * days * nz(t.subsistenceRate);

  const rawTotal = hotelCost + fuelCost + subsistenceCost;
  const markupPct = t.travelMarkupOn ? nz(t.travelMarkupPct) : 0;
  const total = rawTotal * (1 + markupPct);

  // Convert to ¢/lb on the rebar weight, rounded to 2 decimals for display.
  const perLb = safeDiv(total, i.weightLb);
  const centsPerLbRaw = perLb * 100;
  const centsPerLb = Math.round(centsPerLbRaw * 100) / 100;

  return {
    on,
    hotelCost,
    fuelCost,
    fuelFromMiles,
    subsistenceCost,
    rawTotal,
    markupPct,
    total,
    perLb,
    centsPerLb,       // rounded ¢/lb — the headline number
    // suggested hotel-night prefill from crew days on the chosen week basis
    suggestedNights: suggestHotelNights(crewDays, t.hotelNightsBasis),
  };
}

/**
 * Turn crew days into calendar hotel nights on a 5- or 7-day work week.
 * 5-day basis adds weekend nights back in (crew stays over) proportionally;
 * 7-day basis is just the ceiling of crew days. Always whole nights.
 */
/**
 * Fuel cost if the crew made ONE round-trip per crew day (daily driving).
 * Uses the entered miles/MPG/$-gal; returns { trips, cost } or nulls if inputs missing.
 */
export function dailyTripFuel(t, crewDays) {
  const days = Math.ceil(Number(crewDays) || 0);
  const miles = nz(t.fuelMiles), mpg = nz(t.fuelMPG), gal = nz(t.fuelPerGal);
  if (days <= 0 || miles <= 0 || mpg <= 0 || gal <= 0) return { trips: days, cost: null };
  const cost = (miles * days / mpg) * gal;
  return { trips: days, cost };
}

export function suggestHotelNights(crewDays, basis) {
  const d = Number(crewDays) || 0;
  if (d <= 0) return 0;
  if (Number(basis) === 7) return Math.ceil(d);
  // 5-day work week: every 5 work days spans 7 calendar nights.
  const weeks = Math.floor(d / 5);
  const rem = d - weeks * 5;
  return Math.ceil(weeks * 7 + rem);
}
