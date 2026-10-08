"use client";

import { useEffect, useRef, useState } from "react";

const preferencesKey = "gildra-home-music";

export function useSoundPreferences() {
  const lastVolume = useRef(20);
  const [volume, setVolume] = useState(20);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let initialEnabled = true;
    try {
      const saved = JSON.parse(localStorage.getItem(preferencesKey) ?? "null");
      if (saved && Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 100 && typeof saved.enabled === "boolean") {
        setVolume(saved.volume);
        initialEnabled = saved.enabled;
        if (Number.isFinite(saved.lastVolume) && saved.lastVolume > 0 && saved.lastVolume <= 100) lastVolume.current = saved.lastVolume;
      }
    } catch { /* Audio still works with storage disabled. */ }
    setEnabled(initialEnabled);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (volume > 0) lastVolume.current = volume;
    try { localStorage.setItem(preferencesKey, JSON.stringify({ volume, enabled, lastVolume: lastVolume.current })); }
    catch { /* Optional preference persistence. */ }
  }, [ready, volume, enabled]);
  return { ready, volume, enabled, setVolume, setEnabled, lastVolume };
}
