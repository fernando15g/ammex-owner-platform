"use client";

// One themed dialog for the whole app, replacing window.confirm / window.prompt.
//
// The native dialogs are drawn by the browser, so they ignore the app's theme
// entirely — they look like a system alert dropped on top of the page. This is
// the same idea in our own styling: centered, dark surface, our buttons.
//
// Promise-based so call sites read almost the same as before:
//   if (!(await confirmDialog({ title: "…" }))) return;
//
// Resolves false when cancelled. On confirm it resolves true, or — when
// `checkbox` is used — an object of the checkbox states (still truthy, so the
// `if (!result) return;` pattern keeps working).
//
// Options:
//   title, message        — heading and body (body accepts \n for paragraphs)
//   confirmLabel/cancelLabel
//   danger                — red confirm button for destructive actions
//   typeToConfirm         — require typing this word exactly (e.g. "DELETE")
//   checkbox              — { key, label, defaultChecked } extra choice
import { createRoot } from "react-dom/client";
import { useState, useEffect, useRef } from "react";

function DialogUI({ opts, onDone }) {
  const {
    title, message, confirmLabel = "Confirm", cancelLabel = "Cancel",
    danger = false, typeToConfirm = null, checkbox = null,
  } = opts;
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(!!checkbox?.defaultChecked);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onDone(false);
      if (e.key === "Enter" && !typeToConfirm) onDone(checkbox ? { [checkbox.key]: checked } : true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checked, typeToConfirm, checkbox, onDone]);

  const ready = !typeToConfirm || typed.trim() === typeToConfirm;
  const confirm = () => { if (ready) onDone(checkbox ? { [checkbox.key]: checked } : true); };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => onDone(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-line shadow-2xl flex flex-col"
        style={{ background: "var(--surface)", maxHeight: "90vh" }}
      >
        <div className="px-5 py-3 border-b border-line shrink-0">
          <p className="text-sm font-medium text-concrete">{title}</p>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          {message && String(message).split("\n").filter(Boolean).map((line, i) => (
            <p key={i} className="text-sm text-rebar mb-2 last:mb-0 leading-relaxed">{line}</p>
          ))}

          {checkbox && (
            <label className="flex items-start gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
              <span className="text-sm text-concrete">{checkbox.label}</span>
            </label>
          )}

          {typeToConfirm && (
            <div className="mt-3">
              <p className="text-xs text-rebar mb-1.5">Type <span className="text-concrete font-medium">{typeToConfirm}</span> to confirm:</p>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && ready) confirm(); }}
                className="w-full text-sm px-3 py-2 rounded-md border border-line bg-transparent text-concrete focus:outline-none focus:border-rebar"
                placeholder={typeToConfirm}
              />
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-line flex gap-2 shrink-0">
          <button
            onClick={confirm}
            disabled={!ready}
            className={`text-sm px-4 py-2 rounded-md font-medium disabled:opacity-40 ${danger ? "bg-danger text-white" : "bg-safety text-steel"}`}
          >
            {confirmLabel}
          </button>
          <button onClick={() => onDone(false)} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog(opts) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (result) => {
      // unmount on a later tick — React won't let a root unmount mid-render
      setTimeout(() => { root.unmount(); host.remove(); }, 0);
      resolve(result);
    };
    root.render(<DialogUI opts={opts} onDone={done} />);
  });
}
