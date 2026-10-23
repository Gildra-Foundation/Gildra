"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parseSavedTalentBuilds, removeTalentBuild, saveTalentBuild, savedTalentBuildsKey, type BuildSaveResult, type SavedTalentBuild } from "./savedTalentBuilds";

const changeEvent = "gildra:mythic:saved-builds-change";
let memoryValue = "";
let memoryOnly = false;
function snapshot() {
  if (memoryOnly) return `0:${memoryValue}`;
  try { return `1:${window.localStorage.getItem(savedTalentBuildsKey) ?? ""}`; }
  catch { return `0:${memoryValue}`; }
}
function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === savedTalentBuildsKey || event.key === null) { memoryValue = event.newValue ?? ""; memoryOnly = false; notify(); }
  };
  window.addEventListener(changeEvent, notify);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(changeEvent, notify); window.removeEventListener("storage", onStorage); };
}
function commit(builds: SavedTalentBuild[]) {
  memoryValue = JSON.stringify({ version: 1, builds });
  try { window.localStorage.setItem(savedTalentBuildsKey, memoryValue); memoryOnly = false; }
  catch { memoryOnly = true; }
  window.dispatchEvent(new Event(changeEvent));
}
function save(name: string, code: string): BuildSaveResult {
  // Re-read on mutation so another tab's latest edits are not overwritten by render state.
  const { builds } = parseSavedTalentBuilds(snapshot().slice(2));
  const result = saveTalentBuild(builds, name, code, crypto.randomUUID());
  if (result.ok) commit(result.builds);
  return result;
}
function remove(id: string) {
  commit(removeTalentBuild(parseSavedTalentBuilds(snapshot().slice(2)).builds, id));
}
const serverSnapshot = () => "1:";
export function useSavedTalentBuilds() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const parsed = useMemo(() => parseSavedTalentBuilds(value.slice(2)), [value]);
  return { ...parsed, persistent: value.startsWith("1:"), save, remove };
}
