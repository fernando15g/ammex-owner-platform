"use client";

// =============================================================================
// UNSAVED-CHANGES GUARD — drop into any edit form. Renders nothing until the
// user tries to LEAVE with unsaved work, then shows a Save / Discard / Stay
// dialog (OS-styled) instead of silently losing their edits.
//
// How leaving is caught (this app navigates with plain <a> links, so every
// in-app move is a full page load):
//   1. A capture-phase click listener intercepts internal <a> clicks while
//      dirty and shows the styled dialog. New-tab clicks (cmd/ctrl), external
//      links, mailto/tel, #anchors and downloads pass through untouched —
//      none of those lose the page's state.
//   2. `beforeunload` backstops everything else (tab close, refresh, back
//      button, address bar). Browsers only allow their native prompt there.
//
// `dirty` can be a boolean or a function (evaluated at event time — use a
// function when dirtiness lives in refs that don't re-render).
//
// `onSave` (optional): async, must return `true` on success — then the guard
// navigates on. Anything else means the save failed (the form shows its own
// error) and we stay put. Omit it for create-flows where the form's own Save
// button is the only sensible completion.
//
// Forms that redirect programmatically after their OWN save must call
// disarmUnsavedGuard() first, so the beforeunload backstop doesn't prompt on
// a navigation the user asked for.
// =============================================================================
import { useEffect, useRef, useState } from "react";

let disarmed = false;
export function disarmUnsavedGuard() { disarmed = true; }

export default function UnsavedGuard({ dirty, onSave = null, what = "your changes" }) {
  const [pending, setPending] = useState(null); // href we intercepted
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    disarmed = false; // a fresh page mount re-arms the guard
    const isDirty = () => {
      const d = dirtyRef.current;
      return typeof d === "function" ? !!d() : !!d;
    };
    const beforeUnload = (e) => {
      if (disarmed || !isDirty()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e) => {
      if (disarmed || !isDirty() || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // new tab etc. — page state survives
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      let url;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(url.href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const go = (url) => { disarmed = true; window.location.href = url; };

  if (!pending) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && setPending(null)}>
      <div className="w-full max-w-sm rounded-lg border border-line p-5" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-concrete font-semibold text-lg">Unsaved changes</h3>
        <p className="text-sm text-rebar mt-2 leading-relaxed">
          You have unsaved changes to {what}. Leaving now will lose them.
        </p>
        <div className="mt-4 space-y-2">
          <button onClick={() => setPending(null)} disabled={busy}
            className="w-full text-sm px-4 py-2.5 rounded-md bg-safety text-steel font-medium disabled:opacity-50">
            Keep editing
          </button>
          {onSave && (
            <button disabled={busy}
              onClick={async () => {
                setBusy(true);
                let ok = false;
                try { ok = (await onSave()) === true; } catch { ok = false; }
                if (ok) { go(pending); return; }
                setBusy(false);
                setPending(null); // stay — the form is showing its own error
              }}
              className="w-full text-sm px-4 py-2.5 rounded-md border border-line text-concrete hover:bg-graphite disabled:opacity-50">
              {busy ? "Saving…" : "Save & leave"}
            </button>
          )}
          <button onClick={() => go(pending)} disabled={busy}
            className="w-full text-sm px-4 py-2.5 rounded-md border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50">
            Discard & leave
          </button>
        </div>
      </div>
    </div>
  );
}
