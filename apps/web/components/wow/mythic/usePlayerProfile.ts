"use client";

import { useSyncExternalStore } from "react";
import { parsePlayerProfile, playerProfileKey, type PlayerProfile } from "./playerTools";

const changeEvent = "gildra:mythic:player-profile-change";
let memoryValue = "";
let storageFailed = false;
function snapshot() {
  if (storageFailed) return memoryValue;
  try { return window.localStorage.getItem(playerProfileKey) ?? ""; }
  catch { return memoryValue; }
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === playerProfileKey || event.key === null) { memoryValue = event.newValue ?? ""; storageFailed = false; notify(); }
  };
  window.addEventListener(changeEvent, notify);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(changeEvent, notify); window.removeEventListener("storage", onStorage); };
}
function setProfile(profile: PlayerProfile) {
  memoryValue = JSON.stringify(parsePlayerProfile(profile));
  try { window.localStorage.setItem(playerProfileKey, memoryValue); storageFailed = false; }
  catch { storageFailed = true; }
  window.dispatchEvent(new Event(changeEvent));
}
const serverSnapshot = () => "";
export function usePlayerProfile() {
  return [parsePlayerProfile(useSyncExternalStore(subscribe, snapshot, serverSnapshot)), setProfile] as const;
}
