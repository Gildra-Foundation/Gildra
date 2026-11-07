import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AtlasBundle, AtlasEvent, AtlasMap, AtlasPoi } from "../../lib/wow/worldMap/bundle.ts";
import type { FrameInfo } from "../../components/wow/worldMap/engine/WorldMapEngine.ts";
import { DEFAULT_LAYERS, indexMarkers, pickMarkers } from "../../components/wow/worldMap/mapMarkers.ts";
import { altNames, buildSearch } from "../../components/wow/worldMap/mapSearch.ts";
import { groupRunes, RUNE_GAP } from "../../components/wow/worldMap/ui/timelineRunes.ts";
import { paintedBoxes, paintedOf } from "../../components/wow/worldMap/ui/paintedArt.ts";
import { placeFacts } from "../../components/wow/worldMap/ui/placeFacts.ts";
import { measureInsets } from "../../components/wow/worldMap/ui/layout.ts";

/** A small world: Kalimdor (its real art URL: the painted title is known), Durotar in it, Orgrimmar in Durotar. */
const art = (id: number) => ({ width: 1002, height: 668, tileSize: 256, maxZoom: 2, url: `/maps/tiles/${id}/{z}/{x}_{y}.webp` });
const map = (id: number, type: AtlasMap["type"], name: string, parent: number | null, box: [number, number, number, number], children: number[] = []): AtlasMap => ({
  id, slug: name.toLowerCase(), type, name, parent, children, box, frame: box, art: art(id), depth: parent === null ? 0 : 1, page: true, portal: false,
});
const kalimdor = map(12, "continent", "Kalimdor", null, [0, 0, 1, 2 / 3], [1]);
const durotar = map(1, "zone", "Durotar", 12, [0.6, 0.3, 0.7, 0.37], [85]);
const orgrimmar = map(85, "zone", "Orgrimmar", 1, [0.62, 0.3, 0.66, 0.33]);
const poi = (id: string, mapId: number, kind: AtlasPoi["kind"], name: string, x: number, y: number, extra: Partial<AtlasPoi> = {}): AtlasPoi => ({ id, map: mapId, kind, name, x, y, ...extra });
const event = (id: string, patch: string, mapId: number | null, extra: Partial<AtlasEvent> = {}): AtlasEvent => ({ id, era: "cataclysm", patch, title: id, summary: "", map: mapId, x: 0.5, y: 0.5, links: [], ...extra });

/** A frame where the map fills a 1500 × 1000 screen, 1 atlas unit = 1500 px. */
function frame(maps: AtlasMap[]): { info: FrameInfo; project: (x: number, y: number) => [number, number] } {
  const project = (x: number, y: number): [number, number] => [x * 1500, y * 1500];
  return {
    project,
    info: {
      camera: { x: 0.5, y: 1 / 3, scale: 1500 }, width: 1500, height: 1000, focus: maps[0], moving: false, time: 0,
      drawn: maps.map((m) => ({ map: m, alpha: 1, screen: [m.frame[0] * 1500, m.frame[1] * 1500, m.frame[2] * 1500, m.frame[3] * 1500], clip: m.frame, upscale: 1, blur: 0 })),
    },
  };
}

describe("world map labels", () => {
  it("knows the painted words of the current continent art, not of other pictures", () => {
    assert.ok(paintedOf(kalimdor));
    assert.equal(paintedOf({ ...kalimdor, art: { ...art(12), url: "/maps/tiles/era/classic/12/{z}/{x}_{y}.webp" } }), null);
    const [title] = paintedBoxes(kalimdor);
    // The painted KALIMDOR sits in the middle of the art, left of Durotar.
    assert.ok(title[0] > 0.3 && title[2] < 0.65 && title[1] > 0.25 && title[3] < 0.4);
  });

  it("keeps names off the painted continent title and off each other", () => {
    const [x0, y0, x1, y1] = paintedBoxes(kalimdor)[0];
    const h = 2 / 3;
    // In the middle of the painted title: every side would cover it, the name waits for hover.
    const onTitle = poi("on", 12, "capital", "Orgrimmar", (x0 + x1) / 2 + 0.02, (y0 + y1) / 2 / h);
    // Just above the title: its name goes anywhere but down onto the title.
    const above = poi("above", 12, "city", "Astranaar", x0 + 0.02, (y0 - 0.012) / h);
    // A city close under another: the lower-priority one gives way where they would overlap.
    const a = poi("a", 12, "capital", "Darnassus", 0.2, 0.1 / h), b = poi("b", 12, "city", "Rut'theran", 0.2 + 0.004, (0.1 + 0.012) / h);
    const index = indexMarkers({ maps: [kalimdor], pois: [onTitle, above, a, b], events: [] });
    const { info, project } = frame([kalimdor]);
    const placed = pickMarkers(info, index, DEFAULT_LAYERS, null, project, (m) => m.art, "en");
    const by = (key: string) => placed.find((m) => m.key === key);
    const on = by("pon");
    assert.ok(on && on.type === "poi" && !on.showLabel);
    const up = by("pabove");
    assert.ok(up && up.type === "poi" && up.showLabel && up.side !== "below", JSON.stringify(up && up.type === "poi" ? up.side : null));
    assert.ok(by("pa"));
    assert.equal(by("pb"), undefined);
  });

  it("shows fewer markers on a small screen", () => {
    const pois = Array.from({ length: 300 }, (_, i) => poi(`f${i}`, 12, "flight", `F${i}`, (i % 20) / 20 + 0.02, Math.floor(i / 20) / 15 + 0.02));
    const index = indexMarkers({ maps: [kalimdor], pois, events: [] });
    const { info, project } = frame([kalimdor]);
    const big = pickMarkers(info, index, DEFAULT_LAYERS, null, project, (m) => m.art).length;
    const small = pickMarkers({ ...info, width: 390, height: 500 }, index, DEFAULT_LAYERS, null, project, (m) => m.art).length;
    assert.ok(small <= 30 && small < big, `${small} < ${big}`);
  });
});

describe("world map search", () => {
  const bundle = { lang: "ru", maps: [kalimdor, { ...durotar, name: "Дуротар" }, { ...orgrimmar, name: "Оргриммар" }], pois: [poi("d1", 1, "dungeon", "Огненная Пропасть", 0.5, 0.5, { href: "/wow/x" })], eras: [], art: [], events: [event("shatter", "4.0.3a", 12, { title: "Катаклизм" })] } as unknown as AtlasBundle;
  const other = { maps: [kalimdor, durotar, orgrimmar], pois: [poi("d1", 1, "dungeon", "Ragefire Chasm", 0.5, 0.5)], events: [event("shatter", "4.0.3a", 12, { title: "The Shattering" })] };

  it("finds places and events by their name in the other language", () => {
    const search = buildSearch(bundle, altNames(other));
    assert.equal(search("orgrim")[0]?.title, "Оргриммар");
    assert.equal(search("ragefire")[0]?.title, "Огненная Пропасть");
    assert.equal(search("shattering")[0]?.title, "Катаклизм");
    // The reader's own spelling first.
    assert.equal(search("Дуро")[0]?.title, "Дуротар");
  });

  it("returns recent results by key, skipping ones that are gone", () => {
    const search = buildSearch(bundle);
    assert.deepEqual(search.byKeys(["m85", "nope", "e" + "shatter"]).map((hit) => hit.title), ["Оргриммар", "Катаклизм"]);
  });
});

describe("world map place panel", () => {
  it("lists the instances of a zone and its cities once per page, raids first, and the events there", () => {
    const byId = new Map([kalimdor, durotar, orgrimmar].map((m) => [m.id, m]));
    const pois = new Map<number, AtlasPoi[]>([
      [1, [poi("a", 1, "dungeon", "Zeta", 0.1, 0.1, { href: "/wow/a" }), poi("flight", 1, "flight", "Razor Hill", 0.3, 0.3)]],
      [85, [poi("b", 85, "raid", "Alpha", 0.2, 0.2, { href: "/wow/b" }), poi("b2", 85, "raid", "Alpha (back door)", 0.4, 0.4, { href: "/wow/b" }), poi("c", 85, "dungeon", "No page", 0.5, 0.5)]],
    ]);
    const events = [event("in-org", "4.0.3a", 85), event("on-kal", "4.0.3a", 12), event("changed", "5.0.4", 12, { changed: [1] })];
    const facts = placeFacts(durotar, byId, pois, events);
    assert.deepEqual(facts.instances.map((p) => p.name), ["Alpha", "Zeta"]);
    assert.deepEqual(facts.events.map((e) => e.id), ["in-org", "changed"]);
    // A continent lists only its own points, not every zone's.
    assert.deepEqual(placeFacts(kalimdor, byId, pois, events).instances, []);
  });
});

describe("world map timeline runes", () => {
  it("joins events closer than one rune on screen, so no two hit areas overlap", () => {
    const list = [event("a", "3.0.2", 1), event("b", "3.0.2", 1), event("c", "3.3.0", 1), event("d", "4.0.3a", 1), event("e", "4.0.3a", 1)];
    const wide = groupRunes(list, 1200);
    assert.deepEqual(wide.map((g) => g.map((e) => e.id)), [["a", "b"], ["c"], ["d", "e"]]);
    const narrow = groupRunes(list, 300);
    const px = (g: AtlasEvent[]) => g[0];
    assert.ok(narrow.length < wide.length);
    for (let i = 1; i < narrow.length; i++) assert.notEqual(px(narrow[i]).id, px(narrow[i - 1]).id);
    assert.ok(RUNE_GAP >= 16);
  });
});

describe("world map layout", () => {
  const rect = (x: number, y: number, w: number, h: number) => ({ getBoundingClientRect: () => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h }), lastElementChild: null, firstElementChild: null }) as unknown as HTMLElement;
  it("keeps the map clear of the title column, the tools and the dock on wide screens", () => {
    const insets = measureInsets(rect(0, 100, 1440, 700), rect(24, 116, 340, 300), rect(400, 700, 900, 80), rect(1370, 116, 46, 250));
    assert.deepEqual(insets, { top: 0, right: 78, bottom: 108, left: 376 });
  });
  it("keeps the map under the header on phones", () => {
    const insets = measureInsets(rect(0, 90, 390, 700), rect(0, 90, 390, 150), rect(0, 700, 390, 90), null);
    assert.equal(insets.top, 158);
    assert.equal(insets.left, 0);
    assert.equal(insets.bottom, 98);
  });
});
