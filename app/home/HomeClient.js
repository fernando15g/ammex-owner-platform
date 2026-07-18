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
import { AZ_COUNTIES, AZ_VIEWBOX } from "./azCounties";

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
};

export default function HomeClient({ data }) {
  const { tiles, analytics } = data;
  const [alerts, setAlerts] = useState(data.alerts);
  const [open, setOpen] = useState({}); // alertId -> bool
  const [modal, setModal] = useState(null); // { alertId, item }

  // Remove an item once it's resolved; drop the whole alert when it empties.
  const resolve = (alertId, itemId) => {
    setAlerts((prev) =>
      prev
        .map((a) => (a.id === alertId ? { ...a, items: a.items.filter((it) => it.id !== itemId), count: a.items.filter((it) => it.id !== itemId).length } : a))
        .filter((a) => a.items.length > 0)
    );
    setModal(null);
  };

  const need = alerts.reduce((s, a) => s + a.items.length, 0);

  return (
    <div className="space-y-7 max-w-5xl">
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
        <div className="rounded-xl border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
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
              />
            ))
          )}
        </div>
      </div>

      {/* ===================== analytics canvas ===================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card title="Job concentration · Arizona"><AzMap county={analytics.county} unmapped={analytics.unmapped} /></Card>
        <Card title="Work mix · by type"><WorkMixDonut mix={analytics.workMix} /></Card>
      </div>
      <Card title="Foreman scorecard · realized vs bid lbs/MH"><ForemanScorecard foremen={analytics.foremen} /></Card>
      <Card title="The Book · contract by stage"><BookByStage stages={analytics.bookStages} /></Card>

      {modal && (
        <Modal alert={alerts.find((a) => a.id === modal.alertId)} item={modal.item} onClose={() => setModal(null)} onResolve={resolve} />
      )}
    </div>
  );
}

function ZoneTile({ href, label, value, unit, sub, valueTone, subTone }) {
  const vc = valueTone === "amber" ? "text-warn" : "text-concrete";
  const sc = subTone === "danger" ? "text-danger" : subTone === "ok" ? "text-ok" : "text-rebar";
  return (
    <a href={href} className="group rounded-xl border border-line px-4 py-3.5 hover:border-rebar/60 transition-colors block" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px] uppercase tracking-wider text-rebar mb-1.5">{label}</div>
      <div className={`text-[26px] leading-none font-semibold tabular-nums ${vc}`}>
        {value}{unit && <span className="text-xs font-normal text-rebar ml-1">{unit}</span>}
      </div>
      {sub && <div className={`text-[11px] mt-2 ${sc}`}>{sub}</div>}
    </a>
  );
}

const DOT = { danger: "bg-danger", warn: "bg-warn", ok: "bg-ok" };

function AlertGroup({ alert, open, onToggle, onPick }) {
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
          {alert.items.map((it) => (
            <button key={it.id} onClick={() => onPick(it)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-graphite/40">
              <span className="min-w-0 text-sm text-concrete truncate">{meta.item ? meta.item(it) : it.name}</span>
              <span className="ml-auto shrink-0 text-right">
                <span className="text-sm tabular-nums text-concrete">{meta.right ? meta.right(it) : ""}</span>
                <span className="text-[11px] text-rebar ml-1">{meta.sub || ""}</span>
              </span>
              <span className="text-rebar text-xs shrink-0">›</span>
            </button>
          ))}
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
      <div className="w-full max-w-md rounded-xl border border-line overflow-hidden" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
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
  const markLost = async () => { if (window.confirm(`Mark "${item.name}" as lost?`) && await run(`/api/bids/${item.id}`, { changes: { status: "Lost" } }, "PATCH")) onDone(); };
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

// ---- analytics cards ----
function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-line p-4" style={{ background: "var(--surface)" }}>
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

function AzMap({ county, unmapped }) {
  const vals = Object.values(county);
  const max = Math.max(1, ...vals);
  const shade = (n) => (!n ? "#2b313a" : mixHex("#3a2a1c", "#ff6a13", 0.3 + 0.7 * (n / max)));
  return (
    <div>
      <svg viewBox={AZ_VIEWBOX} className="w-full" style={{ maxHeight: 240 }} role="img" aria-label="Arizona counties shaded by active job count">
        {AZ_COUNTIES.map((c) => (
          <path key={c.name} d={c.d} fill={shade(county[c.name] || 0)} stroke="#1c2127" strokeWidth={0.6}>
            <title>{c.name}: {county[c.name] || 0} active</title>
          </path>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-rebar mt-1.5">
        <span className="flex items-center gap-1.5"><span className="inline-block w-10 h-2 rounded" style={{ background: "linear-gradient(90deg,#2b313a,#ff6a13)" }} /> fewer → more jobs</span>
        {unmapped > 0 && <span>{unmapped} not placed</span>}
      </div>
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
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 116, height: 116 }}>
        <div style={{ width: 116, height: 116, borderRadius: "50%", background: `conic-gradient(${grad})` }} />
        <div className="absolute" style={{ inset: 22, borderRadius: "50%", background: "var(--surface)" }} />
      </div>
      <div className="flex flex-col gap-1.5 text-xs min-w-0">
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

function ForemanScorecard({ foremen }) {
  if (!foremen.length) return <div className="text-sm text-rebar py-4 text-center">No completed jobs with a foreman yet — assign foremen and this fills in.</div>;
  const max = Math.max(...foremen.map((f) => Math.max(f.realized || 0, f.bid || 0))) * 1.12 || 1;
  return (
    <div className="space-y-2.5">
      {foremen.map((f) => {
        const tone = f.gap == null ? "text-rebar" : f.gap >= 0.1 ? "text-ok" : f.gap >= -0.05 ? "text-rebar" : "text-danger";
        const bar = f.gap == null ? "bg-rebar/50" : f.gap >= 0.1 ? "bg-ok" : f.gap >= -0.05 ? "bg-rebar/60" : "bg-danger";
        return (
          <div key={f.name} className="flex items-center gap-3">
            <span className="w-24 text-sm text-concrete truncate shrink-0">{f.name}</span>
            <div className="flex-1 relative h-3.5 rounded bg-graphite min-w-0">
              <div className={`absolute left-0 top-0 h-3.5 rounded ${bar}`} style={{ width: `${((f.realized || 0) / max) * 100}%` }} />
              {f.bid && <div className="absolute w-0.5 bg-concrete" style={{ left: `${(f.bid / max) * 100}%`, top: -2, height: 18 }} />}
            </div>
            <span className="w-20 text-right text-sm tabular-nums text-concrete shrink-0">{f.realized != null ? Math.round(f.realized) : "—"}<span className="text-[10px] text-rebar ml-0.5">lbs/MH</span></span>
            <span className={`w-12 text-right text-sm font-semibold shrink-0 ${tone}`}>{f.gap != null ? `${f.gap > 0 ? "+" : ""}${Math.round(f.gap * 100)}%` : "—"}</span>
            {f.jobs < 2 && <span className="text-[10px] text-rebar/70 shrink-0">1 job</span>}
          </div>
        );
      })}
      <p className="text-[10px] text-rebar pt-1">White line = bid target · color = beating / on / behind bid.</p>
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
