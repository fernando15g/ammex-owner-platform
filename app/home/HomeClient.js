"use client";

// =============================================================================
// HOME — the front door, and the flagship page. Two layers:
//   1. The glance — one headline per zone, each a link in.
//   2. Needs your attention — the short list of live exceptions that cost money
//      or hide risk. Each expands to its items; click an item to act in a modal
//      without leaving Home. Alerts are LIVE signals: they clear when the real
//      thing is resolved (paid, logged, followed up), never by a dismiss button.
// =============================================================================

import { useState, useEffect } from "react";
import { SUPPLIERS, resolvePOFields } from "@/lib/suppliers";
import { useRouter } from "next/navigation";
import { confirmDialog } from "@/app/components/Dialog";
import { AZ_COUNTIES, AZ_VIEWBOX, projectAZ } from "./azCounties";
import AddressAutocomplete from "@/app/projects/AddressAutocomplete";

const money = (n) =>
  typeof n !== "number" ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(Math.abs(n) / 1e3)}k` : Math.round(Math.abs(n))}`;
const pct = (f, signed = false) => (typeof f !== "number" ? "—" : `${signed && f > 0 ? "+" : ""}${Math.round(f * 100)}%`);
const rate = (n) => (typeof n === "number" ? `${Math.round(n)}` : "—");
const lbs = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");
const num = (n) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—");

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
const today = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

const ALERT_META = {
  overdue: { title: "Overdue receivables", item: (i) => `${i.name}${i.gc?.length ? ` · ${i.gc.join(", ")}` : ""}`, right: (i) => money(i.over60), sub: "past 60 days" },
  overpace: { title: "Jobs over pace", item: (i) => i.name, right: (i) => pct(i.forecastPct), sub: "forecast of budget" },
  cold: { title: "Cold bids", item: (i) => `${i.name}${i.gc?.length ? ` · ${i.gc.join(", ")}` : ""}`, right: (i) => `${i.coldDays}d`, sub: "quiet" },
  placement: { title: "Missing placement", item: (i) => i.name, right: () => "0 lbs", sub: "logged" },
  nosheet: { title: "No bid sheet", item: (i) => i.name, right: () => "—", sub: "no line items" },
  closeout: { title: "Notify supplier of close-out", item: (i) => i.name, right: () => "closed", sub: "PO open" },
};

export default function HomeClient({ data }) {
  const { tiles, analytics } = data;
  const capacity = data.capacity;
  const winRate = data.winRate;
  const [alerts, setAlerts] = useState(data.alerts);
  const [open, setOpen] = useState({}); // alertId -> bool
  const [modal, setModal] = useState(null); // { alertId, item }
  const [coldSel, setColdSel] = useState(new Set()); // selected cold bid ids
  const [bulkModal, setBulkModal] = useState(null); // { action: "snooze"|"lost", ids: [] }

  const toggleColdSel = (id) =>
    setColdSel((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Remove an item once it's resolved; drop the whole alert when it empties.
  const resolve = (alertId, itemId) => {
    setAlerts((prev) =>
      prev
        .map((a) => (a.id === alertId ? { ...a, items: a.items.filter((it) => it.id !== itemId), count: a.items.filter((it) => it.id !== itemId).length } : a))
        .filter((a) => a.items.length > 0)
    );
    setModal(null);
  };

  // Bulk-resolve several cold bids at once (used after a bulk snooze / mark-lost).
  const resolveMany = (alertId, itemIds) => {
    const gone = new Set(itemIds);
    setAlerts((prev) =>
      prev
        .map((a) => (a.id === alertId ? { ...a, items: a.items.filter((it) => !gone.has(it.id)), count: a.items.filter((it) => !gone.has(it.id)).length } : a))
        .filter((a) => a.items.length > 0)
    );
    setColdSel((prev) => { const n = new Set(prev); itemIds.forEach((id) => n.delete(id)); return n; });
  };

  const need = alerts.reduce((s, a) => s + a.items.length, 0);

  return (
    <div className="space-y-7">
      {/* header */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-semibold text-concrete tracking-tight">{greeting()}, Fernando</h2>
          <p className="text-sm text-rebar mt-1">{today()}</p>
        </div>
        <span className={`text-xs px-3 py-1.5 rounded-full border ${need > 0 ? "border-warn/40 text-warn" : "border-ok/40 text-ok"}`}>
          {need > 0 ? `${need} need${need === 1 ? "s" : ""} a look` : "all clear"}
        </span>
      </div>

      {/* the glance */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <ZoneTile href="/pipeline" label="Bids in flight" value={money(tiles.pipeline.weighted)} sub={`${tiles.pipeline.count} bids · weighted`} />
        <ZoneTile href="/active" label="Active work" value={`${tiles.active.running}`} unit="running"
          sub={tiles.active.overPace > 0 ? `${tiles.active.overPace} over pace` : "on pace"} subTone={tiles.active.overPace > 0 ? "danger" : "ok"} />
        <ZoneTile href="/billing" label="To collect" value={money(tiles.billing.outstanding)} valueTone="amber"
          sub={tiles.billing.overdue60 > 0 ? `${money(tiles.billing.overdue60)} past 60d` : "current"} subTone={tiles.billing.overdue60 > 0 ? "danger" : "ok"} />
        <ZoneTile href="/book" label="The Book" value={money(tiles.book.contract)} sub={`${money(tiles.book.profit)} profit`} subTone="ok" />
        <ZoneTile href="/performance" label="Crew pace" value={rate(tiles.performance.realized)} unit="lbs/MH"
          sub={tiles.performance.gapPct != null ? `${pct(tiles.performance.gapPct, true)} vs bid` : "—"}
          subTone={tiles.performance.gapPct != null && tiles.performance.gapPct < 0 ? "danger" : "ok"} />
      </div>

      {/* needs your attention */}
      <div>
        <div className="flex items-baseline gap-2 mb-2.5">
          <h3 className="text-sm font-medium text-concrete">Needs your attention</h3>
          <span className="text-xs text-rebar">live — clears itself when resolved</span>
        </div>
        <div className="rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
          {alerts.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-rebar">Nothing needs you right now. Nicely done.</div>
          ) : (
            alerts.map((a) => (
              <AlertGroup
                key={a.id}
                alert={a}
                open={!!open[a.id]}
                onToggle={() => setOpen((o) => ({ ...o, [a.id]: !o[a.id] }))}
                onPick={(item) => setModal({ alertId: a.id, item })}
                selectable={a.id === "cold"}
                selected={a.id === "cold" ? coldSel : null}
                onToggleSelect={toggleColdSel}
              />
            ))
          )}
        </div>
        {coldSel.size > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-line px-4 py-2.5" style={{ background: "var(--surface)" }}>
            <span className="text-sm text-concrete">{coldSel.size} selected</span>
            <button onClick={() => setBulkModal({ action: "snooze", ids: [...coldSel] })}
              className="ml-auto text-sm px-3 py-1.5 rounded-md bg-safety text-steel font-medium">Snooze 2 weeks</button>
            <button onClick={() => setBulkModal({ action: "lost", ids: [...coldSel] })}
              className="text-sm px-3 py-1.5 rounded-md border border-danger/40 text-danger hover:bg-danger/10">Mark lost</button>
            <button onClick={() => setColdSel(new Set())}
              className="text-sm px-2 py-1.5 text-rebar hover:text-concrete">Clear</button>
          </div>
        )}
      </div>

      {/* ===================== analytics canvas ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2"><MapCard county={analytics.county} pins={analytics.pins} needLocationJobs={analytics.needLocationJobs} /></div>
        <div className="lg:col-span-2"><TimesheetCard ts={analytics.timesheet} /></div>
        <Card title="Work mix · by type"><WorkMixDonut mix={analytics.workMix} /></Card>
      </div>
      <Card title="Foreman scorecard · realized vs bid lbs/MH"><ForemanScorecard foremen={analytics.foremen} excluded={analytics.foremanExclusionSummary} /></Card>
      {winRate && <WinRateCard winRate={winRate} />}
      <Card title="The Book · contract by stage"><BookByStage stages={analytics.bookStages} /></Card>

      {capacity && <CapacityZone capacity={capacity} />}

      {modal && (
        <Modal alert={alerts.find((a) => a.id === modal.alertId)} item={modal.item} onClose={() => setModal(null)} onResolve={resolve} />
      )}
      {bulkModal && (
        <BulkColdModal
          action={bulkModal.action}
          items={(alerts.find((a) => a.id === "cold")?.items || []).filter((it) => bulkModal.ids.includes(it.id))}
          onClose={() => setBulkModal(null)}
          onDone={(resolvedIds) => { resolveMany("cold", resolvedIds); setBulkModal(null); }}
        />
      )}
    </div>
  );
}

function ZoneTile({ href, label, value, unit, sub, valueTone, subTone }) {
  const vc = valueTone === "amber" ? "text-warn" : "text-concrete";
  const sc = subTone === "danger" ? "text-danger" : subTone === "ok" ? "text-ok" : "text-rebar";
  return (
    <a href={href} className="group rounded-lg border border-line px-4 py-3.5 hover:border-rebar/60 transition-colors block" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px] uppercase tracking-wider text-rebar mb-1.5">{label}</div>
      <div className={`text-[26px] leading-none font-semibold tabular-nums ${vc}`}>
        {value}{unit && <span className="text-xs font-normal text-rebar ml-1">{unit}</span>}
      </div>
      {sub && <div className={`text-[11px] mt-2 ${sc}`}>{sub}</div>}
    </a>
  );
}

const DOT = { danger: "bg-danger", warn: "bg-warn", ok: "bg-ok", info: "bg-rebar" };

function AlertGroup({ alert, open, onToggle, onPick, selectable, selected, onToggleSelect }) {
  const meta = ALERT_META[alert.id] || {};
  return (
    <div className="border-b border-line last:border-b-0">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-graphite/40">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[alert.sev] || "bg-rebar"}`} />
        <span className="text-sm text-concrete">{alert.label}</span>
        <span className="ml-auto text-[11px] text-rebar inline-flex items-center gap-1.5">
          {open ? "hide" : "review"}
          <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-line divide-y divide-line" style={{ background: "var(--surface-2)" }}>
          {alert.items.map((it) => {
            const isSel = selectable && selected?.has(it.id);
            return (
              <div key={it.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-graphite/40">
                {selectable && (
                  <input
                    type="checkbox"
                    checked={!!isSel}
                    onChange={(e) => { e.stopPropagation(); onToggleSelect(it.id); }}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 w-4 h-4 accent-safety cursor-pointer"
                    aria-label={`Select ${it.name}`}
                  />
                )}
                <button onClick={() => onPick(it)} className="min-w-0 flex-1 flex items-center gap-3 text-left">
                  <span className="min-w-0 text-sm text-concrete truncate">{meta.item ? meta.item(it) : it.name}</span>
                  <span className="ml-auto shrink-0 text-right">
                    <span className="text-sm tabular-nums text-concrete">{meta.right ? meta.right(it) : ""}</span>
                    <span className="text-[11px] text-rebar ml-1">{meta.sub || ""}</span>
                  </span>
                  <span className="text-rebar text-xs shrink-0">›</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- modal shell ----
function Modal({ alert, item, onClose, onResolve }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!alert || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-line">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-rebar">{ALERT_META[alert.id]?.title}</div>
            <h3 className="text-lg font-semibold text-concrete truncate mt-0.5">{item.name || "—"}</h3>
            {item.projectId && <p className="text-xs text-rebar mt-0.5">{item.projectId}{item.gc?.length ? ` · ${item.gc.join(", ")}` : ""}</p>}
          </div>
          <button onClick={onClose} className="ml-auto text-rebar hover:text-concrete text-sm px-1" aria-label="Close">✕</button>
        </div>
        <div className="px-5 py-4">
          {alert.id === "overdue" && <OverdueBody item={item} onDone={() => onResolve("overdue", item.id)} />}
          {alert.id === "overpace" && <OverPaceBody item={item} />}
          {alert.id === "cold" && <ColdBody item={item} onDone={() => onResolve("cold", item.id)} />}
          {alert.id === "placement" && <PlacementBody item={item} onDone={() => onResolve("placement", item.id)} />}
          {alert.id === "nosheet" && <NoSheetBody item={item} />}
          {alert.id === "closeout" && <CloseoutBody item={item} onDone={() => onResolve("closeout", item.id)} />}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, tone }) {
  const c = tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-concrete";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-rebar">{label}</span>
      <span className={`text-sm tabular-nums ${c}`}>{value}</span>
    </div>
  );
}

function useMutation() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const run = async (url, body, method = "POST") => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Couldn't save");
      return true;
    } catch (e) { setErr(String(e.message || e)); setBusy(false); return false; }
  };
  return { busy, err, run };
}

// ---- per-alert bodies ----
function OverdueBody({ item, onDone }) {
  const { busy, err, run } = useMutation();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const submit = async () => {
    const n = Number(amount);
    if (!n || n <= 0) return;
    const ok = await run("/api/billing/log-payment", { projectId: item.id, paidAmount: n, paymentDate: date });
    if (ok) onDone();
  };
  return (
    <div>
      <div className="mb-3">
        <Field label="Over 60 days" value={money(item.over60)} tone="danger" />
        {item.over90 > 0 && <Field label="Over 90 days" value={money(item.over90)} tone="danger" />}
        <Field label="Total outstanding" value={money(item.outstanding)} />
      </div>
      <p className="text-xs text-rebar mb-3">Chase the GC. When a payment lands, log it here and this clears.</p>
      <div className="flex items-center gap-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Payment amount"
          className="flex-1 text-sm px-3 py-2 rounded-md border border-line bg-transparent text-concrete placeholder:text-rebar/60 focus:outline-none focus:border-rebar" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="text-sm px-2 py-2 rounded-md border border-line bg-transparent text-concrete focus:outline-none focus:border-rebar" />
      </div>
      {err && <p className="text-xs text-danger mt-2">{err}</p>}
      <div className="flex items-center gap-2 mt-4">
        <button onClick={submit} disabled={busy || !amount} className="text-sm px-3 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-50">Log payment</button>
        <a href={`/billing/${item.id}`} className="text-sm px-3 py-2 rounded-md border border-line text-rebar hover:text-concrete">Open billing</a>
      </div>
    </div>
  );
}

function OverPaceBody({ item }) {
  return (
    <div>
      <Field label="Bid hours" value={num(item.projectedHours)} />
      <Field label="Logged hours" value={num(item.actualHours)} />
      <Field label="Hours consumed" value={pct(item.hoursPct)} />
      <Field label="Forecast finish" value={typeof item.forecastPct === "number" ? `${pct(item.forecastPct)} of budget` : "—"} tone="danger" />
      <p className="text-xs text-rebar mt-3">This one's fixed in the field, not from a button — it clears when the job is back on pace or finishes.</p>
      <div className="mt-4">
        <a href="/active" className="text-sm px-3 py-2 rounded-md border border-line text-rebar hover:text-concrete inline-block">Open in Active Work</a>
      </div>
    </div>
  );
}

function ColdBody({ item, onDone }) {
  const { busy, err, run } = useMutation();
  const snooze = async () => { if (await run(`/api/bids/${item.id}`, { changes: { lastFollowUp: new Date().toISOString().slice(0, 10) } }, "PATCH")) onDone(); };
  const markLost = async () => { if (!(await confirmDialog({ title: `Mark "${item.name}" as lost?`, confirmLabel: "Mark lost", danger: true }))) return; if (await run(`/api/bids/${item.id}`, { changes: { status: "Lost" } }, "PATCH")) onDone(); };
  return (
    <div>
      <Field label="Stage" value={item.status} />
      <Field label="Quiet for" value={`${item.coldDays} days`} tone="danger" />
      {typeof item.contractValue === "number" && <Field label="Bid value" value={money(item.contractValue)} />}
      <p className="text-xs text-rebar mt-3">Snooze once you&apos;ve chased them — it resets the 14-day clock. Mark lost if it&apos;s dead.</p>
      {err && <p className="text-xs text-danger mt-2">{err}</p>}
      <div className="flex items-center gap-2 mt-4">
        <button onClick={snooze} disabled={busy} className="text-sm px-3 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-50">Snooze 2 weeks</button>
        <button onClick={markLost} disabled={busy} className="text-sm px-3 py-2 rounded-md border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50">Mark lost</button>
        <a href={`/pipeline/${item.id}`} className="ml-auto text-sm text-rebar hover:text-concrete">Open bid</a>
      </div>
    </div>
  );
}

// Bulk snooze / mark-lost for cold bids. Processes each bid in turn. Mark-lost
// can be blocked per-bid (a project is built on it -> 409); we surface those
// individually instead of failing the whole batch, and still resolve the ones
// that succeeded.
function BulkColdModal({ action, items, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // { ok:[], blocked:[{name,error}] }
  const isLost = action === "lost";

  const run = async () => {
    setBusy(true);
    if (isLost) {
      // one batched request — reads projects once, marks the safe ones
      try {
        const res = await fetch(`/api/bids/bulk-lost`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: items.map((it) => it.id) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.ok === false) throw new Error(d.error || `Failed (${res.status})`);
        const nameOf = Object.fromEntries(items.map((it) => [it.id, it.name]));
        const blocked = (d.blocked || []).map((b) => ({ name: nameOf[b.id] || b.id, error: b.error }));
        setBusy(false);
        setResults({ ok: d.marked || [], blocked });
        if (blocked.length === 0) onDone(d.marked || []);
      } catch (e) {
        setBusy(false);
        setResults({ ok: [], blocked: [{ name: "Batch", error: String(e.message || e) }] });
      }
      return;
    }
    // snooze — per bid (fast: just a date write, no attachment check)
    const ok = [], blocked = [];
    for (const it of items) {
      try {
        const res = await fetch(`/api/bids/${it.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: { lastFollowUp: new Date().toISOString().slice(0, 10) } }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.ok !== false) ok.push(it.id);
        else blocked.push({ name: it.name, error: d.error || `Failed (${res.status})` });
      } catch (e) {
        blocked.push({ name: it.name, error: String(e.message || e) });
      }
    }
    setBusy(false);
    setResults({ ok, blocked });
    if (blocked.length === 0) onDone(ok);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-line p-5" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-concrete font-medium text-lg">
            {isLost ? "Mark lost" : "Snooze"} · {items.length} {items.length === 1 ? "bid" : "bids"}
          </h3>
          <button onClick={onClose} className="text-rebar hover:text-concrete">✕</button>
        </div>

        {!results ? (
          <>
            <p className="text-sm text-rebar mb-3">
              {isLost
                ? "These bids will be marked Lost. Any bid with a project built on it will be skipped and shown below — you'd need to detach it first."
                : "These bids will be snoozed two weeks (resets the 14-day clock)."}
            </p>
            <div className="max-h-48 overflow-y-auto rounded border border-line divide-y divide-line mb-4" style={{ background: "var(--surface-2)" }}>
              {items.map((it) => (
                <div key={it.id} className="px-3 py-2 text-sm text-concrete flex items-center justify-between">
                  <span className="truncate">{it.name}</span>
                  <span className="text-[11px] text-rebar shrink-0 ml-2">{it.coldDays}d</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={run} disabled={busy}
                className={`text-sm px-4 py-2 rounded-md font-medium disabled:opacity-50 ${isLost ? "border border-danger/40 text-danger hover:bg-danger/10" : "bg-safety text-steel"}`}>
                {busy ? "Working…" : isLost ? `Mark ${items.length} lost` : `Snooze ${items.length}`}
              </button>
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-md border border-line text-rebar">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-concrete mb-2">
              {results.ok.length} {isLost ? "marked lost" : "snoozed"}{results.blocked.length > 0 ? `, ${results.blocked.length} skipped` : ""}.
            </p>
            {results.blocked.length > 0 && (
              <div className="rounded border border-danger/40 bg-danger/10 p-3 mb-3 max-h-40 overflow-y-auto">
                {results.blocked.map((b, i) => (
                  <div key={i} className="text-xs text-concrete mb-1.5 last:mb-0">
                    <span className="text-danger font-medium">{b.name}</span> — {b.error}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => onDone(results.ok)} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">Done</button>
          </>
        )}
      </div>
    </div>
  );
}

function PlacementBody({ item, onDone }) {
  const { busy, err, run } = useMutation();
  const [val, setVal] = useState("");
  const save = async () => {
    const n = Number(val);
    if (!n || n < 0) return;
    if (await run(`/api/projects/${item.id}`, { changes: { placedLbs: n } }, "PATCH")) onDone();
  };
  const frac = item.awardedLbs && Number(val) ? Math.round((Number(val) / item.awardedLbs) * 100) : null;
  return (
    <div>
      <Field label="Awarded" value={`${lbs(item.awardedLbs)} lbs`} />
      <Field label="Currently logged" value={`${lbs(item.placedLbs)} lbs`} tone="danger" />
      <p className="text-xs text-rebar mt-3 mb-3">Enter pounds placed to date. Progress lights up across the app once it&apos;s logged.</p>
      <div className="flex items-center gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="numeric" placeholder="Placed pounds to date"
          className="flex-1 text-sm px-3 py-2 rounded-md border border-line bg-transparent text-concrete placeholder:text-rebar/60 focus:outline-none focus:border-rebar" />
        {frac != null && <span className="text-xs text-rebar tabular-nums w-12 text-right">{frac}%</span>}
      </div>
      {err && <p className="text-xs text-danger mt-2">{err}</p>}
      <div className="mt-4">
        <button onClick={save} disabled={busy || !val} className="text-sm px-3 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-50">Save placement</button>
      </div>
    </div>
  );
}

function NoSheetBody({ item }) {
  return (
    <div>
      {typeof item.contractValue === "number" && <Field label="Contract value" value={money(item.contractValue)} />}
      <p className="text-xs text-rebar mt-3">This job has no line items, so it can&apos;t be invoiced. Add its bid sheet and this clears.</p>
      <div className="mt-4">
        <a href={item.bidId ? `/pipeline/${item.bidId}/sheet` : "/pipeline"} className="text-sm px-3 py-2 rounded-md bg-safety text-steel font-medium inline-block">Add bid sheet</a>
      </div>
    </div>
  );
}

// Close-out: pick a supplier, open the pre-filled close-out email, and mark the
// project notified (checks "Supplier PO Notified" in Notion) so it clears from
// the alert. mailto can't confirm a send, so we mark on compose — re-openable
// from the project if needed.
function CloseoutBody({ item, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const send = async (supplier, both = false) => {
    setBusy(true); setErr(null);
    const fields = resolvePOFields({ name: item.name, projectId: item.projectId, site: item.site });
    const s0 = SUPPLIERS[0];
    const subject = (both ? s0 : supplier).closeSubject(fields);
    const body = (both ? s0 : supplier).closeBody(fields);
    const to = both ? s0.email : supplier.email;
    const bcc = both ? SUPPLIERS.slice(1).map((s) => s.email).join(",") : "";
    try {
      const res = await fetch(`/api/projects/${item.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: { supplierPoNotified: true } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) throw new Error(d.error || `Failed (${res.status})`);
      const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`];
      if (bcc) params.unshift(`bcc=${encodeURIComponent(bcc)}`);
      const href = `mailto:${to}?${params.join("&")}`;
      const a = document.createElement("a");
      a.href = href; a.style.display = "none";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      onDone();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  return (
    <div>
      <p className="text-xs text-rebar mb-3">This job is closed. Send the supplier a note to close their PO and send final material billing. Pick a supplier — opens a pre-filled email you review and send.</p>
      {err && <div className="text-danger text-xs mb-2 rounded border border-danger/40 bg-danger/10 p-2">{err}</div>}
      <div className="space-y-1.5">
        {SUPPLIERS.map((s) => (
          <button key={s.id} disabled={busy} onClick={() => send(s)}
            className="w-full flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-left hover:border-rebar hover:bg-graphite/40 disabled:opacity-50">
            <span className="text-sm text-concrete">{s.name}</span>
            <span className="text-[11px] text-rebar">{s.email}</span>
          </button>
        ))}
        {SUPPLIERS.length > 1 && (
          <button disabled={busy} onClick={() => send(null, true)}
            className="w-full flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-left hover:border-rebar hover:bg-graphite/40 disabled:opacity-50">
            <span className="text-sm text-concrete">Send to both</span>
            <span className="text-[11px] text-rebar">To + BCC</span>
          </button>
        )}
      </div>
      <p className="text-[11px] text-rebar mt-3">Sending marks this notified so it clears here. You can still re-send from the project page anytime.</p>
    </div>
  );
}

// ---- analytics cards ----
function Card({ title, children }) {
  return (
    <div className="rounded-lg border border-line p-4" style={{ background: "var(--surface)" }}>
      <div className="text-[11px] uppercase tracking-wider text-rebar mb-3">{title}</div>
      {children}
    </div>
  );
}

function mixHex(a, b, t) {
  const h = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const pa = h(a), pb = h(b);
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function MapCard({ county, pins, needLocationJobs }) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState(needLocationJobs || []);
  const router = useRouter();
  useEffect(() => { setJobs(needLocationJobs || []); }, [needLocationJobs]);
  const resolve = (id) => {
    setJobs((prev) => {
      const next = prev.filter((j) => j.id !== id);
      if (next.length === 0) setOpen(false);
      return next;
    });
    router.refresh(); // re-pull so the new pin + county shading appear
  };
  const vals = Object.values(county);
  const max = Math.max(1, ...vals);
  const shade = (n) => (!n ? "#2b313a" : mixHex("#3a2a1c", "#ff6a13", 0.3 + 0.7 * (n / max)));
  const list = Object.entries(county).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-lg border border-line p-4 h-full" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-rebar">Job concentration · Arizona</div>
        {jobs.length > 0 && (
          <button onClick={() => setOpen(true)} className="text-[11px] text-warn/90 hover:text-warn underline underline-offset-2">{jobs.length} need a location</button>
        )}
      </div>
      <div>
        <svg viewBox={AZ_VIEWBOX} className="w-full" style={{ maxHeight: 220 }} role="img" aria-label="Arizona counties shaded by active job count, with pins for jobs that have an address">
          {AZ_COUNTIES.map((c) => (
            <path key={c.name} d={c.d} fill={shade(county[c.name] || 0)} stroke="#1c2127" strokeWidth={0.6}>
              <title>{c.name}: {county[c.name] || 0} active</title>
            </path>
          ))}
          {(pins || []).map((p, i) => {
            const [x, y] = projectAZ(p.lng, p.lat);
            if (x < 0 || x > 420 || y < 0 || y > 280) return null;
            return <circle key={i} cx={x} cy={y} r={5.5} fill="#f4f3f0" stroke="#1c2127" strokeWidth={1.6}><title>{p.name}</title></circle>;
          })}
        </svg>
        <div className="flex items-center gap-2 text-[11px] text-rebar mt-1.5 flex-wrap">
          <span className="inline-block w-10 h-2 rounded" style={{ background: "linear-gradient(90deg,#2b313a,#ff6a13)" }} /> fewer → more
          {pins?.length > 0 && <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full bg-concrete" /> pin</span>}
        </div>
        {list.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            {list.map(([name, n]) => (
              <span key={name} className="text-rebar whitespace-nowrap"><span className="text-concrete">{name}</span> {n}</span>
            ))}
          </div>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-rebar">Jobs needing a location</div>
                <h3 className="text-lg font-semibold text-concrete mt-0.5">{jobs.length} to place on the map</h3>
              </div>
              <button onClick={() => setOpen(false)} className="ml-auto text-rebar hover:text-concrete text-sm px-1" aria-label="Close">✕</button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-line">
              {jobs.map((j) => (
                <NeedsLocationRow key={j.id} job={j} onSaved={() => resolve(j.id)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MIX_COLORS = ["#3987e5", "#199e70", "#d55181", "#c98500", "#9085e9", "#5a95d5", "#5a626e"];
function WorkMixDonut({ mix }) {
  if (!mix.length) return <div className="text-sm text-rebar py-6 text-center">No active jobs to break down yet.</div>;
  const total = mix.reduce((s, m) => s + m.count, 0) || 1;
  let acc = 0;
  const segs = mix.map((m, i) => { const start = (acc / total) * 100; acc += m.count; return { ...m, color: MIX_COLORS[i % MIX_COLORS.length], start, end: (acc / total) * 100, pctv: Math.round((m.count / total) * 100) }; });
  const grad = segs.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ");
  return (
    <div className="flex flex-col items-center gap-4 pt-1">
      <div className="relative shrink-0" style={{ width: 120, height: 120 }}>
        <div style={{ width: 120, height: 120, borderRadius: "50%", background: `conic-gradient(${grad})` }} />
        <div className="absolute" style={{ inset: 23, borderRadius: "50%", background: "var(--surface)" }} />
      </div>
      <div className="w-full flex flex-col gap-2 text-xs">
        {segs.map((s) => (
          <span key={s.type} className="flex items-center gap-2 text-rebar">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-concrete truncate">{s.type}</span>
            <span className="ml-auto tabular-nums">{s.pctv}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ForemanScorecard({ foremen, excluded = null }) {
  // The trust gate filters silently, which reads as "where are my other foremen?"
  // — so the card says out loud how many completed jobs it's NOT counting and why.
  const exclusionNote = excluded && excluded.count > 0 && (
    <div className="text-[11px] text-rebar pt-2 mt-1 border-t border-line" title={(excluded.jobs || []).map((j) => `${j.name}: ${(j.problems || []).join("; ")}`).join("\n")}>
      {foremen.length} foreman{foremen.length === 1 ? "" : "s"} shown · {excluded.count} completed job{excluded.count === 1 ? "" : "s"} excluded ({excluded.reasons.join(", ")}) — hover for details
    </div>
  );
  if (!foremen.length) return (
    <div className="text-sm text-rebar py-4 text-center">
      No completed jobs with a foreman pass the data checks yet.
      {excluded && excluded.count > 0
        ? ` ${excluded.count} completed job${excluded.count === 1 ? "" : "s"} excluded (${excluded.reasons.join(", ")}).`
        : " Assign foremen and this fills in."}
    </div>
  );
  const max = Math.max(...foremen.map((f) => Math.max(f.realized || 0, f.bid || 0))) * 1.12 || 1;
  return (
    <div className="space-y-2.5">
      {foremen.map((f) => {
        const tone = f.gap == null ? "text-rebar" : f.gap >= 0.1 ? "text-ok" : f.gap >= -0.05 ? "text-rebar" : "text-danger";
        const bar = f.gap == null ? "bg-rebar/50" : f.gap >= 0.1 ? "bg-ok" : f.gap >= -0.05 ? "bg-rebar/60" : "bg-danger";
        return (
          <div key={f.name} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-concrete truncate">{f.name}</span>
            <div className="flex-1 relative h-3.5 rounded bg-graphite min-w-0">
              <div className={`absolute left-0 top-0 h-3.5 rounded ${bar}`} style={{ width: `${((f.realized || 0) / max) * 100}%` }} />
              {f.bid && <div className="absolute w-0.5 bg-white rounded-full" style={{ left: `${(f.bid / max) * 100}%`, top: -2, height: 18 }} />}
            </div>
            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-concrete">{f.realized != null ? Math.round(f.realized) : "—"}<span className="text-[10px] text-rebar ml-1">lbs/MH</span></span>
            <span className={`w-14 shrink-0 text-right text-sm font-semibold tabular-nums ${tone}`}>{f.gap != null ? `${f.gap > 0 ? "+" : ""}${Math.round(f.gap * 100)}%` : "—"}</span>
            <span className="w-12 shrink-0 text-right text-[10px] text-rebar/70">{f.jobs < 2 ? "1 job" : ""}</span>
          </div>
        );
      })}
      <p className="text-[10px] text-rebar pt-1">White line = bid target · color = beating / on / behind bid.</p>
      {exclusionNote}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CAPACITY ZONE — one honest question, answered from measured data: how much of
// my crew is used, and how much more can I comfortably take on? Hire or hold.
function CapacityZone({ capacity }) {
  const u = capacity.util || {};
  const pct = typeof u.utilization === "number" ? u.utilization : null;
  const used = typeof u.crewUsed === "number" ? u.crewUsed : null;
  const room = typeof u.comfortableHeadroom === "number" ? u.comfortableHeadroom : null;
  const head = u.headcount || 0;
  const bd = u.breakdown || {};
  const state = u.state || "ok";

  const STATES = {
    room:  { label: "Room to take on work", tone: "text-ok",     bar: "var(--ok)",     msg: (r) => `Comfortable room for ~${Math.max(r,0).toFixed(0)} more crew of work.` },
    tight: { label: "Getting full — be selective", tone: "text-warn", bar: "var(--warn)", msg: (r) => r > 0 ? `Room for ~${r.toFixed(0)} more crew, but you're filling up.` : `Effectively full.` },
    full:  { label: "At capacity — hire or turn work away", tone: "text-danger", bar: "var(--danger)", msg: () => `You're at your comfortable ceiling. Taking more means hiring or overloading crew.` },
  };
  const st = STATES[state] || STATES.room;
  const fillPct = pct == null ? 0 : Math.min(pct * 100, 100);
  const comfortMarkPct = (u.comfortCeiling || 0.85) * 100;

  const runway = capacity.committed?.runwayWeeks;
  const backlogCrew = capacity.committed?.backlogCrewNearTerm ?? 0;
  const backlogCrewAll = capacity.committed?.backlogCrewAll ?? 0;
  const nearTermJobs = capacity.committed?.nearTermJobs ?? 0;
  // projected utilization if the near-term backlog slice started on top of now
  const projectedCrew = (used || 0) + backlogCrew;
  const projectedPct = head > 0 ? projectedCrew / head : null;
  const backlogPct = head > 0 ? (backlogCrew / head) * 100 : 0;
  const wouldOverbook = projectedPct != null && projectedPct > (u.comfortCeiling || 0.85);

  return (
    <Card title="Capacity · are we busy, do we have room">
      {/* decision headline */}
      <div className={`text-sm font-semibold mb-1 ${st.tone}`}>{st.label}</div>
      <div className="mb-1">
        <span className="text-2xl font-semibold text-concrete">{used != null ? `~${used.toFixed(0)}` : "—"}</span>
        <span className="text-lg text-rebar"> of {head} crew working</span>
        <span className="text-xs text-rebar ml-2">{pct != null ? `${(pct * 100).toFixed(0)}% utilized · last 30 days` : ""}</span>
      </div>
      <div className="text-sm text-rebar mb-3">{room != null ? st.msg(room) : "—"}</div>

      {/* stacked bar: current use (solid) + backlog demand (hatched) with ceiling line */}
      <div className="relative h-3.5 rounded-full bg-graphite overflow-hidden mb-1 flex">
        {/* current deployed */}
        <div className="h-full transition-all" style={{ width: `${fillPct}%`, background: st.bar }} />
        {/* backlog demand stacked on top, hatched so it reads as "not yet here" */}
        {backlogPct > 0 && (
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.min(backlogPct, 100 - fillPct + 40)}%`,
              background: "var(--warn)",
            }}
            title="backlog demand — won work waiting to start"
          />
        )}
        {/* comfort ceiling line */}
        <div className="absolute top-0 bottom-0 w-1 bg-white z-10 rounded-full" style={{ left: `${comfortMarkPct}%` }} title="comfortable ceiling (85%)" />
      </div>
      {/* legend + projection */}
      <div className="flex items-center gap-3 text-[11px] text-rebar mb-1">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: st.bar }} /> working now</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--warn)" }} /> backlog waiting</span>
        <span className="inline-flex items-center gap-1"><span className="w-1 h-3 bg-white rounded-full" /> 85% ceiling</span>
      </div>
      <div className={`text-sm mb-4 ${wouldOverbook ? "text-warn" : "text-rebar"}`}>
        {backlogCrew > 0.5 ? (
          wouldOverbook
            ? <>If your {nearTermJobs} biggest backlog jobs start, you'd need ~{projectedCrew.toFixed(0)} of {head} crew (~{Math.round(projectedPct * 100)}%) — <span className="text-warn font-medium">over your comfortable ceiling. Hire, or stagger their starts.</span> All {capacity.backlogCount} at once would need ~{(used + backlogCrewAll).toFixed(0)}.</>
            : <>If your {nearTermJobs} biggest backlog jobs start, you'd be at ~{projectedCrew.toFixed(0)} of {head} crew (~{Math.round(projectedPct * 100)}%) — still within comfort. All {capacity.backlogCount} at once would need ~{(used + backlogCrewAll).toFixed(0)}.</>
        ) : (
          `${capacity.backlogCount} jobs in backlog — minimal added crew pressure.`
        )}
      </div>

      {/* honest supporting tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <MiniTile label="Field crew" value={head} sub={`${bd.rodbusters || 0} rod · ${bd.foremen || 0} fore`} />
        <MiniTile label="Jobs worked" value={u.jobsWorked ?? "—"} sub={`of ${capacity.activeJobCount} active · 30d`} />
        <MiniTile label="Realized hrs/day" value={u.realizedHoursPerDay?.toFixed(1) ?? "—"} sub="from timesheets" />
        <MiniTile
          label="Backlog demand"
          value={backlogCrew > 0.5 ? `~${backlogCrew.toFixed(0)} crew` : "—"}
          sub={`${capacity.backlogCount} won, not started`}
          tone={wouldOverbook ? "warn" : undefined}
        />
      </div>

      {/* the honest footnote */}
      <div className="text-[11px] text-rebar mt-3 leading-relaxed">
        {head} crew × {u.realizedHoursPerDay?.toFixed(1)} hrs/day × 5 days × ~4.3 wks = available (last 30 days). Used = hours actually
        logged to jobs. Backlog pressure sizes each won-but-not-started job at its typical crew (5–10 by job size) — we can size it, not time it,
        so it's shown as a range: near-term (biggest start first) vs. all at once.
      </div>
    </Card>
  );
}

function MiniTile({ label, value, sub, tone }) {
  const vc = tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-concrete";
  return (
    <div className="rounded-lg border border-line px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
      <div className="text-[10px] uppercase tracking-wider text-rebar mb-1">{label}</div>
      <div className={`text-lg font-semibold ${vc}`}>{value}</div>
      {sub && <div className="text-[10px] text-rebar mt-0.5">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WIN RATE — how often we win the bids we compete for, overall and by type.
// The by-type rows click through to a modal showing won-vs-lost avg bid rate,
// so you can confirm whether losing a type is a pricing problem.
// ---------------------------------------------------------------------------
// WIN RATE — how often we land what we bid. Card stays lean (headline + goalpost
// bar + one segmented list at a time); all pricing depth lives in the tap modal.
function WinRateCard({ winRate }) {
  const [win, setWin] = useState("window12");
  const [lens, setLens] = useState("type"); // "type" | "gc"
  const [modalSeg, setModalSeg] = useState(null);
  const data = winRate[win] || {};
  const o = data.overall || {};
  const rate = o.rate;
  const target = data.target || 0.25;

  const tone = rate == null ? "text-rebar" : rate >= target ? "text-ok" : rate >= 0.15 ? "text-warn" : "text-danger";
  const pctStr = rate == null ? "—" : `${Math.round(rate * 100)}%`;
  const list = lens === "type" ? (data.byType || []) : (data.byGC || []);

  return (
    <Card title="Win rate · how often we land what we bid">
      {/* window toggle */}
      <div className="flex gap-1.5 mb-4">
        {[["window6", "Last 6 mo"], ["window12", "Last 12 mo"], ["allTime", "All-time"]].map(([k, label]) => (
          <button key={k} onClick={() => setWin(k)}
            className={`text-xs px-2.5 py-1 rounded-full border ${win === k ? "border-rebar/60 text-concrete bg-graphite" : "border-line text-rebar hover:text-concrete"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* headline */}
      <div className="flex items-baseline gap-3 mb-2">
        <span className={`text-4xl font-semibold ${tone}`}>{pctStr}</span>
        <span className="text-sm text-rebar">won {o.won ?? 0} of {o.decided ?? 0} decided bids</span>
      </div>

      {/* GOALPOST BAR: won (green) | lost (muted) split, with a 25% target marker */}
      <GoalpostBar won={o.won ?? 0} lost={o.lost ?? 0} target={target} />
      <div className="flex items-center justify-between text-[11px] text-rebar mb-4">
        <span>{o.won ?? 0} won · {o.lost ?? 0} lost · excludes in-flight & no-bids</span>
        <span className="text-concrete/70">◦ {Math.round(target * 100)}% target</span>
      </div>

      {/* lens toggle */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-1 rounded-md border border-line p-0.5">
          {[["type", "By type"], ["gc", "By GC"]].map(([k, label]) => (
            <button key={k} onClick={() => setLens(k)}
              className={`text-[11px] px-2 py-0.5 rounded ${lens === k ? "bg-graphite text-concrete" : "text-rebar hover:text-concrete"}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-rebar/60">tap a row for pricing detail</span>
      </div>

      {list.length === 0 ? (
        <div className="text-sm text-rebar py-3 text-center">No decided bids in this window yet.</div>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
          {list.map((seg) => {
            const beats = seg.rate != null && seg.rate >= target;
            return (
              <button key={seg.label} onClick={() => setModalSeg(seg)}
                className="w-full flex items-center gap-3 text-left hover:bg-graphite/40 rounded px-1.5 py-1 -mx-1.5 transition-colors">
                <span className="text-sm text-concrete w-40 truncate shrink-0">{seg.label}</span>
                <span className="flex-1 h-2 rounded-full bg-graphite overflow-hidden relative">
                  <span className="block h-full rounded-full" style={{ width: `${seg.rate == null ? 0 : seg.rate * 100}%`, background: beats ? "var(--ok)" : seg.rate >= 0.15 ? "var(--warn)" : "var(--danger)" }} />
                  {/* target tick */}
                  <span className="absolute top-0 bottom-0 w-px bg-concrete/50" style={{ left: `${target * 100}%` }} />
                </span>
                <span className={`text-xs tabular-nums w-9 text-right shrink-0 ${beats ? "text-ok" : seg.rate >= 0.15 ? "text-warn" : "text-danger"}`}>
                  {seg.rate == null ? "—" : `${Math.round(seg.rate * 100)}%`}
                </span>
                <span className="text-[11px] text-rebar tabular-nums w-12 text-right shrink-0">
                  {seg.won}/{seg.decided}
                </span>
                <span className="w-9 shrink-0 flex justify-end">
                  {seg.lowSample && <span className="text-[9px] text-rebar/70 border border-line rounded px-1">thin</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {list.some((s) => s.lowSample) && <div className="text-[11px] text-rebar mt-2"><span className="text-[9px] border border-line rounded px-1">thin</span> = under 4 decided bids, read as a hint</div>}

      {modalSeg && <WinRateSegModal seg={modalSeg} target={target} onClose={() => setModalSeg(null)} />}
    </Card>
  );
}

// Won/lost split bar with a target marker line — a goalpost, not just a fill.
function GoalpostBar({ won, lost, target }) {
  const total = won + lost;
  const wonPct = total ? (won / total) * 100 : 0;
  return (
    <div className="relative h-3 rounded-full bg-graphite overflow-hidden mb-1 flex">
      <div className="h-full" style={{ width: `${wonPct}%`, background: "var(--ok)" }} title={`${won} won`} />
      <div className="h-full flex-1" style={{ background: "rgba(180,80,80,0.35)" }} title={`${lost} lost`} />
      {/* target marker */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-white z-10" style={{ left: `${target * 100}%` }} title={`${Math.round(target * 100)}% target`} />
    </div>
  );
}

function WinRateSegModal({ seg, target, onClose }) {
  const beats = seg.rate != null && seg.rate >= target;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-line p-5 max-h-[85vh] overflow-y-auto" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-concrete font-medium text-lg">{seg.label}</h3>
          <button onClick={onClose} className="text-rebar hover:text-concrete">✕</button>
        </div>

        <div className="flex items-baseline gap-3 mb-1">
          <span className={`text-3xl font-semibold ${beats ? "text-ok" : seg.rate >= 0.15 ? "text-warn" : "text-danger"}`}>
            {seg.rate == null ? "—" : `${Math.round(seg.rate * 100)}%`}
          </span>
          <span className="text-sm text-rebar">won {seg.won} of {seg.decided}</span>
          <span className="text-[11px] text-rebar ml-auto">{beats ? "above" : "below"} {Math.round(target * 100)}% target</span>
        </div>

        {/* Typical won vs lost price — median (resists the one-outlier problem).
            Simple readout + plain verdict; no chart, because at 4-9 bids a chart
            implies more precision than the data supports. */}
        <MedianCompare seg={seg} />

        <div className="text-[11px] text-rebar rounded border border-line p-2.5 mt-4" style={{ background: "var(--surface-2)" }}>
          <span className="text-concrete/70">Context:</span> hard-bid public rebar work typically wins ~10–20% of bids, private ~15–25% (industry guidance). Ammex aims for {Math.round(target * 100)}% — hitting it means outperforming most public-work subs.
        </div>
      </div>
    </div>
  );
}

// Typical won vs lost bid price, using MEDIAN. Two numbers, a small range as
// context, and a plain verdict. No bar/dots — small samples don't support a
// chart, and the median comparison is the honest signal.
function MedianCompare({ seg }) {
  const wM = seg.wonMedRate, lM = seg.lostMedRate;
  const c = (r) => (r == null ? "—" : `${(r * 100).toFixed(0)}¢`);
  const rng = (r) => (r ? `${(r.min * 100).toFixed(0)}–${(r.max * 100).toFixed(0)}¢` : "—");

  let verdict, verdictTone = "text-concrete/80";
  if (wM == null || lM == null) {
    verdict = "Only one side has priced bids — not enough to compare yet.";
  } else {
    const gap = (lM - wM) * 100; // ¢ difference, lost minus won
    if (gap >= 5) { verdict = `Your losing bids run about ${gap.toFixed(0)}¢/lb higher than your winning ones — a sign you may be priced too high on ${seg.label}.`; verdictTone = "text-warn"; }
    else if (gap <= -5) { verdict = `Your winning bids run higher than your losing ones — losses here aren't about price.`; }
    else { verdict = `Winning and losing bids are priced about the same (within ${Math.abs(gap).toFixed(0)}¢) — price probably isn't what's deciding these.`; }
  }

  return (
    <div className="my-4">
      <div className="text-[10px] uppercase tracking-wider text-rebar/60 mb-2">typical bid price · won vs lost (median)</div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="rounded-lg border border-ok/30 p-3" style={{ background: "var(--surface-2)" }}>
          <div className="text-[10px] uppercase tracking-wider text-rebar mb-1">Won · typical</div>
          <div className="text-2xl font-semibold text-ok">{c(wM)}<span className="text-xs text-rebar">/lb</span></div>
          <div className="text-[11px] text-rebar mt-0.5">range {rng(seg.wonRange)} · {seg.won} bids</div>
        </div>
        <div className="rounded-lg border border-danger/30 p-3" style={{ background: "var(--surface-2)" }}>
          <div className="text-[10px] uppercase tracking-wider text-rebar mb-1">Lost · typical</div>
          <div className="text-2xl font-semibold text-danger">{c(lM)}<span className="text-xs text-rebar">/lb</span></div>
          <div className="text-[11px] text-rebar mt-0.5">range {rng(seg.lostRange)} · {seg.lost} bids</div>
        </div>
      </div>
      <p className={`text-sm leading-snug ${verdictTone}`}>{verdict}</p>
      {seg.lowSample && <p className="text-[11px] text-warn mt-2">Under 4 decided bids — read this as a hint, not a conclusion.</p>}
    </div>
  );
}


const STAGE = [["backlog", "#2f73d8", "Backlog"], ["active", "#4a9e63", "Active"], ["closed", "#5a626e", "Closed"]];
function BookByStage({ stages }) {
  const total = STAGE.reduce((s, [k]) => s + (stages[k] || 0), 0) || 1;
  return (
    <div>
      <div className="flex h-6 rounded-md overflow-hidden gap-0.5">
        {STAGE.map(([k, color, label]) => {
          const p = ((stages[k] || 0) / total) * 100;
          return p > 0 ? <div key={k} style={{ width: `${p}%`, background: color }} className="flex items-center justify-center text-[11px]" title={`${label}: ${money(stages[k])}`}><span style={{ color: "#12161c" }}>{p > 14 ? label : ""}</span></div> : null;
        })}
      </div>
      <div className="flex justify-between mt-2 text-[11px] text-rebar tabular-nums">
        <span>{money(stages.backlog)} backlog</span>
        <span>{money(stages.active)} active</span>
        <span>{money(stages.closed)} closed</span>
      </div>
    </div>
  );
}

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function TimesheetCard({ ts }) {
  const [hover, setHover] = useState(null);
  if (!ts) return <Card title="This week in the field"><div className="text-sm text-rebar py-4 text-center">No timesheet data.</div></Card>;

  // Trim trailing empty days (e.g. no weekend work); keep mid-week gaps as real info.
  let lastActive = -1;
  ts.byDay.forEach((h, i) => { if (h > 0) lastActive = i; });
  const days = lastActive >= 0 ? ts.byDay.slice(0, lastActive + 1) : ts.byDay.slice(0, 5);
  const maxDay = Math.max(1, ...days);
  const deltaTone = ts.delta == null ? "text-rebar" : ts.delta >= 0 ? "text-ok" : "text-warn";
  const deltaTxt = ts.delta == null ? null : `${ts.delta > 0 ? "\u25B2" : "\u25BC"} ${Math.abs(Math.round(ts.delta * 100))}% vs last week`;

  return (
    <div className="rounded-lg border border-line p-4 h-full" style={{ background: "var(--surface)" }}>
      <div className="text-[11px] uppercase tracking-wider text-rebar mb-3">This week in the field</div>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div className="text-[22px] leading-none font-semibold text-concrete tabular-nums">{ts.totalHours}<span className="text-xs font-normal text-rebar ml-1">hrs</span></div>
          <div className="text-[11px] text-rebar mt-1">total hours</div>
          {deltaTxt && <div className={`text-[11px] mt-0.5 ${deltaTone}`}>{deltaTxt}</div>}
        </div>
        <div>
          <div className="text-[22px] leading-none font-semibold text-concrete tabular-nums">{ts.crew}</div>
          <div className="text-[11px] text-rebar mt-1">crew</div>
        </div>
        <div>
          <div className="text-[22px] leading-none font-semibold text-concrete tabular-nums">{ts.jobs}</div>
          <div className="text-[11px] text-rebar mt-1">jobs</div>
        </div>
      </div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-rebar/70">by day</span>
        <span className="text-[11px] text-concrete tabular-nums h-[14px]">{hover != null ? `${DAY_FULL[hover]} \u00B7 ${days[hover]} hrs` : ""}</span>
      </div>
      <div className="flex items-end gap-2 h-9">
        {days.map((h, i) => (
          <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="flex-1 flex items-end h-full cursor-default">
            <div className="w-full rounded-sm" style={{ height: `${Math.max(6, (h / maxDay) * 100)}%`, background: hover === i ? "#ffa060" : h > 0 ? "#ff6a13" : "#2b313a" }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1">
        {days.map((_, i) => <div key={i} className="flex-1 text-center text-[10px] text-rebar">{DAYS[i]}</div>)}
      </div>
      {ts.weekly && ts.weekly.length > 1 && <WeeklyVariance weekly={ts.weekly} />}
      {(ts.underReviewHours > 0 || ts.unassignedHours > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] border-t border-line mt-3 pt-2.5">
          {ts.underReviewHours > 0 && <span className="text-warn">{ts.underReviewHours} hrs awaiting your review</span>}
          {ts.unassignedHours > 0 && <span className="text-warn">{ts.unassignedHours} hrs not tied to a job</span>}
        </div>
      )}
    </div>
  );
}

// Week-over-week total-hours variance — a compact line graph under the by-day
// bars. Toggle the window (2 wks / 1 mo / 3 mos). Uses the last N weeks of the
// weekly series (index 0 oldest, last = current week).
function WeeklyVariance({ weekly }) {
  const OPTS = [{ k: "2w", label: "2 wks", n: 2 }, { k: "1m", label: "1 mo", n: 4 }, { k: "3m", label: "3 mos", n: 13 }];
  const [win, setWin] = useState("1m");
  const opt = OPTS.find((o) => o.k === win) || OPTS[1];
  const series = weekly.slice(-opt.n);
  const max = Math.max(1, ...series);
  const min = Math.min(...series);

  // build an SVG polyline in a fixed viewbox
  const W = 300, H = 44, pad = 4;
  const n = series.length;
  const x = (i) => n <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (n - 1);
  const y = (v) => H - pad - ((v - Math.min(min, 0)) / (max - Math.min(min, 0) || 1)) * (H - pad * 2);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = series[n - 1] ?? 0;
  const prev = series[n - 2] ?? null;
  const wow = prev != null && prev > 0 ? last / prev - 1 : null;

  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-rebar/70">total hours · week over week</span>
        <div className="flex gap-1">
          {OPTS.map((o) => (
            <button key={o.k} onClick={() => setWin(o.k)}
              className={`text-[10px] px-1.5 py-0.5 rounded ${win === o.k ? "text-concrete bg-graphite" : "text-rebar hover:text-concrete"}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke="#ff6a13" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {series.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="#ff6a13" />)}
      </svg>
      <div className="flex items-center justify-between mt-1 text-[11px]">
        <span className="text-rebar tabular-nums">{series[0]?.toLocaleString()} → {last?.toLocaleString()} hrs</span>
        {wow != null && (
          <span className={wow >= 0 ? "text-ok" : "text-warn"}>
            {wow >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(Math.round(wow * 100))}% vs prior wk
          </span>
        )}
      </div>
    </div>
  );
}

// A single job in the "needs a location" modal — expand to add its address right
// here (autocomplete fills + geocodes), save writes straight to the project.
function NeedsLocationRow({ job, onSaved }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ street: job.site?.street || "", city: job.site?.city || "", state: job.site?.state || "AZ", zip: job.site?.zip || "", lat: null, lng: null });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!f.street.trim()) return;
    setBusy(true); setErr(null);
    try {
      const changes = {
        siteStreet: f.street.trim(), siteCity: f.city.trim(), siteState: f.state.trim(), siteZip: f.zip.trim(),
        ...(typeof f.lat === "number" ? { siteLat: f.lat, siteLng: f.lng } : {}),
      };
      const res = await fetch(`/api/projects/${job.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Couldn't save");
      onSaved();
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  return (
    <div className="px-5 py-3">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 text-left">
        <span className="min-w-0">
          <span className="block text-sm text-concrete truncate">{job.name || "—"}</span>
          {job.projectId && <span className="text-[11px] text-rebar">{job.projectId}</span>}
        </span>
        <span className="ml-auto text-[11px] text-rebar shrink-0">{open ? "hide" : "add address"} <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span></span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <AddressAutocomplete
            value={f.street}
            onType={(v) => setF((s) => ({ ...s, street: v }))}
            onPick={(a) => setF((s) => ({ ...s, street: a.street || s.street, city: a.city || s.city, state: a.state || s.state, zip: a.zip || s.zip, lat: typeof a.lat === "number" ? a.lat : s.lat, lng: typeof a.lng === "number" ? a.lng : s.lng }))}
          />
          <div className="grid grid-cols-6 gap-2">
            <input className="inp col-span-3" value={f.city} onChange={(e) => setF((s) => ({ ...s, city: e.target.value }))} placeholder="City" />
            <input className="inp col-span-1" value={f.state} onChange={(e) => setF((s) => ({ ...s, state: e.target.value }))} placeholder="State" />
            <input className="inp col-span-2" value={f.zip} onChange={(e) => setF((s) => ({ ...s, zip: e.target.value }))} placeholder="Zip" />
          </div>
          {err && <p className="text-[11px] text-danger">{err}</p>}
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy || !f.street.trim()} className="text-sm px-3 py-1.5 rounded-md bg-safety text-steel font-medium disabled:opacity-40">{busy ? "Saving…" : "Save address"}</button>
            <a href={`/projects/${job.id}`} className="text-[11px] text-rebar hover:text-concrete underline underline-offset-2">or open the project to drop a pin</a>
          </div>
        </div>
      )}
    </div>
  );
}
