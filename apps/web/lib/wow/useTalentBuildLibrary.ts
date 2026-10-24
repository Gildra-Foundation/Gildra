"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { makeTalentBuildStore } from "./talentBuildStore";
const stores = new Map<string, ReturnType<typeof makeTalentBuildStore>>();
export function useTalentBuildLibrary(owner: string, character: string, specialization: string) {
  const key = `gildra:builds:v3:${owner}:${character}:${specialization}`;
  const store = useMemo(() => {
    let value = stores.get(key);
    if (!value) { value = makeTalentBuildStore(key, owner, character, specialization); stores.set(key, value); }
    return value;
  }, [key, owner, character, specialization]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => {
    void store.synchronize();
    const retry = () => store.reload();
    window.addEventListener("online", retry); window.addEventListener("focus", retry);
    return () => { window.removeEventListener("online", retry); window.removeEventListener("focus", retry); };
  }, [store]);
  return { ...state, update: store.update, retry: store.reload };
}
