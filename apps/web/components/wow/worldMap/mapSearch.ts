import type { AtlasBundle, AtlasEvent, AtlasMap, AtlasPoi } from "@/lib/wow/worldMap/bundle";

/** Search over zones, cities, dungeons, raids and events of the map (both spellings: ё = е, no accents). */
export type SearchHit =
  | { type: "map"; key: string; title: string; context: string; map: AtlasMap; score: number }
  | { type: "poi"; key: string; title: string; context: string; poi: AtlasPoi; score: number }
  | { type: "event"; key: string; title: string; context: string; event: AtlasEvent; score: number };

export const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ё/g, "е").replace(/[’'`]/g, "").replace(/\s+/g, " ").trim();

type Entry = { words: string; hit: Omit<SearchHit, "score"> };

/** Names of the same places in the other language (by map, point and event id): RU readers may type the English name and back. */
export type AltNames = { maps: Map<number, string>; pois: Map<string, string>; events: Map<string, string> };
export function altNames(other: Pick<AtlasBundle, "maps" | "pois" | "events">): AltNames {
  return {
    maps: new Map(other.maps.map((map) => [map.id, map.name])),
    pois: new Map(other.pois.map((poi) => [poi.id, poi.name])),
    events: new Map(other.events.map((event) => [event.id, event.title])),
  };
}

export function buildSearch(bundle: AtlasBundle, alt?: AltNames | null) {
  const also = (name: string, other: string | undefined) => (other && normalize(other) !== normalize(name) ? `${normalize(name)} | ${normalize(other)}` : normalize(name));
  const byId = new Map(bundle.maps.map((map) => [map.id, map]));
  const parentName = (id: number | null) => (id === null ? "" : byId.get(id)?.name ?? "");
  const entries: Entry[] = [];
  for (const map of bundle.maps) {
    if (map.type === "cosmic") continue;
    // A district map named like the city it lies in (Orgrimmar in Orgrimmar) is the same place for a reader.
    if (map.parent !== null && byId.get(map.parent)?.name === map.name) continue;
    entries.push({ words: also(map.name, alt?.maps.get(map.id)), hit: { type: "map", key: `m${map.id}`, title: map.name, context: parentName(map.parent), map } as Omit<SearchHit, "score"> });
  }
  for (const poi of bundle.pois) {
    if (poi.kind === "zone-label") continue;
    entries.push({ words: also(poi.name, alt?.pois.get(poi.id)), hit: { type: "poi", key: `p${poi.id}`, title: poi.name, context: byId.get(poi.map)?.name ?? "", poi } as Omit<SearchHit, "score"> });
  }
  for (const event of bundle.events) {
    entries.push({ words: `${also(event.title, alt?.events.get(event.id))} ${event.patch}`, hit: { type: "event", key: `e${event.id}`, title: event.title, context: event.patch, event } as Omit<SearchHit, "score"> });
  }
  const byKey = new Map(entries.map((entry) => [entry.hit.key, entry.hit]));
  const find = (query: string, limit = 8): SearchHit[] => {
    const q = normalize(query);
    if (!q) return [];
    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const entry of entries) {
      const at = entry.words.indexOf(q);
      if (at < 0) continue;
      // Whole-word starts first, then shorter names, then maps over points.
      const wordStart = at === 0 || entry.words[at - 1] === " ";
      // A match in the other language's name ranks just under one in the reader's own.
      const own = entry.words.indexOf(" | ");
      const score = (own >= 0 && at > own ? 5 : 0) + (at === 0 || (own >= 0 && at === own + 3) ? 0 : wordStart ? 10 : 30) + (own >= 0 ? own : entry.words.length) * 0.1 + (entry.hit.type === "map" ? 0 : entry.hit.type === "event" ? 1 : 2);
      const dedupe = `${entry.hit.type === "event" ? "e" : "x"}:${entry.hit.title}:${entry.hit.context}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      hits.push({ ...entry.hit, score } as SearchHit);
    }
    return hits.sort((a, b) => a.score - b.score).slice(0, limit);
  };
  /** Hits by key (recent results kept between visits). */
  const byKeys = (keys: string[]) => keys.map((key) => byKey.get(key)).filter((hit): hit is Omit<SearchHit, "score"> => Boolean(hit)).map((hit) => ({ ...hit, score: 0 }) as SearchHit);
  return Object.assign(find, { byKeys });
}
