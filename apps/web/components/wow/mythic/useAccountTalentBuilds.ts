"use client";

import { useEffect, useSyncExternalStore } from "react";
import { AccountTalentBuildStore } from "./accountTalentBuilds";

let channel: BroadcastChannel | undefined;
/** The account chip's status endpoint answers guests with 200, so a guest never asks for account builds. */
async function signedIn() {
  try {
    const response = await fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(12_000) });
    const body: unknown = await response.json().catch(() => null);
    return !response.ok || (body as { connected?: unknown } | null)?.connected === true;
  } catch { return true; }
}
const account = new AccountTalentBuildStore((...args) => fetch(...args), () => channel?.postMessage("changed"), signedIn);
let mounts = 0;
let cleanup: (() => void) | undefined;
function start() {
  if (mounts++ === 0) {
    const refresh = () => { if (document.visibilityState === "visible") void account.refresh(); };
    if (typeof BroadcastChannel !== "undefined") { channel = new BroadcastChannel("gildra:mythic:account-builds"); channel.onmessage = refresh; }
    const session = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("next-auth");
    if (session) session.onmessage = refresh;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    void account.refresh();
    cleanup = () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); channel?.close(); channel = undefined; session?.close(); };
  }
  return () => { if (--mounts === 0) { cleanup?.(); cleanup = undefined; account.reset(); } };
}
export function useAccountTalentBuilds() {
  const state = useSyncExternalStore(account.subscribe, account.snapshot, account.serverSnapshot);
  useEffect(start, []);
  return { ...state, save: account.save.bind(account), remove: account.remove.bind(account), migrate: account.migrate.bind(account), refresh: account.refresh.bind(account) };
}
