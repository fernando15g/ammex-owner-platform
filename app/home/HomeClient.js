"use client";

// =============================================================================
// HOME — the front door. Two layers: a glance (one headline per zone, each a
// link in), and "needs your attention" — the short list of exceptions that
// actually cost money or hide risk. Cold-bid alerts can be resolved right here
// (snooze the follow-up clock, or mark the bid lost) without leaving Home.
// =============================================================================

import { useState } from "react";

const money = (n) =>
  typeof n !== "number" ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n) >= 1e6 ? `${(Math.abs(n) / 1e6).toFixed(2)}M` : Math.abs(n) >= 1e3 ? `${Math.round(Math.abs(n) / 1e3)}k` : Math.round(Math.abs(n))}`;
const pct = (f, signed = false) => (typeof f !== "number" ? "—" : `${signed && f > 0 ? "+" : ""}${Math.round(f * 100)}%`);
const rate = (n) => (typeof n === "number" ? `${Math.round(n)}` : "—");

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
const today = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

export default function HomeClient({ data }) {
  const { tiles, alerts } = data;
  const [items, setItems] = useState(alerts);

  // Snooze/close mutate a bid, then drop it from the cold-bid alert locally so
  // the list reflects the action immediately.
  const resolveBid = (bidId) => {
    setItems((prev) =>
      prev
        .map((a) => (a.id === "cold" ? { ...a, bids: (a.bids || []).filter((b) => b.id !== bidId) } : a))
        .filter((a) => a.id !== "cold" || (a.bids && a.bids.length > 0))
        .map((a) => (a.id === "cold" ? { ...a, text: `${a.bids.length} bid${a.bids.length === 1 ? "" : "s"} gone cold` } : a))
    );
  };

  const liveCount = items.length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-concrete">{greeting()}, Fernando</h2>
        <p className="text-sm text-rebar mt-0.5">
          {today()}
          {liveCount > 0 ? ` · ${liveCount} thing${liveCount === 1 ? "" : "s"} need a look` : " · all clear"}
        </p>
      </div>

      {/* the glance */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <ZoneTile href="/pipeline" label="Bids in flight" value={money(tiles.pipeline.weighted)} sub={`${tiles.pipeline.count} bids · weighted`} />
        <ZoneTile href="/active" label="Active work" value={`${tiles.active.running}`} unit="running"
          sub={tiles.active.overPace > 0 ? `${tiles.active.overPace} over pace` : "on pace"} subTone={tiles.active.overPace > 0 ? "danger" : "ok"} />
        <ZoneTile href="/billing" label="To collect" value={money(tiles.billing.outstanding)} valueTone="amber"
          sub={tiles.billing.overdue60 > 0 ? `${money(tiles.billing.overdue60)} past 60d` : "current"} subTone={tiles.billing.overdue60 > 0 ? "danger" : "ok"} />
        <ZoneTile href="/book" label="The Book" value={money(tiles.book.contract)}
          sub={`${money(tiles.book.profit)} profit`} subTone="ok" />
        <ZoneTile href="/performance" label="Crew pace" value={rate(tiles.performance.realized)} unit="lbs/MH"
          sub={tiles.performance.gapPct != null ? `${pct(tiles.performance.gapPct, true)} vs bid` : "—"}
          subTone={tiles.performance.gapPct != null && tiles.performance.gapPct < 0 ? "danger" : "ok"} />
      </div>

      {/* needs your attention */}
      <div className="rounded-lg border border-line overflow-hidden" style={{ background: "var(--surface)" }}>
        <div className="px-4 py-2.5 border-b border-line text-[11px] uppercase tracking-wider text-rebar">
          Needs your attention
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-rebar">Nothing needs you right now. Nicely done.</div>
        ) : (
          items.map((a) => <Alert key={a.id} alert={a} onResolve={resolveBid} />)
        )}
      </div>
    </div>
  );
}

function ZoneTile({ href, label, value, unit, sub, valueTone, subTone }) {
  const vc = valueTone === "amber" ? "text-warn" : "text-concrete";
  const sc = subTone === "danger" ? "text-danger" : subTone === "ok" ? "text-ok" : "text-rebar";
  return (
    <a href={href} className="relative rounded-lg border border-line px-4 py-3 hover:border-rebar/50 transition-colors block" style={{ background: "var(--surface-2)" }}>
      <div className="text-[11px] text-rebar mb-1">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${vc}`}>
        {value}{unit && <span className="text-xs font-normal text-rebar ml-1">{unit}</span>}
      </div>
      {sub && <div className={`text-[11px] mt-1 ${sc}`}>{sub}</div>}
    </a>
  );
}

const DOT = { danger: "bg-danger", warn: "bg-warn", ok: "bg-ok" };

function Alert({ alert, onResolve }) {
  const [openCold, setOpenCold] = useState(false);
  const isCold = alert.id === "cold" && (alert.bids || []).length > 0;

  return (
    <div className="border-b border-line last:border-b-0">
      <a
        href={isCold ? undefined : alert.href}
        onClick={isCold ? (e) => { e.preventDefault(); setOpenCold((o) => !o); } : undefined}
        className="flex items-center gap-3 px-4 py-3 hover:bg-graphite/40 cursor-pointer"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT[alert.sev] || "bg-rebar"}`} />
        <span className="text-sm text-concrete">{alert.text}</span>
        <span className="ml-auto text-[11px] text-rebar inline-flex items-center gap-1">
          {isCold ? (openCold ? "hide" : "review") : alert.href.replace("/", "")}
          <span className={`transition-transform ${openCold ? "rotate-90" : ""}`}>›</span>
        </span>
      </a>

      {isCold && openCold && (
        <div className="border-t border-line divide-y divide-line" style={{ background: "var(--surface-2)" }}>
          {alert.bids.map((b) => (
            <ColdBidRow key={b.id} bid={b} onDone={() => onResolve(b.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ColdBidRow({ bid, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const patch = async (changes) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "Couldn't save");
      onDone();
    } catch (e) {
      setErr(String(e.message || e));
      setBusy(false);
    }
  };

  const snooze = () => patch({ lastFollowUp: new Date().toISOString().slice(0, 10) });
  const markLost = () => { if (window.confirm(`Mark "${bid.name}" as lost?`)) patch({ status: "Lost" }); };

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <a href={`/pipeline/${bid.id}`} className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm text-concrete truncate hover:text-safety">{bid.name || "—"}</div>
          <div className="text-[11px] text-rebar">
            {bid.gc?.length ? `${bid.gc.join(", ")} · ` : ""}{bid.coldDays}d quiet{typeof bid.contractValue === "number" ? ` · ${money(bid.contractValue)}` : ""}
          </div>
        </a>
        <button onClick={snooze} disabled={busy}
          className="text-xs px-2.5 py-1 rounded-md border border-line text-rebar hover:text-concrete hover:border-rebar/50 disabled:opacity-50">
          Snooze 2 wks
        </button>
        <button onClick={markLost} disabled={busy}
          className="text-xs px-2.5 py-1 rounded-md border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50">
          Mark lost
        </button>
      </div>
      {err && <p className="text-[11px] text-danger mt-1.5">{err}</p>}
    </div>
  );
}
