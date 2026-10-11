"use client";

import { useEffect, useRef, useState } from "react";
import { readBrowserConsent } from "@/lib/browserConsent";

const preferencesKey = "gildra-home-music";
type Preferences = { volume: number; enabled: boolean; lastVolume: number; confirmed: boolean };
// Preserve choices during client navigation even when storage is unavailable.
let visitPreferences: Preferences | null = null;

function readPreferences(raw: string | null): Preferences | null {
  const saved = JSON.parse(raw ?? "null");
  if (!saved || !Number.isFinite(saved.volume) || saved.volume < 0 || saved.volume > 100 || typeof saved.enabled !== "boolean") return null;
  return {
    volume: saved.volume,
    enabled: saved.enabled,
    lastVolume: Number.isFinite(saved.lastVolume) && saved.lastVolume > 0 && saved.lastVolume <= 100
      ? saved.lastVolume : saved.volume > 0 ? saved.volume : 20,
    // Older releases saved sound and cookie choices without a confirmation
    // flag. Keep those choices instead of asking existing visitors again.
    confirmed: "confirmed" in saved ? saved.confirmed === true : readBrowserConsent() !== null,
  };
}

function savePreferences(value: Preferences) {
  visitPreferences = value;
  try { localStorage.setItem(preferencesKey, JSON.stringify(value)); }
  catch { /* Audio still works with storage disabled. */ }
}

export function useSoundPreferences() {
  const lastVolume = useRef(20);
  const [volume, setVolume] = useState(20);
  const [enabled, setEnabled] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let saved = visitPreferences;
    try {
      saved = readPreferences(localStorage.getItem(preferencesKey));
    } catch { /* Audio still works with storage disabled. */ }
    if (saved) {
      setVolume(saved.volume);
      setEnabled(saved.enabled);
      setConfirmed(saved.confirmed);
      lastVolume.current = saved.lastVolume;
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (volume > 0) lastVolume.current = volume;
    savePreferences({ volume, enabled, lastVolume: lastVolume.current, confirmed });
  }, [ready, volume, enabled, confirmed]);

  function confirm(soundEnabled: boolean) {
    const nextVolume = soundEnabled ? volume || lastVolume.current : volume;
    // Commit synchronously so an immediate navigation also sees the choice.
    savePreferences({ volume: nextVolume, enabled: soundEnabled, lastVolume: lastVolume.current, confirmed: true });
    setVolume(nextVolume);
    setEnabled(soundEnabled);
    setConfirmed(true);
  }
  return { ready, volume, enabled, confirmed, confirm, setVolume, setEnabled, lastVolume };
}
