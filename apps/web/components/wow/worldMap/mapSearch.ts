import type { AtlasBundle, AtlasEvent, AtlasMap, AtlasPoi } from "@/lib/wow/worldMap/bundle";

/** Search over zones, cities, dungeons, raids and events of the map (both spellings: ё = е, no accents). */
export type SearchHit =
  | { type: "map"; key: string; title: string; context: string; map: AtlasMap; score: number }
  | { type: "poi"; key: string; title: string; context: string; poi: AtlasPoi; score: number }
  | { type: "event"; key: string; title: string; context: string; event: AtlasEvent; score: number };

export const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ё/g, "е").replace(/[’'`]/g, "").replace(/\s+/g, " ").trim();

type Entry = { words: string; hit: Omit<SearchHit, "score"> };

export function buildSearch(bundle: AtlasBundle) {
  const byId = new Map(bundle.maps.map((map) => [map.id, map]));
  const parentName = (id: number | null) => (id === null ? "" : byId.get(id)?.name ?? "");
  const entries: Entry[] = [];
  for (const map of bundle.maps) {
    if (map.type === "cosmic") continue;
    entries.push({ words: normalize(map.name), hit: { type: "map", key: `m${map.id}`, title: map.name, context: parentName(map.parent), map } as Omit<SearchHit, "score"> });
  }
  for (const poi of bundle.pois) {
    if (poi.kind === "zone-label") continue;
    entries.push({ words: normalize(poi.name), hit: { type: "poi", key: `p${poi.id}`, title: poi.name, context: byId.get(poi.map)?.name ?? "", poi } as Omit<SearchHit, "score"> });
  }
  for (const event of bundle.events) {
    entries.push({ words: normalize(`${event.title} ${event.patch}`), hit: { type: "event", key: `e${event.id}`, title: event.title, context: event.patch, event } as Omit<SearchHit, "score"> });
  }
  return (query: string, limit = 8): SearchHit[] => {
    const q = normalize(query);
    if (!q) return [];
    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const entry of entries) {
      const at = entry.words.indexOf(q);
      if (at < 0) continue;
      // Whole-word starts first, then shorter names, then maps over points.
      const wordStart = at === 0 || entry.words[at - 1] === " ";
      const score = (at === 0 ? 0 : wordStart ? 10 : 30) + entry.words.length * 0.1 + (entry.hit.type === "map" ? 0 : entry.hit.type === "event" ? 1 : 2);
      const dedupe = `${entry.hit.type === "event" ? "e" : "x"}:${entry.hit.title}:${entry.hit.context}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      hits.push({ ...entry.hit, score } as SearchHit);
    }
    return hits.sort((a, b) => a.score - b.score).slice(0, limit);
  };
}
