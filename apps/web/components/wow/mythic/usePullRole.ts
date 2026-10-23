"use client";

import { useSyncExternalStore } from "react";
import { parsePullRole, pullRoleStorageKey, type PullRoleSelection } from "./pullRole";

const changeEvent = "gildra:mythic:pull-role-change";
let memoryRole: PullRoleSelection = "all";
let storageFailed = false;

function snapshot(): PullRoleSelection {
  if (storageFailed) return memoryRole;
  try { return parsePullRole(window.localStorage.getItem(pullRoleStorageKey)); }
  catch { return memoryRole; }
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === pullRoleStorageKey || event.key === null) { memoryRole = parsePullRole(event.newValue); storageFailed = false; notify(); }
  };
  window.addEventListener(changeEvent, notify);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(changeEvent, notify); window.removeEventListener("storage", onStorage); };
}
function setRole(value: string) {
  memoryRole = parsePullRole(value);
  try { window.localStorage.setItem(pullRoleStorageKey, memoryRole); storageFailed = false; }
  catch { storageFailed = true; }
  window.dispatchEvent(new Event(changeEvent));
}
const serverSnapshot = (): PullRoleSelection => "all";

/** One preference for all dungeon pages and locales, with a stable SSR default. */
export function usePullRole() {
  return [useSyncExternalStore(subscribe, snapshot, serverSnapshot), setRole] as const;
}
