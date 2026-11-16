import { normalizeFarmSettings } from "./settings";
import type { GearFarmSettings } from "./types";

export const defaultFarmPreferences = JSON.stringify(normalizeFarmSettings());
const fallback = new Map<string, string>();
const changeEvent = "gildra:farm-preferences-change";

export function farmPreferencesKey(characterSlug: string, profileKey: string) {
  return `gildra:farm-preferences:v1:${JSON.stringify([characterSlug, profileKey])}`;
}

/** Stable strings let useSyncExternalStore hydrate with defaults, then restore
 * this tab's exact settings before looking up its matching background job. */
export function readFarmPreferences(key: string) {
  if (typeof window === "undefined") return defaultFarmPreferences;
  try {
    const raw = fallback.get(key) ?? window.sessionStorage.getItem(key);
    return raw ? JSON.stringify(normalizeFarmSettings(JSON.parse(raw))) : defaultFarmPreferences;
  } catch { return fallback.get(key) ?? defaultFarmPreferences; }
}

export function writeFarmPreferences(key: string, settings: GearFarmSettings) {
  const raw = JSON.stringify(normalizeFarmSettings(settings));
  try { window.sessionStorage.setItem(key, raw); fallback.delete(key); }
  catch { fallback.set(key, raw); }
  window.dispatchEvent(new Event(changeEvent));
}

export function subscribeFarmPreferences(listener: () => void) {
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(changeEvent, listener);
    window.removeEventListener("storage", listener);
  };
}
