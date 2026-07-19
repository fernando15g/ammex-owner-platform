"use client";

// =============================================================================
// CREATE / EDIT A PROJECT
//
// The organizing idea: every field on a project is one of three kinds.
//   1. TYPED      — name, Project ID, status, attached bid, GC
//   2. INHERITED  — from the bid: contract, lbs, LBS/MH, projected hours, crew,
//                   duration. Shown, never retyped.
//   3. DERIVED    — from real work: pounds billed, labour hours, actual LBS/MH.
//                   Nobody types these; they appear as work happens.
//
// Because only group 1 is typed, creating a project from a won bid asks for
// almost nothing. It's a CONFIRMATION, not a form: here's the job, here's what
// the bid brings, does that look right? The payoff isn't fewer keystrokes — it's
// that a wrong contract value gets caught NOW, not three weeks into billing.
//
// Start date and foreman are deliberately absent at creation: you don't know
// either the day you win a bid. They belong to mobilisation, so they appear once
// the project exists.
//
// A handshake deal is NOT a project without a bid — it's a project whose bid
// isn't written down yet. So it's created, then plainly flagged as unbillable
// until the bid exists.
// =============================================================================

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import BidPicker from "@/app/projects/BidPicker";
import ChipSelect from "@/app/components/ChipSelect";
import AddressAutocomplete from "@/app/projects/AddressAutocomplete";

const PinPicker = dynamic(() => import("@/app/projects/PinPicker"), {
  ssr: false,
  loading: () => <div className="text-xs text-rebar py-6 text-center">Loading map…</div>,
});

const PROJECT_STATUSES = [
  "Bidding", "Awarded", "Mobilizing", "Active",
  "Punchlist", "Waiting on billing", "Closed", "Paid",
];

const money = (n) => (typeof n === "number" ? `$${Math.round(n).toLocaleString()}` : "—");
const num = (n, suffix = "") => (typeof n === "number" ? `${Math.round(n).toLocaleString()}${suffix}` : "—");
const cents = (n) => (typeof n === "number" ? `${(n * 100).toFixed(2)}¢/lb` : "—");

export default function ProjectForm({
  project = null, bidOptions = [], presetBidId = null, presetName = "",
  modal = false, onSaved = null, onClose = null,
}) {
  const isNew = !project;

  const [f, setF] = useState({
    name: project?.name || presetName || "",
    projectId: project?.projectId || "",
    status: project?.status || "Awarded",
    actualStartDate: (project?.actualStartDate || "").slice(0, 10),
    foreman: project?.foreman || [],
    gc: project?.gc || [],
    relatedBidIds: project?.relatedBidIds?.length
      ? project.relatedBidIds
      : project?.relatedBidId ? [project.relatedBidId]
      : presetBidId ? [presetBidId] : [],
    siteStreet: project?.siteStreet || "",
    siteCity: project?.siteCity || "",
    siteState: project?.siteState || "AZ",
    siteZip: project?.siteZip || "",
    siteLat: project?.siteLat ?? null,
    siteLng: project?.siteLng ?? null,
    sitePinManual: project?.sitePinManual || false,
  });
  const [options, setOptions] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const savedSnap = useRef(null);
  const router = useRouter();

  // Once saved, the confirmation clears the moment you change anything again —
  // so "Saved ✓" always means "what's on screen is what's stored".
  useEffect(() => {
    if (saved && savedSnap.current != null && JSON.stringify(f) !== savedSnap.current) setSaved(false);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps

  const attachedBids = f.relatedBidIds.map((id) => bidOptions.find((b) => b.id === id)).filter(Boolean);
  const bid = attachedBids[0] || null;   // the confirmation screen leads with the first

  // real Notion option lists (no more typo-duplicates)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, b] = await Promise.all([
          fetch("/api/notion-options?db=projects").then((r) => r.json()),
          fetch("/api/notion-options?db=bids").then((r) => r.json()),
        ]);
        if (!alive) return;
        setOptions({ Foreman: p?.options?.Foreman || [], GC: b?.options?.GC || [] });
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  // GC follows the bid unless it's already been set
  useEffect(() => {
    if (isNew && bid?.gc?.length && f.gc.length === 0) setF((s) => ({ ...s, gc: bid.gc }));
  }, [bid?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // suggest the next Project ID (year-aware)
  useEffect(() => {
    if (!isNew || f.projectId) return;
    let alive = true;
    (async () => {
      try {
        const d = await fetch("/api/projects/suggest-id", { method: "POST" }).then((r) => r.json());
        if (alive && d.ok && d.projectId) setF((s) => (s.projectId ? s : { ...s, projectId: d.projectId }));
      } catch {}
    })();
    return () => { alive = false; };
  }, [isNew, f.projectId]);

  async function save() {
    if (!f.name.trim()) { setErr("A project needs a name."); return; }
    // Site street + city are the "sweet spot" for a map pin. Not required — but
    // if they're blank on a new project, confirm rather than silently skip.
    if (isNew && (!f.siteStreet.trim() || !f.siteCity.trim())) {
      if (!window.confirm("No site address yet — the job map needs a street and city to drop a pin.\n\nCreate the project without it? You can add it later.")) return;
    }
    setBusy(true); setErr(null);
    const payload = {
      name: f.name.trim(),
      projectId: f.projectId.trim(),
      status: f.status,
      actualStartDate: f.actualStartDate || null,
      foreman: f.foreman,
      gc: f.gc,
      relatedBidIds: f.relatedBidIds,
      relatedBidId: f.relatedBidIds[0] || null,   // kept for callers that still read one
      siteStreet: f.siteStreet.trim(),
      siteCity: f.siteCity.trim(),
      siteState: f.siteState.trim(),
      siteZip: f.siteZip.trim(),
      siteLat: f.siteLat,
      siteLng: f.siteLng,
      sitePinManual: !!f.sitePinManual,
    };
    // If the address changed on an existing project, drop the cached coordinates
    // so Home re-geocodes to the new spot — UNLESS the pin was placed by hand,
    // which is the source of truth and stays put.
    if (!isNew && !f.sitePinManual) {
      const moved = ["siteStreet", "siteCity", "siteState", "siteZip"].some((k) => (project?.[k] || "") !== payload[k]);
      if (moved) { payload.siteLat = null; payload.siteLng = null; }
    }
    try {
      const res = await fetch(isNew ? "/api/projects" : `/api/projects/${project.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? { project: payload } : { changes: payload }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      if (modal) { setBusy(false); onSaved?.(); return; }
      if (isNew) { window.location.href = `/billing/${d.id}`; return; }
      // Editing an existing project: don't hard-reload to the same form (which
      // looks like nothing happened). Confirm the save in place and soft-refresh
      // the server data behind it.
      setBusy(false);
      savedSnap.current = JSON.stringify(f);
      setSaved(true);
      router.refresh();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  async function remove() {
    const typed = window.prompt(
      `Delete "${project.name}"?\n\nOnly projects with no billing history can be deleted. The record is archived (recoverable).\n\nType DELETE to confirm.`
    );
    if (typed !== "DELETE") { if (typed != null) setErr("Delete cancelled — you must type DELETE exactly."); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/delete`, { method: "POST" });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      window.location.href = "/active";
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  }

  return (
    <div className={modal ? "" : "max-w-3xl"}>
      {err && <div className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-concrete/80 mb-4">{err}</div>}

      {/* ---- WHAT THE BID BRINGS (this is the confirmation) -------------------- */}
      {attachedBids.length > 0 ? (() => {
        // Multi-phase jobs sum. A second bid that quietly failed to count would
        // show up as a contract that's too low — the worst kind of bug, because
        // it looks plausible.
        const sum = (k) => attachedBids.reduce((a, b) => a + (b[k] || 0), 0) || null;
        const multi = attachedBids.length > 1;
        return (
          <div className="rounded-lg border border-ok/40 bg-ok/5 p-4 mb-4">
            <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
              <span className="text-[11px] uppercase tracking-widest text-rebar">
                {multi ? `From ${attachedBids.length} bids` : "From the bid"}
              </span>
              {attachedBids.map((b) => (
                <span key={b.id} className="text-sm text-concrete font-medium">
                  {b.name}
                  {b.status === "Awarded" && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full border border-ok/40 text-ok">Awarded</span>}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
              <Inherited label={multi ? "Contract (combined)" : "Contract"} value={money(sum("contractValue"))} lead />
              <Inherited label="Bid rate" value={multi ? "per phase" : cents(bid.bidRate)} />
              <Inherited label="Estimated" value={num(sum("estimatedLbs"), " lbs")} />
              <Inherited label="Productivity" value={multi ? "per phase" : num(bid.productivity, " lbs/MH")} />
              <Inherited label="Projected hours" value={num(sum("projectedHours"))} />
              <Inherited label="Crew · duration" value={multi ? "per phase" : `${bid.crewSize ?? "—"} · ${num(bid.durationDays, " days")}`} />
            </div>

            <p className="text-[11px] text-rebar mt-2.5">
              {multi
                ? "Each phase keeps its own estimating numbers — you can still tell whether that bid made money. They share one contract, one GC and one invoice stream."
                : "These come from the bid — they aren't typed here. If a number looks wrong, fix it on the bid. Better to catch it now than three weeks into billing."}
            </p>
          </div>
        );
      })() : (
        <div className="rounded-lg border border-warn/50 bg-warn/10 p-4 mb-4">
          <p className="text-sm text-concrete font-medium mb-1">No bid attached — this project can&apos;t be billed yet.</p>
          <p className="text-xs text-rebar">
            A project gets its line items — and so its contract value — from its bid. Attach one below, or create a
            bid for it. A handshake deal is just a bid you haven&apos;t written down yet.
          </p>
        </div>
      )}

      <div className={modal ? "" : "rounded-lg border border-line p-5"} style={modal ? undefined : { background: "var(--surface)" }}>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block sm:col-span-2">
            <span className="text-xs text-rebar mb-1 block">Project name</span>
            <input className="inp" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Peoria Ave Bridge" />
          </label>

          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Project ID</span>
            <input className="inp" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })} placeholder="26-13" />
          </label>

          <label className="block">
            <span className="text-xs text-rebar mb-1 block">Status</span>
            <select className="inp" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>

          <div className="sm:col-span-2">
            <span className="text-xs text-rebar mb-1 block">Site location <span className="text-rebar/60">· good to have — puts the job on the map</span></span>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
              <div className="sm:col-span-6">
                <AddressAutocomplete
                  value={f.siteStreet}
                  onType={(v) => setF((s) => ({ ...s, siteStreet: v }))}
                  onPick={(a) => setF((s) => ({
                    ...s,
                    siteStreet: a.street || s.siteStreet,
                    siteCity: a.city || s.siteCity,
                    siteState: a.state || s.siteState,
                    siteZip: a.zip || s.siteZip,
                    siteLat: typeof a.lat === "number" ? a.lat : s.siteLat,
                    siteLng: typeof a.lng === "number" ? a.lng : s.siteLng,
                  }))}
                />
              </div>
              <input className="inp sm:col-span-3" value={f.siteCity} onChange={(e) => setF({ ...f, siteCity: e.target.value })} placeholder="City" />
              <input className="inp sm:col-span-1" value={f.siteState} onChange={(e) => setF({ ...f, siteState: e.target.value })} placeholder="State" />
              <input className="inp sm:col-span-2" value={f.siteZip} onChange={(e) => setF({ ...f, siteZip: e.target.value })} placeholder="Zip" />
            </div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <button type="button" onClick={() => setShowMap((v) => !v)} className="text-xs px-3 py-1.5 rounded-md border border-line text-concrete hover:bg-graphite">
                {showMap ? "Hide map" : f.siteLat != null ? "Adjust pin on map" : "Drop a pin on map"}
              </button>
              <span className={`text-[11px] ${f.sitePinManual ? "text-ok" : "text-rebar"}`}>
                {f.sitePinManual ? "✓ Pin set — save changes below" : f.siteLat != null ? "Pinned from address" : "No pin yet — auto-placed from the address"}
              </span>
              {f.sitePinManual && (
                <button type="button" onClick={() => setF((s) => ({ ...s, siteLat: null, siteLng: null, sitePinManual: false }))} className="text-[11px] text-rebar hover:text-concrete underline underline-offset-2">reset to address</button>
              )}
            </div>
            {showMap && (
              <div className="mt-3">
                <PinPicker
                  lat={f.siteLat}
                  lng={f.siteLng}
                  onPick={({ lat, lng, address }) => setF((s) => ({
                    ...s,
                    siteLat: lat, siteLng: lng, sitePinManual: true,
                    ...(address ? {
                      siteStreet: s.siteStreet || address.street || "",
                      siteCity: s.siteCity || address.city || "",
                      siteZip: s.siteZip || address.zip || "",
                    } : {}),
                  }))}
                />
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <span className="text-xs text-rebar mb-1 block">
              Attached bid{f.relatedBidIds.length > 1 ? "s" : ""}
              <span className="text-rebar/60"> · a later phase attaches here too</span>
            </span>

            {attachedBids.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {attachedBids.map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1.5 text-xs border border-line rounded-full px-2.5 py-1 text-concrete" style={{ background: "var(--surface-2)" }}>
                    {b.name}
                    <button
                      type="button"
                      onClick={() => setF({ ...f, relatedBidIds: f.relatedBidIds.filter((x) => x !== b.id) })}
                      className="text-rebar hover:text-danger"
                      title="Detach — this project loses that bid's line items and contract value"
                    >✕</button>
                  </span>
                ))}
              </div>
            )}

            <BidPicker
              bids={bidOptions.filter((b) => !f.relatedBidIds.includes(b.id))}
              value=""
              onChange={(id) => { if (id) setF({ ...f, relatedBidIds: [...f.relatedBidIds, id] }); }}
            />
          </div>

          <div className="sm:col-span-2">
            <ChipSelect
              label="GC"
              items={f.gc}
              options={options.GC || []}
              onChange={(v) => setF({ ...f, gc: v })}
              hint={f.relatedBidId ? "Recorded on the bid, so the job's GC lives in one place." : "Attach a bid first — the GC is stored on it."}
            />
          </div>

          {/* Start date and foreman aren't known the day a bid is won — they
              belong to mobilisation, so they only appear once the project exists. */}
          {!isNew && (
            <>
              <label className="block">
                <span className="text-xs text-rebar mb-1 block">Start date</span>
                <input type="date" className="inp inp-date" value={f.actualStartDate} onChange={(e) => setF({ ...f, actualStartDate: e.target.value })} />
              </label>
              <ChipSelect label="Foreman" items={f.foreman} options={options.Foreman || []} onChange={(v) => setF({ ...f, foreman: v })} />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-5">
          <button onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40">
            {busy ? "Saving…" : isNew ? "Create project" : "Save changes"}
          </button>
          {saved && !busy && <span className="text-sm text-ok">Saved ✓</span>}
          {!isNew && !modal && (
            <a href={`/billing/${project.id}`} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">Billing</a>
          )}
          {modal ? (
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</button>
          ) : (
            <a href="/active" className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">Cancel</a>
          )}
          {!isNew && (
            <button onClick={remove} disabled={busy} className="ml-auto text-sm px-4 py-2 rounded-md border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40">
              Delete project
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Inherited({ label, value, lead }) {
  return (
    <div>
      <p className="text-[11px] text-rebar">{label}</p>
      <p className={`tabular-nums ${lead ? "text-base font-semibold text-concrete" : "text-sm text-concrete/80"}`}>{value}</p>
    </div>
  );
}
