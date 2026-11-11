"use client";
import { useSyncExternalStore } from "react";

import { foreverNavigationEvent as eventName, notifyForeverNavigation } from "@/lib/forever/navigation";
function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  window.addEventListener(eventName, listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
    window.removeEventListener(eventName, listener);
  };
}
export function useDungeonLocation() {
  return useSyncExternalStore(subscribe, () => window.location.search + window.location.hash, () => "");
}
export function readDungeonLocation(location: string) {
  const [search, hash = ""] = location.split("#");
  const floor = new URLSearchParams(search).get("mapFloor");
  return {
    floor: floor && /^[1-9]\d*$/.test(floor) ? Number(floor) : undefined,
    encounter: /^encounter-[1-9]\d*$/.test(hash) ? Number(hash.slice(10)) : undefined,
    mapFloor: /^map-floor-[1-9]\d*$/.test(hash) ? Number(hash.slice(10)) : undefined,
    route: /^route-[1-9]\d*$/.test(hash) ? Number(hash.slice(6)) : undefined,
  };
}
/** Preserve unrelated query parameters and Next's history metadata. */
export function navigateDungeon(hash: string, floor?: number) {
  const url = new URL(window.location.href);
  url.hash = hash;
  if (floor !== undefined) url.searchParams.set("mapFloor", String(floor));
  if (url.href !== window.location.href) window.history.pushState(window.history.state, "", url);
  notifyForeverNavigation();
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
