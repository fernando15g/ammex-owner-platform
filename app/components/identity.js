"use client";

// =============================================================================
// WHO ARE YOU — lightweight identity, so the audit log can say "Fern changed
// this" instead of "someone changed this".
//
// This is identity by CONVENTION, not security. Anyone can claim to be anyone.
// It exists to attribute changes among people who trust each other, not to keep
// anyone out. When a real login exists, this retires.
//
// The name is written to a COOKIE as well as localStorage. That's deliberate:
// the cookie rides along with every request automatically, so the server can
// attribute a change without a single fetch call having to remember to send it.
// =============================================================================

import { useEffect, useState } from "react";

const KEY = "ammex-actor";
const CONFIRMED = "ammex-actor-confirmed";
export const KNOWN_PEOPLE = ["Fern"];   // add names here as the team grows

function writeCookie(name) {
  // one year; readable by the server on every API call
  document.cookie = `${KEY}=${encodeURIComponent(name)}; path=/; max-age=31536000; SameSite=Lax`;
}

export function getActor() {
  try { return window.localStorage.getItem(KEY) || null; } catch { return null; }
}

export function setActor(name, { confirmed = false } = {}) {
  try {
    window.localStorage.setItem(KEY, name);
    if (confirmed) window.localStorage.setItem(CONFIRMED, "1");
    writeCookie(name);
  } catch {}
}

export function clearActor() {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(CONFIRMED);
    document.cookie = `${KEY}=; path=/; max-age=0`;
  } catch {}
}

// A known person is remembered outright. Anyone else gets asked to confirm ONCE
// on their next visit — after that they're remembered too.
export function useIdentity() {
  const [actor, setActorState] = useState(null);
  const [needsAsk, setNeedsAsk] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const name = getActor();
    if (!name) {
      setNeedsAsk(true);
    } else {
      writeCookie(name); // keep the cookie fresh (it can expire before storage)
      setActorState(name);
      const isKnown = KNOWN_PEOPLE.includes(name);
      const confirmed = (() => { try { return window.localStorage.getItem(CONFIRMED) === "1"; } catch { return false; } })();
      if (!isKnown && !confirmed) setNeedsConfirm(true);
    }
    setReady(true);
  }, []);

  const choose = (name) => {
    const known = KNOWN_PEOPLE.includes(name);
    setActor(name, { confirmed: known });   // known people never need confirming
    setActorState(name);
    setNeedsAsk(false);
    setNeedsConfirm(false);
  };

  const confirm = () => {
    setActor(actor, { confirmed: true });
    setNeedsConfirm(false);
  };

  const change = () => {
    clearActor();
    setActorState(null);
    setNeedsAsk(true);
    setNeedsConfirm(false);
  };

  return { actor, ready, needsAsk, needsConfirm, choose, confirm, change };
}
