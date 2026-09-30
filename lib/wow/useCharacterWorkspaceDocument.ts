"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { usePathname } from "next/navigation";
import { langOf, type Lang } from "@/lib/i18n";

const syncEnglish: Record<string, string> = {
  "Сессия Battle.net истекла. Локальная копия сохранена.": "Your Battle.net session expired. A local copy has been saved.",
  "Серверное сохранение временно недоступно. Работаем с локальной копией.": "Server saving is temporarily unavailable. Using your local copy.",
  "Изменения с другого устройства объединены с текущими.": "Changes from another device have been merged with yours.",
  "Не удалось синхронизировать. Локальная копия не потеряна.": "Could not sync. Your local copy is safe.",
};

export type WorkspaceKind = "talent-builds" | "rotation-studio" | "trainer-settings" | "gear-owned" | "character-settings";
export type WorkspaceSyncState = "loading" | "local" | "saving" | "synced" | "offline" | "conflict";
type WorkspaceDocument<T> = { kind: WorkspaceKind; payload: T; revision: number; updatedAt: string };
// The simulation and trainer views unmount each other. A pending binding must
// survive that handoff, including the 350ms server-save debounce.
const trainerDrafts = new Map<string, { value: unknown; revision: number; saved: string }>();

const mutationId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `mutation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function stableKey(value: string) { let hash = 2166136261; for (let index=0;index<value.length;index+=1) { hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619); } return (hash>>>0).toString(16).padStart(8,"0"); }
function timestamp(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const entry = value as Record<string, unknown>;
  const raw = entry.updatedAt ?? entry.savedAt ?? entry.createdAt;
  return typeof raw === "number" ? raw : typeof raw === "string" ? Date.parse(raw) || 0 : 0;
}
function mergeById(server: unknown[], client: unknown[]) {
  const merged = new Map<string, unknown>();
  for (const item of [...server, ...client]) {
    const id = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : JSON.stringify(item);
    const previous = merged.get(id);
    if (!previous || timestamp(item) >= timestamp(previous)) merged.set(id, item);
  }
  return [...merged.values()];
}
function mergePayload<T>(kind: WorkspaceKind, server: T, client: T): T {
  if (kind === "gear-owned" && Array.isArray(server) && Array.isArray(client)) return [...new Set([...server, ...client])] as T;
  if (kind === "talent-builds" && Array.isArray(server) && Array.isArray(client)) return mergeById(server, client) as T;
  if (kind === "rotation-studio" && server && client && typeof server === "object" && typeof client === "object") {
    const left = server as Record<string, unknown>, right = client as Record<string, unknown>;
    return { ...left, ...right, builds: mergeById(Array.isArray(left.builds) ? left.builds : [], Array.isArray(right.builds) ? right.builds : []), combos: mergeById(Array.isArray(left.combos) ? left.combos : [], Array.isArray(right.combos) ? right.combos : []) } as T;
  }
  return server && client && typeof server === "object" && typeof client === "object" && !Array.isArray(server) && !Array.isArray(client)
    ? { ...server, ...client } as T : client;
}

export function useCharacterWorkspaceDocument<T>({
  enabled, characterSlug, specializationSlug, kind, localStorageKey, initialValue, validate, lang: requestedLang,
}: {
  enabled: boolean; characterSlug: string; specializationSlug: string; kind: WorkspaceKind;
  localStorageKey: string; initialValue: T; validate: (value: unknown) => T;
  lang?: Lang;
}) {
  const routeLang = langOf(usePathname());
  const lang = requestedLang ?? routeLang;
  const [value, setValueState] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState<WorkspaceSyncState>(enabled ? "loading" : "local");
  const [message, setMessage] = useState("");
  const revision = useRef(0);
  const lastSerialized = useRef("");
  const initialValueRef = useRef(initialValue);
  const validateRef = useRef(validate);
  const valueRef = useRef(initialValue);
  const localEpoch = useRef(0);
  initialValueRef.current = initialValue;
  validateRef.current = validate;
  const scope = useMemo(() => `character=${encodeURIComponent(characterSlug)}&specialization=${encodeURIComponent(specializationSlug)}`, [characterSlug, specializationSlug]);
  const channel = `${enabled}:${localStorageKey}:${scope}`;
  // Retain edits synchronously: a view switch can unmount the action bar
  // before either the persistence effect or its server debounce runs.
  const setValue = useCallback((update: SetStateAction<T>) => {
    if (kind !== "trainer-settings") {
      setValueState(update);
      return;
    }
    const next = typeof update === "function" ? (update as (current: T) => T)(valueRef.current) : update;
    if (JSON.stringify(next) === JSON.stringify(valueRef.current)) return;
    localEpoch.current += 1;
    valueRef.current = next;
    setValueState(next);
    const serialized = JSON.stringify(next);
    const saved = trainerDrafts.get(channel)?.saved ?? lastSerialized.current;
    const nextState = !enabled ? "local" : serialized === saved ? "synced" : "saving";
    if (enabled && serialized !== saved) trainerDrafts.set(channel, { value: next, revision: revision.current, saved });
    else trainerDrafts.delete(channel);
    try { window.localStorage.setItem(localStorageKey, serialized); } catch { /* The in-memory draft still survives a view switch. */ }
    setHydrated(true);
    setSyncState(nextState);
    setMessage("");
  }, [channel, enabled, kind, localStorageKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const initialEpoch = localEpoch.current;
    const draft = kind === "trainer-settings" ? trainerDrafts.get(channel) : undefined;
    if (draft) {
      const next = validateRef.current(draft.value);
      revision.current = draft.revision;
      lastSerialized.current = draft.saved;
      valueRef.current = next;
      setValueState(next);
      setHydrated(true);
      setSyncState("saving");
      setMessage("");
      return () => { active = false; controller.abort(); };
    }
    setHydrated(false); setSyncState(enabled ? "loading" : "local"); setMessage(""); revision.current=0;
    let local = initialValueRef.current;
    let hasLocal = false;
    try {
      const raw = window.localStorage.getItem(localStorageKey);
      if (raw !== null) { local=validateRef.current(JSON.parse(raw));hasLocal=true; }
    } catch { /* Invalid local data is ignored and cannot block server state. */ }
    const finish = (next: T, state: WorkspaceSyncState, nextRevision=0) => {
      if (!active || (kind === "trainer-settings" && localEpoch.current !== initialEpoch)) return;
      revision.current=nextRevision; lastSerialized.current=JSON.stringify(next); valueRef.current=next; setValueState(next); setSyncState(state); setHydrated(true);
      try { window.localStorage.setItem(localStorageKey, JSON.stringify(next)); } catch { /* Server remains authoritative. */ }
    };
    if (!enabled) { finish(local,"local"); return () => { active=false; }; }
    void (async () => {
      try {
        const response=await fetch(`/api/wow/workspace?${scope}`,{cache:"no-store",signal:controller.signal});
        if (!response.ok) throw new Error(response.status===401?"session_expired":"workspace_unavailable");
        const body=await response.json() as { documents?: WorkspaceDocument<unknown>[] };
        if (!active || (kind === "trainer-settings" && localEpoch.current !== initialEpoch)) return;
        const remote=body.documents?.find((document)=>document.kind===kind);
        if (remote) { finish(validateRef.current(remote.payload),"synced",remote.revision);return; }
        if (!hasLocal) { finish(initialValueRef.current,"synced",0);return; }
        const migrationKey=`local-${kind}-${stableKey(localStorageKey)}`;
        const migrated=await fetch(`/api/wow/workspace/migrate?${scope}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({migrationKey,documents:[{kind,payload:local,mutationId:`migration-${stableKey(`${localStorageKey}:${JSON.stringify(local)}`)}`}] }),signal:controller.signal});
        if (!migrated.ok) throw new Error("migration_failed");
        const migration=await migrated.json() as { documents?: WorkspaceDocument<unknown>[] };
        const document=migration.documents?.find((entry)=>entry.kind===kind);
        finish(document?validateRef.current(document.payload):local,"synced",document?.revision??1);
      } catch (error) {
        if (error instanceof DOMException && error.name==="AbortError") return;
        if (!active || (kind === "trainer-settings" && localEpoch.current !== initialEpoch)) return;
        finish(local,"offline",0); setMessage(error instanceof Error && error.message==="session_expired"?"Сессия Battle.net истекла. Локальная копия сохранена.":"Серверное сохранение временно недоступно. Работаем с локальной копией.");
      }
    })();
    return () => { active=false;controller.abort(); };
  }, [channel, enabled, kind, localStorageKey, scope]);

  useEffect(() => {
    if (!hydrated) return;
    const serialized=JSON.stringify(value);
    try { window.localStorage.setItem(localStorageKey,serialized); } catch { /* Server sync may still succeed. */ }
    if (!enabled || serialized===lastSerialized.current) return;
    const controller=new AbortController();
    const saveEpoch=localEpoch.current;
    const timer=window.setTimeout(async()=>{
      setSyncState("saving");
      const pending=value;
      const save=async(payload:T,expectedRevision:number,retry:boolean):Promise<void>=>{
        const response=await fetch(`/api/wow/workspace/${kind}?${scope}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload,expectedRevision,mutationId:mutationId()}),signal:controller.signal});
        const body=await response.json().catch(()=>null) as WorkspaceDocument<unknown>|{current?:WorkspaceDocument<unknown>}|null;
        if (controller.signal.aborted || (kind === "trainer-settings" && localEpoch.current !== saveEpoch)) return;
        if (response.status===409 && retry && body && "current" in body && body.current) {
          const current=body.current; const merged=mergePayload(kind,validateRef.current(current.payload),pending);
          setSyncState("conflict"); setMessage("Изменения с другого устройства объединены с текущими.");
          // Updating trainer value here would clean up this effect and abort
          // its own conflict retry. Adopt the merged value after the PUT.
          if (kind !== "trainer-settings") { valueRef.current=merged; setValueState(merged); }
          await save(merged,current.revision,false); return;
        }
        if (!response.ok || !body || !("revision" in body)) throw new Error("save_failed");
        const saved=body as WorkspaceDocument<unknown>; revision.current=saved.revision;lastSerialized.current=JSON.stringify(payload);setSyncState("synced");setMessage("");
        if (kind === "trainer-settings") {
          const draft = trainerDrafts.get(channel);
          if (draft && JSON.stringify(draft.value) === JSON.stringify(pending)) trainerDrafts.delete(channel);
          if (JSON.stringify(payload) !== JSON.stringify(pending) && JSON.stringify(valueRef.current) === JSON.stringify(pending)) {
            valueRef.current = payload;
            setValueState(payload);
          }
        }
      };
      try { await save(pending,revision.current,true); }
      catch (error) { if (!controller.signal.aborted && !(error instanceof DOMException && error.name==="AbortError") && (kind !== "trainer-settings" || localEpoch.current === saveEpoch)) { setSyncState("offline");setMessage("Не удалось синхронизировать. Локальная копия не потеряна."); } }
    },350);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  }, [channel, enabled, hydrated, kind, localStorageKey, scope, value]);

  return { value, setValue, hydrated, syncState, message: lang === "en" ? syncEnglish[message] ?? message : message };
}
