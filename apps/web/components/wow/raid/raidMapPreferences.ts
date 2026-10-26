"use client";

export type RaidMapBackground = "map" | "arena" | "grid" | "art";
export type RaidSketchPoint = { x: number; y: number };
const event = "gildra:raid-map-preference";
const memory = new Map<string, string>();
export const backgroundKey = "gildra:raid-map-background:v1";
export function subscribeMapPreferences(callback: () => void) {
  const storage = (change: StorageEvent) => { if (change.key) memory.delete(change.key); else memory.clear(); callback(); };
  window.addEventListener(event, callback);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(event, callback); window.removeEventListener("storage", storage); };
}
export function readMapPreference(key: string, fallback = ""): string {
  if (memory.has(key)) return memory.get(key)!;
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
export function saveMapPreference(key: string, value: string) {
  memory.set(key, value);
  try { window.localStorage.setItem(key, value); memory.delete(key); } catch { /* Memory keeps the control usable when storage is blocked. */ }
  window.dispatchEvent(new Event(event));
}
export function mapBackground(value: string): RaidMapBackground {
  return ["map", "arena", "grid", "art"].includes(value) ? value as RaidMapBackground : "map";
}
export function sketchPoints(value: string): RaidSketchPoint[] {
  try {
    const points: unknown = JSON.parse(value);
    if (!Array.isArray(points)) return [];
    return points.slice(0, 40).filter((p): p is RaidSketchPoint => !!p && typeof p === "object" &&
      typeof p.x === "number" && Number.isFinite(p.x) && p.x >= 0 && p.x <= 100 &&
      typeof p.y === "number" && Number.isFinite(p.y) && p.y >= 0 && p.y <= 100);
  } catch { return []; }
}
