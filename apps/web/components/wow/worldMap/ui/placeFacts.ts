import type { AtlasEvent, AtlasMap, AtlasPoi } from "@/lib/wow/worldMap/bundle";

/** What the panel tells about a place: its instances with our pages and the events of the timeline there. */
export type PlaceFacts = { instances: AtlasPoi[]; events: AtlasEvent[] };

const INSTANCE = new Set(["raid", "dungeon", "delve"]);
const ORDER: Record<string, number> = { raid: 0, dungeon: 1, delve: 2 };

/** A zone counts what lies in it and in its cities and caves; a continent only its own points, not every zone's. */
export function placeFacts(map: AtlasMap, byId: Map<number, AtlasMap>, poisByMap: Map<number, AtlasPoi[]>, events: AtlasEvent[]): PlaceFacts {
  const ids = new Set<number>([map.id]);
  if (map.type === "zone" || map.type === "micro") {
    const walk = (id: number) => { for (const child of byId.get(id)?.children ?? []) { if (!ids.has(child)) { ids.add(child); walk(child); } } };
    walk(map.id);
  }
  const seen = new Set<string>();
  const instances: AtlasPoi[] = [];
  for (const id of ids) {
    for (const poi of poisByMap.get(id) ?? []) {
      if (!INSTANCE.has(poi.kind) || !poi.href) continue;
      // One row per page (a raid with two entrances is one place on our site).
      if (seen.has(poi.href)) continue;
      seen.add(poi.href);
      instances.push(poi);
    }
  }
  instances.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name));
  const here = events.filter((event) => event.map !== null && (ids.has(event.map) || (event.changed ?? []).some((id) => ids.has(id))));
  return { instances, events: here };
}
