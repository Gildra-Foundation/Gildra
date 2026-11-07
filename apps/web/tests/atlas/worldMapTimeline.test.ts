import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { raidRouteSlugs } from "../../lib/data/wow/raid/midnightRaidData.ts";
import { dungeonRoutes } from "../../lib/data/wow/mythic/dungeonRoutes.ts";

type Text = { en: string; ru: string };
type TimelineEvent = {
  id: string; eraId: string; patch: string; year: number; kind: string;
  title: Text; summary: Text; mapId: number; x: number; y: number;
  beforeEraId?: string; afterEraId?: string; changedMapIds?: number[]; links?: string[];
};
type EraMeta = {
  id: string; name: Text; expansion: string; patchRange: { from: string; to: string | null };
  years: { from: number; to: number | null }; accent: string; emblem: Text;
};

const dataDir = new URL("../../data/wow/map/", import.meta.url);
const read = <T,>(name: string): T => JSON.parse(readFileSync(new URL(name, dataDir), "utf8")) as T;
const events = read<TimelineEvent[]>("events.json");
const eras = read<EraMeta[]>("eras-meta.json");

const ERA_ORDER = ["vanilla", "tbc", "wrath", "cataclysm", "mop", "wod", "legion", "bfa", "shadowlands", "dragonflight", "tww", "midnight"];
const KINDS = new Set(["reshape", "reveal", "battle", "invasion", "instance"]);
const eraIndex = (id: string) => ERA_ORDER.indexOf(id);
const patchParts = (patch: string) => patch.split(".").map((part) => Number.parseInt(part, 10));
const comparePatch = (a: string, b: string) => {
  const [pa, pb] = [patchParts(a), patchParts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return a.localeCompare(b);
};

// A link is a locale-free site path; it must render in both languages.
const raidSlugs = new Set<string>([...raidRouteSlugs]);
const dungeonSlugs = new Set(Object.keys(dungeonRoutes));
function routeExists(path: string, tree: "(site)" | "ru"): boolean {
  if (existsSync(new URL(`../../app/${tree}${path}/page.tsx`, import.meta.url))) return true;
  const raid = /^\/wow\/raids\/([a-z0-9-]+)$/.exec(path);
  if (raid) return raidSlugs.has(raid[1]) && existsSync(new URL(`../../app/${tree}/wow/raids/[raid]/page.tsx`, import.meta.url));
  const dungeon = /^\/wow\/mythic-plus\/midnight-season-2\/([a-z0-9-]+)$/.exec(path);
  if (dungeon) return dungeonSlugs.has(dungeon[1]) && existsSync(new URL(`../../app/${tree}/wow/mythic-plus/[season]/[dungeon]/page.tsx`, import.meta.url));
  return false;
}

describe("world map eras", () => {
  it("lists every era once, in release order", () => {
    assert.deepEqual(eras.map((era) => era.id), ERA_ORDER);
  });
  for (const era of eras) {
    it(`${era.id}: names, patch range, years and accent are well formed`, () => {
      assert.ok(era.name.en.trim() && era.name.ru.trim() && era.expansion.trim());
      assert.ok(era.emblem.en.trim() && /[а-яё]/i.test(era.emblem.ru));
      assert.match(era.accent, /^#[0-9a-f]{6}$/);
      assert.equal(patchParts(era.patchRange.from)[0], eraIndex(era.id) + 1);
      if (era.patchRange.to !== null) assert.equal(patchParts(era.patchRange.to)[0], eraIndex(era.id) + 1);
      if (era.years.to !== null) assert.ok(era.years.to >= era.years.from);
    });
  }
  it("eras follow each other without gaps in years", () => {
    for (let i = 1; i < eras.length; i += 1) assert.equal(eras[i].years.from, eras[i - 1].years.to, eras[i].id);
    assert.equal(eras.at(-1)?.years.to, null);
  });
});

describe("world map timeline events", () => {
  it("has unique kebab-case ids", () => {
    const ids = events.map((event) => event.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of ids) assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it("is ordered along the timeline by patch", () => {
    for (let i = 1; i < events.length; i += 1) assert.ok(comparePatch(events[i - 1].patch, events[i].patch) <= 0, `${events[i - 1].id} → ${events[i].id}`);
  });
  it("covers every era from Classic to Midnight", () => {
    for (const era of ERA_ORDER) assert.ok(events.some((event) => event.eraId === era), era);
  });
  for (const event of events) {
    it(`${event.id}: era, patch, position and texts are valid`, () => {
      assert.ok(eraIndex(event.eraId) >= 0, event.eraId);
      assert.match(event.patch, /^\d+\.\d+\.\d+[a-z]?$/);
      assert.equal(patchParts(event.patch)[0], eraIndex(event.eraId) + 1, "patch major matches the era");
      const era = eras[eraIndex(event.eraId)];
      assert.ok(event.year >= era.years.from && (era.years.to === null || event.year <= era.years.to), `year ${event.year}`);
      assert.ok(KINDS.has(event.kind), event.kind);
      assert.ok(Number.isInteger(event.mapId) && event.mapId > 0);
      for (const v of [event.x, event.y]) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `coordinate ${v}`);
      for (const text of [event.title, event.summary]) {
        assert.ok(text.en.trim() && text.ru.trim());
        assert.ok(!/[а-яё]/i.test(text.en), "English text has no Cyrillic");
        assert.ok(/[а-яё]/i.test(text.ru), "Russian text is in Russian");
      }
      for (const summary of [event.summary.en, event.summary.ru]) {
        assert.ok(summary.length <= 240, `summary length ${summary.length}`);
        assert.ok((summary.match(/[.!?](\s|$)/g) ?? []).length <= 2, "one or two sentences");
        assert.doesNotMatch(summary, /wowpedia|warcraft\.wiki|wowhead|patch notes|source|источник|данн(ые|ых)/i);
      }
    });
    if (event.beforeEraId || event.afterEraId) {
      it(`${event.id}: before/after eras bracket the change`, () => {
        assert.ok(event.beforeEraId && event.afterEraId, "both sides of the comparison are set");
        assert.ok(eraIndex(event.beforeEraId) >= 0 && eraIndex(event.afterEraId) >= 0);
        assert.ok(eraIndex(event.beforeEraId) < eraIndex(event.afterEraId));
        assert.ok(eraIndex(event.afterEraId) >= eraIndex(event.eraId));
      });
    }
    if (event.changedMapIds) {
      it(`${event.id}: changed maps are UiMap ids`, () => {
        assert.ok(event.changedMapIds?.length);
        for (const id of event.changedMapIds ?? []) assert.ok(Number.isInteger(id) && id > 0);
      });
    }
    if (event.links) {
      it(`${event.id}: links open existing pages in both languages`, () => {
        for (const link of event.links ?? []) {
          assert.match(link, /^\/wow\//);
          assert.ok(routeExists(link, "(site)"), `en ${link}`);
          assert.ok(routeExists(link, "ru"), `ru ${link}`);
        }
      });
    }
  }
});

// maps.json comes from the map data session; once it exists every event must point at a map in it.
const mapsFile = new URL("maps.json", dataDir);
describe("world map timeline against maps.json", { skip: !existsSync(mapsFile) && "maps.json not present yet" }, () => {
  it("every event and changed map is a known UiMap", () => {
    const maps = JSON.parse(readFileSync(mapsFile, "utf8")) as { id: number }[];
    const known = new Set(maps.map((map) => map.id));
    const missing = events.flatMap((event) => [event.mapId].filter((id) => !known.has(id)).map((id) => `${event.id}:${id}`));
    assert.deepEqual(missing, []);
  });
});
