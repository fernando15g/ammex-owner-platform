"use client";
import { money as moneyFmt, rate as rateFmt, num as numFmt } from "@/lib/format/numbers";
import UnsavedGuard from "@/app/components/UnsavedGuard";
import { computeTravel, suggestHotelNights, dailyTripFuel, TRAVEL_DEFAULTS } from "@/lib/rules/travel";
import { confirmDialog } from "@/app/components/Dialog";

// =============================================================================
// BID DETAIL — view + amend-in-place. Edit any driver (LBS, productivity, wage,
// crew, rate, assumptions) and the economics recompute LIVE with the shared
// engine (identical math to the phone calculator). Save writes everything to
// the SAME bid — no new bids, no orphans, no stale money.
// This detail+edit pattern is the template the Billing workspace reuses.
// =============================================================================

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ManageOptions from "@/app/components/ManageOptions";
import { fmtDateLocal } from "@/lib/format/dates";
import { BID_STATUSES } from "@/lib/rules/bidSchema";
import ProposalButton from "@/app/pipeline/ProposalButton";
import { priceBid, CALC_DEFAULTS, roundToQuarterCent } from "@/lib/rules/bidCostEngine";
import { computeSpecialtyRollup, SPECIALTY_TYPES, SPECIALTY_DEFAULT_PRODUCTIVITY, newSpecialtyLine } from "@/lib/rules/specialty";

const money = (n) => (typeof n !== "number" ? "—" : moneyFmt(n));
// Margin for one side of the bid. Null when there is no revenue to divide by,
// so an empty side reads "—" instead of a misleading 0% or Infinity.
const safeMargin = (revenue, cost) => {
  const r = Number(revenue) || 0;
  if (!r) return null;
  return (r - (Number(cost) || 0)) / r;
};
// stored decimal (0.20) -> whole-number display string ("20"); FP-safe (0.03 -> "3")
// When a bid was saved with travel folded in, "Bid Rate ($/LB)" holds the
// COMBINED placement+travel rate (quarter-cent rounded) to match the calculator.
// The screen and the engine always work in PLACEMENT terms, so recover it here.
// Rebar Revenue stays pure placement, so revenue / lbs gives the placement rate
// exactly. Subtracting the add-on does NOT work: the rounding was applied to the
// sum, so 30.75 - 2.14 = 28.61, not the 28.50 that was actually bid.
const placementRateOf = (bid) => {
  if (!bid?.travelAddToBid) return bid?.bidRate ?? "";
  const lbs = Number(bid.estimatedLbs) || 0;
  const rev = Number(bid.rebarRevenue) || 0;
  if (lbs > 0 && rev > 0) return Number((rev / lbs).toFixed(6));
  // last resort for a bid saved before Rebar Revenue existed
  const cents = (Number(bid.bidRate) || 0) * 100 - (Number(bid.travelAddOnCents) || 0);
  return cents > 0 ? Number((cents / 100).toFixed(6)) : (bid.bidRate ?? "");
};

const pctLoad = (v) => (v == null || v === "" ? "" : String(+(Number(v) * 100).toFixed(4)));
const pctFmt = (f) => (typeof f === "number" ? `${(f * 100).toFixed(1)}%` : "—");
const lbsFmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : "—");

export default function BidDetailClient({ bid, lineItemCount = 0, linkedProject = null, specialty = null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // guard baseline: snapshot at edit-start; cleared on leave-edit (save OR cancel —
  // Cancel is an explicit choice to discard, the guard is for accidental exits)
  const editSnap = useRef(null);
  useEffect(() => { editSnap.current = editing ? JSON.stringify({ w, specialtyLines }) : null; }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const [w0, setW0] = useState(null);   // pristine copy, to detect real changes
  const [options, setOptions] = useState({});   // the real Notion option lists

  const reloadOptions = async () => {
    try {
      const res = await fetch("/api/notion-options?db=bids");
      const d = await res.json();
      if (d.ok) setOptions(d.options || {});
    } catch {}
  };
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/notion-options?db=bids");
        const d = await res.json();
        if (alive && d.ok) setOptions(d.options || {});
      } catch {}
    })();
    return () => { alive = false; };
  }, []);
  const [state, setState] = useState({ saving: false, saved: false, error: null });

  // Build the working copy from the bid — used at init AND to restore on Cancel.
  const initialW = () => ({
    projectName: bid.name || "",
    status: bid.status || "Reviewing",
    bidDueDate: bid.bidDueDate || "",
    cityCounty: bid.cityCounty || "",
    detailer: bid.detailer || "",
    gc: bid.gc || [],
    fabricator: bid.fabricator || [],
    projectType: bid.projectType || [],
    scope: bid.scope || "",
    notes: bid.notes || "",
    estimatedLbs: bid.estimatedLbs ?? "",
    productivity: bid.productivity ?? "",
    crewSize: bid.crewSize ?? "",
    baseWage: bid.baseWage ?? "",
    bidRate: placementRateOf(bid),
    ptSpecialty: bid.ptSpecialtyRevenue ?? "",
    // Percent fields display as WHOLE numbers (20 = 20%) but are STORED as
    // decimals (0.20) — pctLoad converts out of storage, pctVal converts back
    // for the engine. Storage and math never change.
    burdenPct: pctLoad(bid.burdenPct),
    toolsPct: pctLoad(bid.toolsPct),
    contingencyPct: pctLoad(bid.contingencyPct),
    mobilizationHrs: bid.mobilizationHrs ?? "",
    targetMarginPct: pctLoad(bid.targetMarginPct),
    hoursPerDay: bid.hoursPerDay ?? "",
    submissionDate: bid.submissionDate ?? "",
  });
  const [w, setW] = useState(initialW);
  const num0 = (v) => (v === "" || v == null ? null : Number(v)); // component-scope numeric coerce (render-safe)
  const pctVal = (v) => { const x = num0(v); return x == null ? null : x / 100; }; // typed "20" -> 0.20 for the engine
  // Rebuild editable specialty lines from the bid's saved scope so an existing
  // PT bid opens ready to edit. Guarded: no specialty → empty, panel stays off.
  const seedSpecialty = (specialty?.rows || []).map((r) => {
    const base = newSpecialtyLine(r.type);
    if (r.type === "PT Building") return { ...base, lbs: r.lbs ?? "", tons: r.lbs ? r.lbs / 2000 : "", prodLbPerMH: r.prodLbPerMH ?? SPECIALTY_DEFAULT_PRODUCTIVITY["PT Building"], rateCentsPerLb: r.rateCentsPerLb ?? "" };
    if (r.type === "Mesh") return { ...base, sqft: r.sqft ?? "", prodSqftPerMH: r.prodSqftPerMH ?? "", rateCentsPerSqft: r.rateCentsPerSqft ?? "" };
    return { ...base, hours: r.hours ?? "", ratePerHour: r.ratePerHour ?? "" };
  });
  const [specialtyLines, setSpecialtyLines] = useState(seedSpecialty);
  const [specialtyOn, setSpecialtyOn] = useState(seedSpecialty.length > 0);
  // ---- Out-of-town (travel) add-on -----------------------------------------
  // Percent fields follow the OS convention: whole numbers in the box (12.5),
  // ratios in storage (0.125). travelAddToBid and fuelCostManual are NOT stored
  // — fold-in is a quote-time choice and fuel persists as its final dollar cost.
  const seedTravel = () => ({
    ...TRAVEL_DEFAULTS,
    travelOn: !!bid.travelOn,
    hotelRooms: bid.hotelRooms ?? "",
    hotelNightlyRate: bid.hotelNightlyRate ?? "",
    hotelNights: bid.hotelNights ?? "",
    hotelTaxPct: pctLoad(bid.hotelTaxPct ?? TRAVEL_DEFAULTS.hotelTaxPct),
    hotelNightsBasis: bid.hotelNightsBasis ?? TRAVEL_DEFAULTS.hotelNightsBasis,
    fuelMiles: bid.fuelMiles ?? "",
    fuelTrips: bid.fuelTrips ?? "",
    fuelMPG: bid.fuelMPG ?? TRAVEL_DEFAULTS.fuelMPG,
    fuelPerGal: bid.fuelPerGal ?? "",
    fuelCostManual: "",
    subsistenceRate: bid.subsistenceRate ?? TRAVEL_DEFAULTS.subsistenceRate,
    subsistenceInLabor: !!bid.subsistenceInLabor,
    // A bid saved before travel existed has no checkbox to read, so fall back to
    // the default (markup ON) rather than reading a missing column as "off".
    travelMarkupOn: bid.travelOn ? !!bid.travelMarkupOn : TRAVEL_DEFAULTS.travelMarkupOn,
    travelMarkupPct: pctLoad(bid.travelMarkupPct ?? TRAVEL_DEFAULTS.travelMarkupPct),
    // Set by the calculator (or a previous OS save). Travel is never billed to
    // the GC separately, so this is the only thing that recovers the cost.
    travelAddToBid: !!bid.travelAddToBid,
  });
  const [t, setT] = useState(seedTravel);
  // ---- Overtime ---------------------------------------------------------
  // otPct is the source of truth. Hours/week is the friendlier way to think
  // about it (50 hrs -> 20%), so the two inputs stay in sync both directions.
  const [ot, setOt] = useState(() => ({
    otOn: (Number(bid.otPct) || 0) > 0,
    otPct: pctLoad(bid.otPct ?? CALC_DEFAULTS.otPct),
  }));
  const otPctVal = () => pctVal(ot.otPct) ?? 0;
  const hrsFromPct = (p) => (p >= 1 ? "" : String(Math.round((40 / (1 - p)) * 10) / 10));
  const setOtHrs = (h) => {
    const hrs = Number(h);
    if (!hrs || hrs <= 40) { setOt((s) => ({ ...s, otPct: "0" })); return; }
    setOt((s) => ({ ...s, otPct: String(Math.round(((hrs - 40) / hrs) * 10000) / 100) }));
  };
  const setTv = (k, v) => setT((s) => ({ ...s, [k]: v }));
  // A bid priced in the CALCULATOR stores specialty as four totals with no line
  // detail (specialtyForBid -> source "calc", rows: []). There is nothing to
  // seed the editor with, so those totals feed the economics directly. The
  // moment real lines exist here, they win — same precedence specialtyForBid
  // uses (OS lines > calc columns > legacy column).
  const storedSpec =
    specialty && (specialty.rows?.length ?? 0) === 0 &&
    (Number(specialty.revenue) || Number(specialty.cost) || Number(specialty.hours))
      ? {
          revenue: Number(specialty.revenue) || 0,
          cost: Number(specialty.cost) || 0,
          hours: Number(specialty.hours) || 0,
          missingBasis: specialty.missingBasis || 0,
          types: specialty.types || [],
          source: specialty.source || "calc",
        }
      : null;
  // Which specialty numbers the economics should use: live lines if the editor
  // has any, otherwise the stored totals.
  const useStoredSpec = (lines) => storedSpec != null && !(specialtyOn && lines.length > 0);
  const toggleType = (t) => setSpecialtyLines((ls) => ls.some((l) => l.type === t) ? ls.filter((l) => l.type !== t) : [...ls, newSpecialtyLine(t)]);
  const updLine = (id, patch) => setSpecialtyLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id) => setSpecialtyLines((ls) => ls.filter((l) => l.id !== id));
  const set = (k, v) => setW((s) => ({ ...s, [k]: v }));

  // Cancel: discard edits, restore original values, exit edit mode.
  function cancelEdit() {
    setW(initialW());
    setEditing(false);
    setState({ saving: false, saved: false, error: null });
  }

  // Live economics — recompute whenever drivers change (edit mode), or show the
  // stored/derived numbers in view mode. Only runs when LBS is present.
  const specRollup = useMemo(() => {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    const assumptions = {
      wageRate: n(w.baseWage) ?? CALC_DEFAULTS.wageRate,
      burdenPct: pctVal(w.burdenPct) ?? CALC_DEFAULTS.burdenPct,
      toolsPct: pctVal(w.toolsPct) ?? CALC_DEFAULTS.toolsPct,
      contingencyPct: pctVal(w.contingencyPct) ?? CALC_DEFAULTS.contingencyPct,
      targetMarginPct: pctVal(w.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct,
    };
    const roll = computeSpecialtyRollup(specialtyOn ? specialtyLines : [], { ...assumptions, otOn: !!ot.otOn, otPct: otPctVal() }, { revenue: 0, cost: 0, hours: 0 });
    if (!useStoredSpec(specialtyLines)) return roll;
    // Calculator-sourced: no rows to price, so surface the stored totals.
    const profit = storedSpec.revenue - storedSpec.cost;
    return {
      ...roll,
      specRevenue: storedSpec.revenue,
      specCost: storedSpec.cost,
      specHours: storedSpec.hours,
      missingBasis: storedSpec.missingBasis,
      specProfit: profit,
      specMargin: storedSpec.revenue ? profit / storedSpec.revenue : 0,
      storedOnly: true,
      types: storedSpec.types,
    };
  }, [specialtyLines, specialtyOn, storedSpec, ot, w.baseWage, w.burdenPct, w.toolsPct, w.contingencyPct, w.targetMarginPct]); // eslint-disable-line react-hooks/exhaustive-deps

  const econ = useMemo(() => {
    const n = (v) => (v === "" || v == null ? null : Number(v));
    if (!n(w.estimatedLbs)) return null;
    // CRITICAL: only pass fields that HAVE values — blanks must fall back to
    // the engine defaults, never override them to zero.
    // Specialty rides along so the profit/margin SAVED back to the bid are the
    // combined rebar+specialty totals — otherwise editing a PT bid here would
    // overwrite the calculator's combined figures with rebar-only ones.
    // Price specialty LIVE from the form's lines (this is what makes the OS act
    // like the calculator). Uses the same assumptions the rebar side uses.
    const assumptions = {
      wageRate: n(w.baseWage) ?? CALC_DEFAULTS.wageRate,
      burdenPct: pctVal(w.burdenPct) ?? CALC_DEFAULTS.burdenPct,
      toolsPct: pctVal(w.toolsPct) ?? CALC_DEFAULTS.toolsPct,
      contingencyPct: pctVal(w.contingencyPct) ?? CALC_DEFAULTS.contingencyPct,
      targetMarginPct: pctVal(w.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct,
    };
    const specRoll = computeSpecialtyRollup(specialtyOn ? specialtyLines : [], assumptions, { revenue: 0, cost: 0, hours: 0 });
    // Calculator-sourced specialty has no lines to price — use its stored
    // totals so contract value, profit and margin include it.
    const useStored = useStoredSpec(specialtyLines);
    const inputs = {
      weightLb: n(w.estimatedLbs),
      specialtyRevenue: useStored ? storedSpec.revenue : specRoll.specRevenue,
      specialtyCost: useStored ? storedSpec.cost : specRoll.specCost,
      specialtyHours: useStored ? storedSpec.hours : specRoll.specHours,
      otOn: !!ot.otOn,
      otPct: otPctVal(),
    };
    const add = (k, v) => { if (v != null) inputs[k] = v; };
    add("outputLbPerMH", n(w.productivity));
    add("crewSize", n(w.crewSize));
    add("wageRate", n(w.baseWage));
    add("mobilizationHrs", n(w.mobilizationHrs));
    add("burdenPct", pctVal(w.burdenPct));
    add("toolsPct", pctVal(w.toolsPct));
    add("contingencyPct", pctVal(w.contingencyPct));
    add("targetMarginPct", pctVal(w.targetMarginPct));
    add("hoursPerDay", n(w.hoursPerDay));
    return priceBid(inputs, n(w.bidRate)); // hold the active rate; null -> recommended
  }, [w, specialtyLines, specialtyOn, storedSpec, ot]); // eslint-disable-line react-hooks/exhaustive-deps

  // Travel prices off the SAME engine outputs the calculator uses: crew days for
  // hotel-night prefill and subsistence, rebar weight for the c/lb conversion.
  const travel = useMemo(() => computeTravel(
    { weightLb: num0(w.estimatedLbs), crewSize: num0(w.crewSize) },
    { ...t, hotelTaxPct: pctVal(t.hotelTaxPct), travelMarkupPct: pctVal(t.travelMarkupPct) },
    econ?.crewDays ?? 0,
  ), [t, w.estimatedLbs, w.crewSize, econ?.crewDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Folds into the quoted rate only when BOTH toggles are on; the master switch wins.
  const travelFoldsIn = !!(t.travelOn && t.travelAddToBid);
  const placementCents = (econ?.bidRatePerLb ?? 0) * 100;
  const bidWithTravelCents = placementCents + (t.travelOn ? travel.centsPerLb : 0);
  const dailyFuel = dailyTripFuel({ ...t }, econ?.crewDays ?? 0);

  // Combined OT across rebar and specialty — what the "Estimated OT" line shows
  // and what the (calc) columns store. Already inside fully-loaded cost, so this
  // is for display only: never add it to cost again.
  const otTotals = (() => {
    if (!ot.otOn || !econ) return { hours: 0, premium: 0 };
    const specHours = (specRollup?.rows || []).reduce((a, r) => a + (r.hours || 0), 0);
    const specPrem = (specRollup?.rows || []).reduce((a, r) => a + (r.otPremium || 0), 0);
    return {
      hours: (econ.otHours || 0) + specHours * otPctVal(),
      premium: (econ.otPremium || 0) + specPrem,
    };
  })();

  // Travel is NEVER billed to the GC on its own line. So the cash goes out
  // either way, and the only question is whether the bid rate recovered it:
  //   absorbed  -> revenue unchanged, cost up by the real spend  (profit DOWN)
  //   in rate   -> revenue up by the marked-up total             (profit UP by the markup)
  // The markup is margin on travel, not a cost, so cost is rawTotal in both.
  const travelStates = useMemo(() => {
    if (!econ || !t.travelOn || !(travel.total > 0)) return null;
    const spend = travel.rawTotal;
    const absorbedProfit = econ.operatingProfit - spend;
    const addedRevenue = econ.contractValue + travel.total;
    const addedProfit = econ.operatingProfit + (travel.total - spend);
    return {
      spend,
      absorbed: {
        rateCents: placementCents,
        revenue: econ.contractValue,
        profit: absorbedProfit,
        margin: econ.contractValue ? absorbedProfit / econ.contractValue : 0,
      },
      added: {
        rateCents: placementCents + travel.centsPerLb,
        revenue: addedRevenue,
        profit: addedProfit,
        margin: addedRevenue ? addedProfit / addedRevenue : 0,
      },
    };
  }, [econ, t.travelOn, travel, placementCents]);

  // "Save" only says Update once something has actually changed.
  const dirty = editing && JSON.stringify(w) !== JSON.stringify(w0);

  async function deleteBid() {
    const ok = await confirmDialog({
      title: `Delete "${bid.projectName}"?`,
      message: "Its line items go with it. All records are archived (recoverable in Notion).",
      confirmLabel: "Delete bid",
      danger: true,
      typeToConfirm: "DELETE",
    });
    if (!ok) return;
    setState({ saving: true, saved: false, error: null });
    try {
      let res = await fetch(`/api/bids/${bid.id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      let d = await res.json();
      // Blocked (it became a project, or its lines were billed). Offer to force —
      // useful for clearing test data without opening Notion.
      if (!d.ok && d.blocked && d.forceable) {
        const forced = await confirmDialog({
          title: "Delete anyway?",
          message: `${d.error}\nForcing removes the bid and ALL of its line items.`,
          confirmLabel: "Force delete",
          danger: true,
          typeToConfirm: "DELETE",
        });
        if (!forced) { setState({ saving: false, saved: false, error: null }); return; }
        res = await fetch(`/api/bids/${bid.id}/delete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
        d = await res.json();
      }
      if (!d.ok) throw new Error(d.error);
      // Notion's reads lag ~1s behind the archive. Landing on the bid list
      // inside that window shows the just-deleted bid as a ghost row (and used
      // to cache it). Waiting the lag out means the list arrives truthful.
      await new Promise((r) => setTimeout(r, 1400));
      window.location.href = "/pipeline";
    } catch (e) { setState({ saving: false, saved: false, error: String(e.message || e) }); }
  }

  async function save() {
    setState({ saving: true, saved: false, error: null });
    try {
      const n = (v) => (v === "" || v == null ? null : Number(v));
      const changes = {
        projectName: w.projectName,
        status: w.status,
        bidDueDate: w.bidDueDate || null,
        submissionDate: w.submissionDate || null,
        cityCounty: w.cityCounty,
        detailer: w.detailer || null,
        gc: w.gc, fabricator: w.fabricator, projectType: w.projectType,
        scope: w.scope, notes: w.notes,
        estimatedLbs: n(w.estimatedLbs),
        productivity: n(w.productivity),
        crewSize: n(w.crewSize),
        baseWage: n(w.baseWage),
        ptSpecialty: n(w.ptSpecialty),
      };
      // Travel add-on. Written only when travel is on for this bid (or was, so
      // turning it off persists). Every key sent is one the user just edited —
      // toNotionProps writes only the keys present, so nothing else is touched.
      // travelAddToBid and fuelCostManual are deliberately NOT sent: fold-in is
      // a quote-time choice, and fuel persists as its final dollar cost.
      if (t.travelOn || bid.travelOn) {
        changes.travelOn = !!t.travelOn;
        changes.hotelRooms = n(t.hotelRooms);
        changes.hotelNightlyRate = n(t.hotelNightlyRate);
        changes.hotelNights = n(t.hotelNights);
        changes.hotelTaxPct = pctVal(t.hotelTaxPct);
        changes.hotelNightsBasis = n(t.hotelNightsBasis);
        changes.fuelMiles = n(t.fuelMiles);
        changes.fuelTrips = n(t.fuelTrips);
        changes.fuelMPG = n(t.fuelMPG);
        changes.fuelPerGal = n(t.fuelPerGal);
        changes.subsistenceRate = n(t.subsistenceRate);
        changes.subsistenceInLabor = !!t.subsistenceInLabor;
        changes.travelMarkupOn = !!t.travelMarkupOn;
        changes.travelMarkupPct = pctVal(t.travelMarkupPct);
        changes.travelAddToBid = !!t.travelAddToBid;
        // computed outputs, so Notion and the OS agree without recomputing
        changes.hotelCost = travel.hotelCost;
        changes.fuelCost = travel.fuelCost;
        changes.subsistenceCost = travel.subsistenceCost;
        changes.travelTotal = travel.total;
        changes.travelAddOnCents = travel.centsPerLb;
      }
      if (econ) {
        // amended economics — same engine as the calculator, saved to this bid
        // Bid Rate matches the calculator: with travel folded in we store the
        // COMBINED placement+travel rate, quarter-cent rounded on the SUM.
        // Rebar Revenue below stays PURE placement, which is also what lets the
        // placement rate be recovered when this bid is reopened.
        changes.bidRate = travelFoldsIn
          ? roundToQuarterCent(econ.bidRatePerLb * 100 + travel.centsPerLb) / 100
          : econ.bidRatePerLb;
        changes.operatingProfit = econ.operatingProfit;
        changes.operatingMargin = econ.operatingMargin;
        changes.fullyLoadedCost = econ.fullyLoadedCost;
        changes.burdenedLaborCost = econ.burdenedLaborCost;
        changes.burdenPct = econ.assumptions.burdenPct;
        changes.toolsPct = econ.assumptions.toolsPct;
        changes.contingencyPct = econ.assumptions.contingencyPct;
        changes.mobilizationHrs = econ.assumptions.mobilizationHrs;
        changes.targetMarginPct = econ.assumptions.targetMarginPct;
        // Keep the bid's specialty rollup in step with its line items, so
        // performance and realized economics read the same figure the bid shows.
        changes.rebarRevenue = econ.rebarRevenue;
        // OT: otPct is the source of truth; the other three are display totals
        // across rebar + specialty. Zeros when off keeps old bids comparable.
        changes.otPct = ot.otOn ? otPctVal() : 0;
        changes.otCentsPerLb = ot.otOn ? (econ.otCentsPerLb || 0) : 0;
        changes.otHours = ot.otOn ? otTotals.hours : 0;
        changes.otPremium = ot.otOn ? otTotals.premium : 0;
        changes.specialtyRevenue = econ.specialtyRevenue;
        changes.specialtyCost = econ.specialtyCost;
        changes.specialtyHours = econ.specialtyHours;
      } else if (n(w.bidRate) != null) {
        changes.bidRate = n(w.bidRate);
      }
      // 1) persist specialty scope as billable line items (mirrors the calc, but
      //    the OS owns billing). Priced values come straight from the rows.
      const specPayload = specialtyOn ? specRollup.rows.map((r) => {
        const src = specialtyLines.find((l) => l.id === r.id) || {};
        if (r.type === "PT Building") return { type: r.type, qty: Number(src.lbs) || 0, unitPrice: (Number(src.rateCentsPerLb) || 0) / 100, productivity: src.prodLbPerMH };
        if (r.type === "Mesh") return { type: r.type, qty: Number(src.sqft) || 0, unitPrice: (Number(src.rateCentsPerSqft) || 0) / 100, productivity: src.prodSqftPerMH };
        return { type: r.type, qty: Number(src.hours) || 0, unitPrice: Number(src.ratePerHour) || 0, productivity: "" };
      }).filter((x) => x.qty > 0) : [];
      const sres = await fetch(`/api/bids/${bid.id}/specialty`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: specPayload }),
      });
      const sdata = await sres.json().catch(() => ({}));
      if (!sdata.ok) throw new Error(`Specialty lines did not save: ${sdata.error || "unknown error"}`);
      // Only restate the types when this screen actually owns the lines. A bid
      // priced in the CALCULATOR stores specialty as totals with no line detail,
      // so specRollup.rows is empty here — writing [] would wipe the bid's real
      // Specialty Type in Notion (losing the PT/Mesh tag and the classification
      // with it). Leave the key off entirely and Notion keeps what it has.
      if (specialtyOn && specRollup.rows.length > 0) {
        changes.specialtyTypes = [...new Set(specRollup.rows.map((r) => r.type))];
      } else if (specialtyLines.length > 0 && !specialtyOn) {
        // the editor was used and then deliberately turned off — that IS a clear
        changes.specialtyTypes = [];
      }

      // 2) save the bid + its combined rollup
      const res = await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Save failed");
      // Notion is eventually consistent (~1s write-to-read lag). If we drop to
      // view mode immediately, it repaints with the OLD props and looks like the
      // save didn't take (e.g. the date reverting). So: stay in a "Saving…" state,
      // wait out the lag, refresh server data, and only THEN show view mode — so
      // the value you see is always the value that saved. (Instant on Postgres.)
      await new Promise((r) => setTimeout(r, 1400));
      router.refresh();
      await new Promise((r) => setTimeout(r, 300));
      setState({ saving: false, saved: true, error: null });
      setEditing(false);
      return true;
    } catch (e) {
      setState({ saving: false, saved: false, error: String(e.message || e) });
    }
  }

  return (
    <div className="lg:flex lg:gap-8 max-w-5xl">
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center gap-3">
          <span className="ml-auto" />
          <a href={`/pipeline/${bid.id}/sheet`} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">{lineItemCount > 0 ? "View bid sheet" : "Create bid sheet"}</a>
          {lineItemCount > 0 && (
            <ProposalButton
              bidId={bid.id}
              bidName={bid.name}
              status={bid.status}
              submissionDate={bid.submissionDate}
            />
          )}
          {linkedProject ? (
            <a href={`/projects/${linkedProject.id}`} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">Project: {linkedProject.projectId || linkedProject.name}</a>
          ) : bid.status === "Awarded" ? (
            <a href={`/projects/new?fromBid=${bid.id}&name=${encodeURIComponent(bid.projectName || "")}`} className="text-sm px-4 py-2 rounded-md bg-ok/20 border border-ok/50 text-ok font-medium">Create project</a>
          ) : null}
          {state.saved && !editing && <span className="text-xs text-ok">Saved ✓</span>}
          {!editing ? (
            <button onClick={() => { setW0(JSON.parse(JSON.stringify(w))); setEditing(true); setState({ saving: false, saved: false, error: null }); }} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Edit</button>
          ) : (
            <>
              <button onClick={save} disabled={state.saving} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{state.saving ? "Saving…" : dirty ? "Update" : "Save"}</button>
              <button onClick={cancelEdit} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
              <button onClick={deleteBid} disabled={state.saving} className="text-sm px-4 py-2 rounded-md border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40">{state.saving ? "Deleting…" : "Delete bid"}</button>
            </>
          )}
        </div>

        {state.error && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80">Couldn&apos;t save: {state.error}</div>}

        <Section title="Bid info">
          <Grid>
            <F label="Project name" edit={editing} value={w.projectName} onChange={(v) => set("projectName", v)} />
            <FSelect label="Status" edit={editing} value={w.status} options={BID_STATUSES} onChange={(v) => set("status", v)} />
            <FDate label="Submitted" edit={editing} value={w.submissionDate} onChange={(v) => set("submissionDate", v)} />
            <FDate label="Bid due date" edit={editing} value={w.bidDueDate} onChange={(v) => set("bidDueDate", v)} />
            <F label="City / County" edit={editing} value={w.cityCounty} onChange={(v) => set("cityCounty", v)} />
            <FSelectOpt label="Detailer" edit={editing} value={w.detailer} options={options["Detailer"]} onChange={(v) => set("detailer", v)} manageProp="Detailer" onOptionsChanged={reloadOptions} />
            <FChips label="GC" edit={editing} items={w.gc} onChange={(v) => set("gc", v)} options={options["GC"]} manageProp="GC" onOptionsChanged={reloadOptions} />
            <FChips label="Fabricator" edit={editing} items={w.fabricator} onChange={(v) => set("fabricator", v)} options={options["Fabricator"]} manageProp="Fabricator" onOptionsChanged={reloadOptions} />
            <FChips label="Project type" edit={editing} items={w.projectType} onChange={(v) => set("projectType", v)} options={options["Project Type"]} manageProp="Project Type" onOptionsChanged={reloadOptions} />
          </Grid>
          <FArea label="Scope" edit={editing} value={w.scope} onChange={(v) => set("scope", v)} />
          <FArea label="Notes" edit={editing} value={w.notes} onChange={(v) => set("notes", v)} />
        </Section>

        <Section title="Drivers" hint={editing ? "change any of these — economics recompute live →" : null}>
          <Grid>
            <UnsavedGuard dirty={() => editing && !state.saving && editSnap.current != null && JSON.stringify({ w, specialtyLines }) !== editSnap.current} onSave={save} what="this bid" />
            <FNum label="Estimated LBS" edit={editing} value={w.estimatedLbs} onChange={(v) => set("estimatedLbs", v)} />
            <FNum label="Productivity (LBS/MH)" edit={editing} value={w.productivity} onChange={(v) => set("productivity", v)} placeholder={String(CALC_DEFAULTS.outputLbPerMH)} />
            <FNum label="Bid rate ($/lb)" edit={editing} value={w.bidRate} onChange={(v) => set("bidRate", v)} step="0.0001" prefix="$" hint="blank = use recommended" />
            <FNum label="Crew size" edit={editing} value={w.crewSize} onChange={(v) => set("crewSize", v)} />
            <FNum label="Base wage" edit={editing} value={w.baseWage} onChange={(v) => set("baseWage", v)} placeholder={String(CALC_DEFAULTS.wageRate)} prefix="$" />
            {!editing && num0(w.ptSpecialty) ? <FNum label="PT / Specialty revenue (legacy)" edit={false} value={w.ptSpecialty} onChange={() => {}} prefix="$" /> : null}
          </Grid>
          {editing && (
            <details className="mt-3">
              <summary className="text-xs text-rebar cursor-pointer hover:text-concrete">Assumptions (burden, tools, contingency, target margin, mob hrs)</summary>
              <Grid className="mt-3">
                <FNum label="Burden %" edit value={w.burdenPct} onChange={(v) => set("burdenPct", v)} step="1" placeholder="20" suffix="%" />
                <FNum label="Tools %" edit value={w.toolsPct} onChange={(v) => set("toolsPct", v)} step="1" placeholder="3" suffix="%" />
                <FNum label="Contingency %" edit value={w.contingencyPct} onChange={(v) => set("contingencyPct", v)} step="1" placeholder="3" suffix="%" />
                <div>
              <L>Overtime</L>
              <button type="button" onClick={() => setOt((s) => ({ ...s, otOn: !s.otOn }))}
                className={`w-full text-xs px-2 py-2 rounded-md border ${ot.otOn ? "bg-safety text-steel border-safety font-medium" : "border-line text-rebar hover:text-concrete"}`}>
                {ot.otOn ? "On" : "Off"}
              </button>
            </div>
            {ot.otOn && (
              <>
                <SF label="Planned hrs/week" value={hrsFromPct(otPctVal())} onChange={setOtHrs}
                  hint="per person \u2014 50 hrs is 20% OT" />
                <SF label="OT %" value={ot.otPct} onChange={(v) => setOt((s) => ({ ...s, otPct: v }))} suffix="%" />
              </>
            )}
            <FNum label="Target margin %" edit value={w.targetMarginPct} onChange={(v) => set("targetMarginPct", v)} step="1" placeholder="25" suffix="%" />
                <FNum label="Mobilization hrs" edit value={w.mobilizationHrs} onChange={(v) => set("mobilizationHrs", v)} placeholder="8" />
                <FNum label="Hours per day" edit value={w.hoursPerDay} onChange={(v) => set("hoursPerDay", v)} placeholder="8" />
              </Grid>
            </details>
          )}

          <SpecialtyEditor
            editing={editing}
            on={specialtyOn}
            setOn={setSpecialtyOn}
            lines={specialtyLines}
            rows={specRollup.rows}
            targetMargin={pctVal(w.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct}
            toggleType={toggleType}
            updLine={updLine}
            removeLine={removeLine}
            rollup={specRollup}
          />

          <TravelPanel
            editing={editing}
            t={t}
            setTv={setTv}
            travel={travel}
            dailyFuel={dailyFuel}
            crewDays={econ?.crewDays ?? 0}
            foldsIn={travelFoldsIn}
          />
        </Section>
      </div>

      {/* Economics — live, same engine as the calculator */}
      <div className="lg:w-80 shrink-0 mt-8 lg:mt-0">
        <div className="rounded-lg border border-line p-5 lg:sticky lg:top-24" style={{ background: "var(--surface)" }}>
          <p className="text-[11px] uppercase tracking-wider text-rebar mb-3">Economics {editing && <span className="text-safety normal-case">· live</span>}</p>
          {econ ? (
            <div className="space-y-2.5 text-sm">
              <Row label={Number(w.bidRate) > 0 ? "Bid rate (yours)" : "Bid rate (recommended)"} value={rateFmt(Number(econ.bidRatePerLb))} big />
              {t.travelOn && travel.total > 0 && (
                <Row label="Travel add-on" value={rateFmt(travel.centsPerLb / 100)} sub={`${money(travel.total)} to recover`} />
              )}
              <Row label="Contract value" value={money(econ.contractValue)} />
              <Row label="Operating profit" value={money(econ.operatingProfit)} tone="ok" />
              <Row label={econ.specialtyRevenue > 0 ? "Operating margin (combined)" : "Operating margin"} value={pctFmt(econ.operatingMargin)} tone="ok" />
              {/* With specialty in the bid, one blended margin hides which side
                  carries the job — so break it out. Combined stays the headline
                  because that is what actually gets paid. */}
              {econ.specialtyRevenue > 0 && (
                <div className="pl-3 space-y-1.5 border-l border-line ml-0.5">
                  <Row
                    label="· Rebar margin"
                    value={pctFmt(safeMargin(econ.rebarRevenue, econ.rebarCost))}
                    sub={`${money(econ.rebarRevenue)} rev`}
                  />
                  <Row
                    label="· Specialty margin"
                    value={specRollup.missingBasis > 0 ? "—" : pctFmt(safeMargin(econ.specialtyRevenue, econ.specialtyCost))}
                    sub={specRollup.missingBasis > 0
                      ? "no cost basis stored — margin unknown"
                      : `${money(econ.specialtyRevenue)} rev`}
                    tone={specRollup.missingBasis > 0 ? "warn" : undefined}
                  />
                </div>
              )}
              {travelStates && <TravelImpact st={travelStates} foldsIn={travelFoldsIn} target={pctVal(w.targetMarginPct) ?? CALC_DEFAULTS.targetMarginPct} placementMargin={econ.operatingMargin} />}
              {ot.otOn && otTotals.premium > 0 && (
                <Row label="Estimated OT" value={`${numFmt(otTotals.hours)} hrs`}
                  sub={`${money(otTotals.premium)} premium at ${pctFmt(otPctVal())} \u00b7 already in cost`} />
              )}
              <Row label="Fully-loaded cost" value={money(econ.fullyLoadedCost)} />
              {!(specRollup.specRevenue > 0) && <Row label="Burdened labor" value={money(econ.burdenedLaborCost)} />}
              <Row label="Total man-hours" value={lbsFmt(Math.round(econ.totalMHCombined ?? econ.totalMH))} sub={econ.specialtyHours > 0 ? `rebar ${lbsFmt(Math.round(econ.totalMH))} + specialty ${lbsFmt(Math.round(econ.specialtyHours))}` : null} />
              <div className="pt-2 mt-2 border-t border-line text-xs text-rebar leading-relaxed">
                {Number(w.bidRate) > 0 ? (
                  <>Using your rate of {(Number(w.bidRate) * 100).toFixed(2)}¢/lb. Clear the bid rate to use the recommended rate.</>
                ) : (
                  <>To hit the {(econ.assumptions.targetMarginPct * 100).toFixed(0)}% target margin, recommended {econ.recommendedCents.toFixed(2)}¢/lb → rounded to {econ.roundedCents}¢.</>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-rebar">No LBS on this bid — enter Estimated LBS to see economics. Stored money (if any): profit {money(bid.operatingProfit)}, margin {pctFmt(bid.operatingMargin)}.</p>
          )}
          <p className="text-[11px] text-rebar mt-4 leading-relaxed">Same math as the calculator — amendments recompute and save to this bid, never a new one.</p>
        </div>

        {specRollup.specRevenue > 0 && <SpecialtyLive rollup={specRollup} />}
      </div>
    </div>
  );
}

// ---- field components: render text in view mode, inputs in edit mode --------
function Row({ label, value, big, tone, sub }) {
  const c = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-concrete";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-rebar text-xs">{label}</span>
        <span className={`${big ? "text-lg font-semibold" : "text-sm"} ${c} tabular-nums text-right`}>{value}</span>
      </div>
      {sub && <div className="text-right text-[10px] text-rebar/70 tabular-nums">{sub}</div>}
    </div>
  );
}

function Section({ title, hint, children }) {
  return (<section><h2 className="text-sm font-semibold text-concrete border-b border-line pb-2 mb-4">{title}{hint && <span className="text-xs text-safety font-normal ml-2">{hint}</span>}</h2><div className="space-y-4">{children}</div></section>);
}
// What travel actually does to the bottom line. Travel is never billed to the
// GC separately, so the spend happens either way — the bid rate is the only
// thing that recovers it. Shows both outcomes; the live one is highlighted.
function TravelImpact({ st, foldsIn, target, placementMargin }) {
  // Only the state you actually chose is shown. Absorbed is scored against the
  // work target because travel comes straight out of the work's margin there.
  // Recovered is not scored: the work keeps its margin and travel rides at its
  // own markup, so the blended figure sits lower by design.
  const s2 = foldsIn ? st.added : st.absorbed;
  return (
    <div className="space-y-1.5 pt-1">
      <div className="text-[10px] uppercase tracking-wider text-rebar">
        Travel impact · {money(st.spend)} out of pocket
      </div>
      <div className="rounded-md border border-line p-2.5" style={{ background: "var(--surface-2)" }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-concrete font-medium">
            {foldsIn ? "Added to the bid rate" : "Not in the bid rate"}
          </span>
          <span className="text-[11px] text-rebar tabular-nums">{rateFmt(s2.rateCents / 100)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-1">
          <span className="text-[10px] text-rebar/70">
            {foldsIn ? "recovered from the GC" : "you absorb it — comes out of the work"}
          </span>
          <span className="text-sm tabular-nums text-concrete">
            {money(s2.profit)}
            <span className={`ml-2 ${foldsIn ? "text-rebar" : (s2.margin >= target ? "text-ok" : "text-warn")}`}>
              {(s2.margin * 100).toFixed(1)}%
            </span>
          </span>
        </div>
      </div>
      <p className="text-[10px] text-rebar/70">
        {foldsIn
          ? `The work keeps its ${(placementMargin * 100).toFixed(1)}% margin; travel rides at its own markup, so the blended figure sits a little lower on purpose.`
          : `Travel comes straight out of the work here, scored against your ${(target * 100).toFixed(0)}% target. Add it to the bid rate to recover it.`}
      </p>
    </div>
  );
}

// Out-of-town cost add-on: hotel + fuel + subsistence, labor-independent.
// Read-only summary when not editing; full inputs when editing.
function TravelPanel({ editing, t, setTv, travel, dailyFuel, crewDays, foldsIn }) {
  const on = !!t.travelOn;
  if (!editing && !on) return null;               // nothing to show on local jobs
  return (
    <div className="mt-4 rounded-lg border border-line p-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-concrete">Out-of-town costs</h3>
          <p className="text-[11px] text-rebar mt-0.5">
            Hotel, fuel and subsistence. Priced outside the labor multipliers and the target margin.
          </p>
        </div>
        {editing && (
          <button type="button" onClick={() => setTv("travelOn", !on)}
            className={`text-xs px-3 py-1.5 rounded-md border ${on ? "bg-safety text-steel border-safety font-medium" : "border-line text-rebar hover:text-concrete"}`}>
            {on ? "On" : "Off"}
          </button>
        )}
      </div>

      {on && (
        <>
          {editing && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-rebar mb-2">Hotel</p>
                <Grid>
                  <SF label="Rooms" value={t.hotelRooms} onChange={(v) => setTv("hotelRooms", v)} />
                  <SF label="Nightly rate" value={t.hotelNightlyRate} onChange={(v) => setTv("hotelNightlyRate", v)} prefix="$" />
                  <SF label="Nights" value={t.hotelNights} onChange={(v) => setTv("hotelNights", v)}
                    hint={`${crewDays ? crewDays.toFixed(1) : 0} crew days \u2192 suggest ${travel.suggestedNights}`} />
                  <SF label="Lodging tax" value={t.hotelTaxPct} onChange={(v) => setTv("hotelTaxPct", v)} suffix="%" />
                  <div>
                    <span className="text-[10px] text-rebar block mb-1">Week basis</span>
                    <div className="flex gap-1">
                      {[5, 7].map((b) => (
                        <button key={b} type="button" onClick={() => setTv("hotelNightsBasis", b)}
                          className={`flex-1 text-xs px-2 py-2 rounded-md border ${Number(t.hotelNightsBasis) === b ? "bg-graphite text-concrete border-line" : "border-line text-rebar hover:text-concrete"}`}>
                          {b === 5 ? "5-day (stay over)" : "7-day"}
                        </button>
                      ))}
                    </div>
                  </div>
                </Grid>
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-rebar mb-2">Fuel</p>
                <Grid>
                  <SF label="Round-trip miles" value={t.fuelMiles} onChange={(v) => setTv("fuelMiles", v)} />
                  <SF label="Trips" value={t.fuelTrips} onChange={(v) => setTv("fuelTrips", v)} />
                  <SF label="MPG" value={t.fuelMPG} onChange={(v) => setTv("fuelMPG", v)} />
                  <SF label="Price per gallon" value={t.fuelPerGal} onChange={(v) => setTv("fuelPerGal", v)} prefix="$" />
                  <SF label="Or enter fuel total" value={t.fuelCostManual} onChange={(v) => setTv("fuelCostManual", v)} prefix="$"
                    hint="overrides the mileage math" />
                </Grid>
                {dailyFuel.cost != null && (
                  <p className="text-[11px] text-rebar/70 mt-2">
                    One round trip per crew day would be {dailyFuel.trips} trips — {money(dailyFuel.cost)}. Reference only.
                  </p>
                )}
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-wider text-rebar mb-2">Subsistence &amp; markup</p>
                <Grid>
                  <SF label="Per worker per day" value={t.subsistenceRate} onChange={(v) => setTv("subsistenceRate", v)} prefix="$" />
                  <div>
                    <span className="text-[10px] text-rebar block mb-1">Already in the wage?</span>
                    <button type="button" onClick={() => setTv("subsistenceInLabor", !t.subsistenceInLabor)}
                      className={`w-full text-xs px-2 py-2 rounded-md border ${t.subsistenceInLabor ? "bg-graphite text-concrete border-line" : "border-line text-rebar hover:text-concrete"}`}>
                      {t.subsistenceInLabor ? "Yes \u2014 not charged again" : "No \u2014 charge it"}
                    </button>
                  </div>
                  <SF label="Travel markup" value={t.travelMarkupPct} onChange={(v) => setTv("travelMarkupPct", v)} suffix="%"
                    hint={t.travelMarkupOn ? "" : "currently off"} />
                  <div>
                    <span className="text-[10px] text-rebar block mb-1">Apply markup</span>
                    <button type="button" onClick={() => setTv("travelMarkupOn", !t.travelMarkupOn)}
                      className={`w-full text-xs px-2 py-2 rounded-md border ${t.travelMarkupOn ? "bg-graphite text-concrete border-line" : "border-line text-rebar hover:text-concrete"}`}>
                      {t.travelMarkupOn ? "On" : "Off"}
                    </button>
                  </div>
                </Grid>
              </div>
            </div>
          )}

          {/* totals — always visible when travel is on */}
          <div className="mt-4 pt-3 border-t border-line space-y-1.5">
            <Row label="Hotel" value={money(travel.hotelCost)} />
            <Row label="Fuel" value={money(travel.fuelCost)} />
            <Row label="Subsistence" value={money(travel.subsistenceCost)}
              sub={t.subsistenceInLabor ? "already in the wage" : undefined} />
            {travel.markupPct > 0 && (
              <Row label={`Markup (${pctFmt(travel.markupPct)})`} value={money(travel.total - travel.rawTotal)} />
            )}
            <Row label="Travel total" value={money(travel.total)} big />
            <Row label="Add-on" value={rateFmt(travel.centsPerLb / 100)} tone="ok" />
          </div>

          {editing && (
            <button type="button" onClick={() => setTv("travelAddToBid", !t.travelAddToBid)}
              className={`mt-3 w-full text-xs px-3 py-2 rounded-md border ${foldsIn ? "bg-safety text-steel border-safety font-medium" : "border-line text-concrete hover:bg-graphite"}`}>
              {foldsIn ? "Travel is folded into the bid rate" : "Add travel to the bid rate"}
            </button>
          )}
          <p className="text-[10px] text-rebar/70 mt-2">
            The saved bid rate stays placement-only — travel is stored in its own columns, so rebar revenue keeps matching rate × lbs.
          </p>
        </>
      )}
    </div>
  );
}

function Grid({ children, className = "" }) { return <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>{children}</div>; }
function L({ children }) { return <span className="text-xs text-rebar block mb-1">{children}</span>; }
function V({ children }) { return <span className="text-sm text-concrete">{children || "—"}</span>; }

function F({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <input className="inp" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{value}</V>}</div>);
}
function FNum({ label, edit, value, onChange, step, placeholder, hint, prefix, suffix }) {
  return (<div><L>{label}{hint && edit && <span className="ml-1 text-rebar/70">· {hint}</span>}</L>{edit ? (
    (prefix || suffix) ? (
      <div className="inp flex items-center gap-1">
        {prefix && <span className="text-rebar select-none">{prefix}</span>}
        <input type="number" step={step || "any"} className="w-full bg-transparent text-concrete focus:outline-none" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        {suffix && <span className="text-rebar select-none">{suffix}</span>}
      </div>
    ) : (
      <input type="number" step={step || "any"} className="inp" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    )
  ) : <V>{value === "" || value == null ? "—" : `${prefix || ""}${Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 })}${suffix || ""}`}</V>}</div>);
}
function FDate({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <input type="date" className="inp" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{fmtDateLocal(value)}</V>}</div>);
}
function FSelectOpt({ label, edit, value, options = [], onChange, manageProp, onOptionsChanged }) {
  // Single-select from the real Notion options (blank allowed), with a "+ New"
  // to type a name that isn't in the list yet. The field is a Notion Select, so
  // writing a new value auto-creates the option on save (selects auto-create).
  const [adding, setAdding] = useState(false);
  // Always include the current value in the option list, even if it's a new name
  // that isn't in Notion yet — otherwise the <select> can't show it and it looks
  // like the entry vanished.
  const base = options && options.length ? options : [];
  const list = value && !base.includes(value) ? [...base, value] : base;
  if (!edit) return <div><L>{label}</L><V>{value}</V></div>;
  return (
    <div><L>{label}{manageProp && <ManageOptions prop={manageProp} onChanged={onOptionsChanged} />}</L>
      {adding ? (
        <div className="flex gap-1.5">
          <input
            autoFocus
            className="inp"
            value={value || ""}
            placeholder="Type a new name"
            onChange={(e) => onChange(e.target.value)}
          />
          <button type="button" onClick={() => setAdding(false)} className="text-xs px-2.5 rounded border border-line text-rebar hover:text-concrete whitespace-nowrap">Done</button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <select className="inp" value={value || ""} onChange={(e) => onChange(e.target.value)}>
            <option value="">{list.length ? "—" : "No options"}</option>
            {list.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <button type="button" onClick={() => setAdding(true)} title="Add a name that doesn't exist yet" className="text-xs px-2.5 rounded border border-line text-rebar hover:text-concrete whitespace-nowrap">+ New</button>
        </div>
      )}
    </div>
  );
}

function FSelect({ label, edit, value, options, onChange }) {
  return (<div><L>{label}</L>{edit ? <select className="inp" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select> : <V>{value}</V>}</div>);
}
function FArea({ label, edit, value, onChange }) {
  return (<div><L>{label}</L>{edit ? <textarea className="inp min-h-[56px] w-full" value={value} onChange={(e) => onChange(e.target.value)} /> : <V>{value}</V>}</div>);
}
// Pick from the options that actually exist in Notion. Adding a genuinely new
// one is still possible — but it's a deliberate act, not a typo. (Notion creates
// the option on write, which is exactly why free text was breeding duplicates.)
function FChips({ label, edit, items, onChange, options = [], manageProp, onOptionsChanged }) {
  const [adding, setAdding] = useState(false);
  const available = (options || []).filter((o) => !items.includes(o));

  const addNew = (e) => {
    const v = e.target.value.trim();
    if (e.key === "Enter" && v) {
      e.preventDefault();
      if (!items.includes(v)) onChange([...items, v]);
      e.target.value = "";
      setAdding(false);
    }
    if (e.key === "Escape") setAdding(false);
  };

  return (
    <div>
      <L>{label}{edit && manageProp && <ManageOptions prop={manageProp} onChanged={onOptionsChanged} />}</L>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {items.map((it, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-xs border border-line rounded-full px-2.5 py-0.5 text-concrete" style={{ background: "var(--surface-2)" }}>
              {it}
              {edit && <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-rebar hover:text-danger">✕</button>}
            </span>
          ))}
        </div>
      )}

      {edit ? (
        adding ? (
          <input
            autoFocus
            className="inp"
            placeholder="New name + Enter (creates a new option)"
            onKeyDown={addNew}
            onBlur={() => setAdding(false)}
          />
        ) : (
          <div className="flex gap-2">
            <select
              className="inp"
              value=""
              onChange={(e) => { if (e.target.value) onChange([...items, e.target.value]); }}
            >
              <option value="">{available.length ? "Add…" : "No options left"}</option>
              {available.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs px-2.5 rounded border border-line text-rebar hover:text-concrete whitespace-nowrap"
              title="Create an option that doesn't exist yet"
            >
              + New
            </button>
          </div>
        )
      ) : items.length === 0 ? <V /> : null}
    </div>
  );
}


// -----------------------------------------------------------------------------
// SPECIALTY EDITOR — price PT and mesh right here, like the calculator, so a bid
// can be built entirely in the OS. Each line computes revenue/cost/hours/margin
// live and saves as a billable line item. Same three types, same cost stack.
// -----------------------------------------------------------------------------
function SpecialtyEditor({ editing, on, setOn, lines, rows, targetMargin, toggleType, updLine, removeLine, rollup }) {
  const usd = (v) => `$${Math.round(v || 0).toLocaleString()}`;
  const pct = (v) => `${((v || 0) * 100).toFixed(1)}%`;
  const num = (v, d = 0) => (v || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  const rowFor = (id) => rows.find((r) => r.id === id) || {};

  // Read-only summary when not editing (and there IS specialty)
  if (!editing) {
    if (!on || lines.length === 0) return null;
    return (
      <div className="mt-4 rounded-lg border border-line p-4" style={{ background: "var(--surface)" }}>
        <p className="text-[11px] uppercase tracking-wider text-rebar mb-2">Specialty scope</p>
        <div className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <div key={r.id} className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-wide text-safety">{r.type}</span>
              <span className="text-rebar text-xs">{r.qtyLabel}</span>
              <span className="ml-auto text-concrete tabular-nums">{usd(r.revenue)}</span>
              <span className="text-concrete/70 tabular-nums text-xs w-14 text-right">{r.hasCostBasis ? pct(r.margin) : "—"}</span>
            </div>
          ))}
          <div className="flex items-baseline gap-2 pt-1.5 border-t border-line">
            <span className="text-concrete font-medium text-xs">Specialty total</span>
            <span className="ml-auto text-concrete font-medium tabular-nums">{usd(rollup.specRevenue)}</span>
            <span className="text-concrete/70 tabular-nums text-xs w-14 text-right">{rollup.specRevenue > 0 ? pct(rollup.specMargin) : "—"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm font-medium text-concrete">Add specialty scope (PT / mesh)</span>
        </label>
        {on && (
          <div className="flex flex-wrap gap-1.5">
            {SPECIALTY_TYPES.map((t) => {
              const active = lines.some((l) => l.type === t);
              return (
                <button key={t} type="button" onClick={() => toggleType(t)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${active ? "border-safety bg-safety/15 text-safety" : "border-line text-rebar hover:text-concrete"}`}>
                  {active ? "✓ " : "+ "}{t}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {on && (
        <div className="border-t border-line p-4">
          {lines.length === 0 ? (
            <p className="text-sm text-rebar">Tap a type above to price PT or mesh alongside the rebar.</p>
          ) : (
            <div className="space-y-3">
              {lines.map((l) => {
                const r = rowFor(l.id);
                return (
                  <div key={l.id} className="rounded-md border border-line p-3" style={{ background: "var(--surface-2)" }}>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-[10px] uppercase tracking-wide text-safety font-medium">{l.type}</span>
                      <button type="button" onClick={() => removeLine(l.id)} className="text-[11px] text-rebar hover:text-danger">Remove</button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {l.type === "PT Building" && (<>
                        <SF label="Tons" value={l.tons} suffix="tn" onChange={(x) => updLine(l.id, { tons: x, lbs: x === "" ? "" : Number(x) * 2000 })} />
                        <SF label="Pounds" value={l.lbs} suffix="lb" onChange={(x) => updLine(l.id, { lbs: x, tons: x === "" ? "" : Number(x) / 2000 })} />
                        <SF label="Productivity" value={l.prodLbPerMH} suffix="lb/MH" onChange={(x) => updLine(l.id, { prodLbPerMH: x })} />
                        <SF label="Rate" value={l.rateCentsPerLb} suffix="¢/lb" onChange={(x) => updLine(l.id, { rateCentsPerLb: x })}
                          hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : "add productivity"} />
                      </>)}
                      {l.type === "PT Bridge" && (<>
                        <SF label="Hours (fabricator)" value={l.hours} suffix="hrs" onChange={(x) => updLine(l.id, { hours: x })} />
                        <SF label="Rate" value={l.ratePerHour} prefix="$" suffix="/hr" onChange={(x) => updLine(l.id, { ratePerHour: x })}
                          hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : ""} />
                      </>)}
                      {l.type === "Mesh" && (<>
                        <SF label="Square feet" value={l.sqft} suffix="sqft" onChange={(x) => updLine(l.id, { sqft: x })} />
                        <SF label="Productivity" value={l.prodSqftPerMH} suffix="sqft/MH" onChange={(x) => updLine(l.id, { prodSqftPerMH: x })} hint="blank = no cost" />
                        <SF label="Rate" value={l.rateCentsPerSqft} suffix="¢/sqft" onChange={(x) => updLine(l.id, { rateCentsPerSqft: x })}
                          hint={r.recommendedRate ? `rec ${r.recommendedRate.toFixed(2)}` : "add productivity"} />
                      </>)}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-rebar">
                      <span className="tabular-nums">{r.qtyLabel}</span>
                      {r.hasCostBasis ? (<>
                        <span className="tabular-nums">{num(r.hours, 1)} MH</span>
                        <span className="tabular-nums">cost {usd(r.cost)}</span>
                        <span className="tabular-nums text-concrete">rev {usd(r.revenue)}</span>
                        <span className={`tabular-nums font-medium ${r.margin >= targetMargin ? "text-ok" : "text-warn"}`}>{pct(r.margin)} margin</span>
                      </>) : (<>
                        <span className="tabular-nums text-concrete">rev {usd(r.revenue)}</span>
                        <span className="text-warn font-medium">▲ no cost basis — add productivity</span>
                      </>)}
                    </div>
                  </div>
                );
              })}

              {rollup.specRevenue > 0 && (
                <div className="flex items-baseline gap-2 px-1 pt-1 text-sm">
                  <span className="text-concrete font-medium">Specialty total</span>
                  <span className="ml-auto text-concrete font-medium tabular-nums">{usd(rollup.specRevenue)}</span>
                  <span className="text-rebar text-xs tabular-nums">{num(rollup.specHours, 0)} MH · {pct(rollup.specMargin)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// small specialty field
function SF({ label, value, onChange, prefix, suffix, hint }) {
  return (
    <label className="block">
      <span className="text-[10px] text-rebar block mb-1">{label}</span>
      <div className="flex items-center gap-1 rounded border border-line px-2 py-1.5" style={{ background: "var(--surface)" }}>
        {prefix && <span className="text-xs text-rebar">{prefix}</span>}
        <input type="text" inputMode="decimal" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm text-concrete focus:outline-none tabular-nums" placeholder="0" />
        {suffix && <span className="text-[10px] text-rebar whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <span className="text-[10px] text-rebar/70 block mt-0.5">{hint}</span>}
    </label>
  );
}

// -----------------------------------------------------------------------------
// SPECIALTY (live) — reads the same live rollup the editor prices from, so it
// can never disagree with the form. Specialty only: the rebar side lives in the
// Economics card, and the combined figures are already there too.
function SpecialtyLive({ rollup }) {
  const usd = (v) => `$${Math.round(v || 0).toLocaleString()}`;
  const pct = (v) => `${((v || 0) * 100).toFixed(1)}%`;
  return (
    <div className="rounded-lg border border-line p-5 mt-4" style={{ background: "var(--surface)" }}>
      <p className="text-[11px] uppercase tracking-wider text-rebar mb-3">Specialty scope</p>
      <div className="space-y-1.5 text-sm">
        {rollup.rows.map((r) => (
          <div key={r.id} className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-wide text-safety">{r.type}</span>
            <span className="text-rebar text-xs">{r.qtyLabel}</span>
            <span className="ml-auto text-concrete tabular-nums">{usd(r.revenue)}</span>
            <span className="text-concrete/70 tabular-nums text-xs w-14 text-right">{r.hasCostBasis ? pct(r.margin) : "—"}</span>
          </div>
        ))}
        <div className="flex items-baseline gap-2 pt-1.5 border-t border-line">
          <span className="text-concrete font-medium text-xs">Specialty total</span>
          <span className="text-rebar text-[11px]">{Math.round(rollup.specHours).toLocaleString()} MH · cost {usd(rollup.specCost)}</span>
          <span className="ml-auto text-concrete font-medium tabular-nums">{usd(rollup.specRevenue)}</span>
          <span className="text-concrete/70 tabular-nums text-xs w-14 text-right">{pct(rollup.specMargin)}</span>
        </div>
        {rollup.missingBasis > 0 && (
          <p className="text-[11px] text-warn pt-1">▲ {rollup.missingBasis} line{rollup.missingBasis === 1 ? "" : "s"} book revenue with no cost basis — add productivity.</p>
        )}
      </div>
    </div>
  );
}
