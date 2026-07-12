"use client";

// Asks who you are once, then gets out of the way. Non-listed people ("Other")
// get asked to confirm on their SECOND visit — after that they're remembered.

import { useState } from "react";
import { useIdentity, KNOWN_PEOPLE } from "@/app/components/identity";

export default function IdentityGate() {
  const { actor, ready, needsAsk, needsConfirm, choose, confirm, change } = useIdentity();
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");

  if (!ready) return null;

  // --- second visit for someone not on the list: "still you?" -----------------
  if (needsConfirm) {
    return (
      <Shell>
        <p className="text-sm text-concrete mb-1">Welcome back.</p>
        <p className="text-lg font-semibold text-concrete mb-4">Are you still {actor}?</p>
        <p className="text-xs text-rebar mb-5">
          Your name is recorded against the changes you make, so the history says who did what.
        </p>
        <div className="flex gap-2">
          <button onClick={confirm} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">
            Yes, I&apos;m {actor}
          </button>
          <button onClick={change} className="text-sm px-4 py-2 rounded-md border border-line text-rebar hover:text-concrete">
            Someone else
          </button>
        </div>
      </Shell>
    );
  }

  // --- first visit ------------------------------------------------------------
  if (needsAsk) {
    return (
      <Shell>
        <p className="text-lg font-semibold text-concrete mb-1">Who&apos;s using Ammex OS?</p>
        <p className="text-xs text-rebar mb-5">
          Changes are recorded against your name, so the history can say who did what. You&apos;ll only be
          asked once — change it any time under System Check.
        </p>

        {typing ? (
          <div className="flex gap-2">
            <input
              autoFocus
              className="inp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) choose(name.trim()); }}
              placeholder="Your name"
            />
            <button
              onClick={() => name.trim() && choose(name.trim())}
              disabled={!name.trim()}
              className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium disabled:opacity-40 whitespace-nowrap"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {KNOWN_PEOPLE.map((p) => (
              <button key={p} onClick={() => choose(p)} className="text-sm px-4 py-2 rounded-md bg-safety text-steel font-medium">
                {p}
              </button>
            ))}
            <button onClick={() => setTyping(true)} className="text-sm px-4 py-2 rounded-md border border-line text-concrete hover:bg-graphite">
              Someone else
            </button>
          </div>
        )}
      </Shell>
    );
  }

  return null;
}

function Shell({ children }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)" }}>
      <div className="w-full max-w-md rounded-lg border border-line p-6 shadow-2xl" style={{ background: "var(--surface)" }}>
        {children}
      </div>
    </div>
  );
}
