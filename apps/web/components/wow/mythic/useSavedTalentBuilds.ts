"use client";

import { useMemo, useSyncExternalStore } from "react";
import { parseSavedTalentBuilds, removeTalentBuild, saveTalentBuild, savedTalentBuildsKey, type BuildSaveResult, type SavedTalentBuild } from "./savedTalentBuilds";

import { useAccountTalentBuilds } from "./useAccountTalentBuilds";
import { decodeMythicTalentImport } from "./mythicTalentImport";

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
function saveGuest(name: string, code: string): BuildSaveResult {
  // Re-read on mutation so another tab's latest edits are not overwritten by render state.
  const { builds } = parseSavedTalentBuilds(snapshot().slice(2));
  const result = saveTalentBuild(builds, name, code, crypto.randomUUID());
  if (result.ok) commit(result.builds);
  return result;
}
function removeGuest(id: string) {
  commit(removeTalentBuild(parseSavedTalentBuilds(snapshot().slice(2)).builds, id));
}
const serverSnapshot = () => "1:";
export function useSavedTalentBuilds() {
  const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const parsed = useMemo(() => parseSavedTalentBuilds(value.slice(2)), [value]);
  const account = useAccountTalentBuilds();
  const localToMigrate = parsed.builds.filter(build => decodeMythicTalentImport(build.code).ok);
  return {
    builds: account.mode === "guest" ? parsed.builds : account.builds,
    corrupt: account.mode === "guest" && parsed.corrupt,
    persistent: account.mode !== "guest" || value.startsWith("1:"),
    scope: account.mode === "guest" ? "guest" : account.accountKey, mode: account.mode, accountName: account.accountName, busy: account.busy, error: account.error,
    localCount: localToMigrate.length, localInvalidCount: parsed.builds.length - localToMigrate.length,
    refresh: account.refresh,
    save: async (name: string, code: string): Promise<BuildSaveResult> => account.mode === "guest" ? saveGuest(name, code) : account.save(name, code),
    remove: async (id: string): Promise<BuildSaveResult> => {
      if (account.mode !== "guest") return account.remove(id);
      removeGuest(id); return { ok: true, builds: parseSavedTalentBuilds(snapshot().slice(2)).builds };
    },
    migrate: async (): Promise<BuildSaveResult> => {
      const result = await account.migrate(localToMigrate);
      if (result.ok) {
        // Remove only acknowledged entries from the latest guest list; preserve concurrent local edits.
        const latest = parseSavedTalentBuilds(snapshot().slice(2)).builds;
        commit(latest.filter(b => !localToMigrate.some(old => old.id === b.id && old.code === b.code && old.name === b.name)));
      }
      return result;
    },
  };
}
