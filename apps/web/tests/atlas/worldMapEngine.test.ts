import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildAtlasBundle, localArt, type ArtEra, type AtlasMap } from "@/lib/wow/worldMap/bundle";
import type { EraRecord, MapRecord, PoiRecord } from "@/lib/wow/worldMap/types";
import { blurGroups, blurKey, blurOf, blurRadiusCss, desatOf, dimOf, radiusOfKey, vignetteOf, featherOf, layerScale, levelFor, maskFeatherOf, maxScaleOf, terrainAlphaOf, upscaleOf } from "@/components/wow/worldMap/engine/lod";
import { chainUp, composeSet, mapSet, transferCamera } from "@/components/wow/worldMap/engine/sets";
import { wheelKind } from "@/components/wow/worldMap/engine/input";
import { blurRgb, fillBoxes, toneImage } from "@/components/wow/worldMap/engine/tone";
import { layerGroups, placeKeys } from "@/components/wow/worldMap/engine/compose";
import type { DrawnMap } from "@/components/wow/worldMap/engine/WorldMapEngine";
import { hiddenAt } from "@/components/wow/worldMap/worldMapModel";
import { eraFromParam, eventComparison, eventMoment, mapIdOfPath, patchPosition, positionToPatch, pushesHistory, queryToView, viewToQuery } from "@/components/wow/worldMap/worldMapModel";
import { isRectMask, paperColour } from "@/components/wow/worldMap/engine/paper";
import { decorBoxes, labelBoxes } from "@/lib/wow/worldMap/painted";
import { paintedOf } from "@/components/wow/worldMap/ui/paintedArt";

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../fixtures/world-map/engine.json", import.meta.url)), "utf8")) as { maps: MapRecord[]; pois: PoiRecord[]; eras: EraRecord[] };
const bundle = buildAtlasBundle({ maps: fixture.maps, pois: fixture.pois, eras: fixture.eras, events: [] }, "en");
const base = mapSet("current", bundle.maps);
const era = (id: string) => bundle.artEras.find((e) => e.id === id) as ArtEra;
const setOf = (id: string) => composeSet(id, base, [era(id)]);
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

describe("world map LOD", () => {
  it("measures magnification in CSS px per art texel", () => {
    assert.equal(upscaleOf(1000, { width: 1000 }), 1);
    assert.equal(upscaleOf(5500, { width: 1000 }), 5.5);
  });

  it("keeps maps up to 1.5× sharp and blurs, dims and greys them more the more they are magnified", () => {
    for (const u of [0.3, 1, 1.5]) assert.equal(blurOf(u), 0, `blur at ${u}`);
    assert.equal(dimOf(1.5), 0);
    let prev = 0;
    for (const u of [2, 3, 4, 4.8]) {
      const b = blurOf(u);
      assert.ok(b > prev, `blur grows at ${u}`);
      prev = b;
    }
    assert.equal(blurOf(25), 1);
    assert.ok(dimOf(25) > 0.4 && dimOf(25) <= 0.46);
    assert.ok(desatOf(25) > 0.3 && desatOf(25) <= 0.36);
    // An ancestor 10–25× magnified (a continent behind a city) is a soft backdrop, never raw texels.
    assert.ok(blurOf(10) > 0.95);
  });

  it("chooses the smallest pyramid level that is not magnified by more than 10%", () => {
    const art = { width: 1002, maxZoom: 2 };
    assert.equal(levelFor(art, 200), 0); // 251 px wide level 0
    assert.equal(levelFor(art, 300), 1); // 501
    assert.equal(levelFor(art, 600), 2);
    assert.equal(levelFor(art, 5000), 2); // never past the native size
    // Inside a blurred layer 8× smaller the same picture needs a coarser level.
    assert.equal(levelFor({ width: 3840, maxZoom: 4 }, 27000 / 8), 4);
    assert.equal(levelFor({ width: 3840, maxZoom: 4 }, 1000 / 8), 0);
  });

  it("picks an offscreen scale that leaves a small blur in the smaller picture", () => {
    assert.equal(layerScale(1), 2);
    assert.equal(layerScale(10), 4);
    assert.equal(layerScale(44), 16);
    assert.equal(layerScale(400), 64);
    for (const r of [7, 13, 20, 30]) assert.ok(r / layerScale(r) <= 3 && r / layerScale(r) >= 1.5, `radius ${r}`);
  });

  it("groups consecutive out-of-focus maps of close strength into one pass", () => {
    assert.deepEqual(blurGroups([1, 0.95, 0.4, 0.38, 0, 0.5]).map((g) => [g.from, g.to]), [[0, 1], [2, 3], [4, 4], [5, 5]]);
    const groups = blurGroups([0, 0.01]);
    assert.ok(groups.every((g) => g.blur === 0));
  });

  it("feathers a maskless map by at least 6% of its smaller side, a masked one thinly", () => {
    assert.ok(featherOf(1000, 600, 1) >= 36);
    assert.ok(featherOf(40, 30, 2) >= 12);
    assert.ok(maskFeatherOf(1000, 600, 1) < featherOf(1000, 600, 1) / 3);
  });

  it("limits zoom to twice the art's own size, deeper over terrain, and fades terrain in past the art", () => {
    close(maxScaleOf({ width: 1000 }, 0.01), 200000);
    const terrain = { art: { width: 16384 }, frame: [0, 0, 0.05, 0.05] as [number, number, number, number] };
    close(maxScaleOf({ width: 1000 }, 0.01, terrain), 16384 / 0.05 * 2);
    assert.equal(terrainAlphaOf(1), 0);
    assert.equal(terrainAlphaOf(1.3), 0);
    assert.ok(terrainAlphaOf(1.7) > 0 && terrainAlphaOf(1.7) < 1);
    assert.equal(terrainAlphaOf(2.2), 1);
  });

  it("tells a wheel notch from a trackpad scroll and a pinch", () => {
    assert.equal(wheelKind(1, 0, 3, false), "notch");
    assert.equal(wheelKind(0, 0, 100, false), "notch");
    assert.equal(wheelKind(0, 0, -120, false), "notch");
    assert.equal(wheelKind(0, 0, 4.5, false), "trackpad");
    assert.equal(wheelKind(0, 1.2, 30, false), "trackpad");
    assert.equal(wheelKind(0, 0, 3.2, true), "pinch");
  });
});

describe("world map era hierarchy", () => {
  it("carries masks and places terrain in atlas space", () => {
    const k = base.maps.get(12) as AtlasMap;
    assert.equal(base.maps.get(85)?.mask, "/maps/fixture-masks/85.webp");
    assert.ok(k.terrain);
    const w = k.frame[2] - k.frame[0], h = k.frame[3] - k.frame[1];
    close(k.terrain.frame[0], k.frame[0] - 0.1 * w);
    close(k.terrain.frame[3], k.frame[1] + 1.6 * h);
  });

  it("drops absent maps, their children and their points; an era's children list is authoritative", () => {
    const classic = setOf("classic");
    assert.ok(!classic.maps.has(10), "absent Northern Barrens");
    assert.ok(!classic.maps.has(424) && !classic.maps.has(371), "no Pandaria nor its zones");
    const kalimdor = classic.maps.get(12) as AtlasMap;
    const barrens = [...classic.maps.values()].find((m) => m.slug === "the-barrens") as AtlasMap;
    assert.ok(barrens, "era-only map");
    assert.deepEqual([...kalimdor.children].sort((a, b) => a - b), [1, 85, barrens.id].sort((a, b) => a - b));
    assert.ok(era("classic").pois?.every((p) => classic.maps.has(p.map)));
    const cata = setOf("cataclysm");
    assert.ok(!cata.maps.has(424) && !cata.maps.has(371), "absent Pandaria takes its zones with it");
    assert.ok(cata.maps.has(12) && cata.maps.has(10));
    assert.ok(!(cata.maps.get(947) as AtlasMap).children.includes(424));
  });

  it("gives every era one consistent hierarchy: each child lies inside its own era's parent", () => {
    for (const id of ["classic", "cataclysm", "midnight"]) {
      const set = setOf(id);
      const tops = [...set.maps.values()].filter((m) => m.depth === 0);
      assert.equal(tops.length, 1, `${id}: one top`);
      for (const map of set.maps.values()) {
        if (map.parent === null) continue;
        const parent = set.maps.get(map.parent);
        assert.ok(parent, `${id}: ${map.id} has its parent`);
        assert.ok(parent.children.includes(map.id), `${id}: ${map.parent} lists ${map.id}`);
        assert.equal(map.depth, parent.depth + 1);
      }
    }
    // Classic Orgrimmar hangs by Classic's own rect inside Classic's Kalimdor, not by today's.
    const classic = setOf("classic");
    const k = classic.maps.get(12) as AtlasMap, o = classic.maps.get(85) as AtlasMap;
    const w = k.frame[2] - k.frame[0], h = k.frame[3] - k.frame[1];
    close((o.frame[0] - k.frame[0]) / w, 0.56, 1e-6);
    close((o.frame[1] - k.frame[1]) / h, 0.43, 1e-6);
  });

  it("drops a map's mask when an era gives it other art without one", () => {
    assert.equal(setOf("cataclysm").maps.get(85)?.mask, undefined);
    assert.equal(setOf("classic").maps.get(85)?.mask, "/maps/fixture-masks/era-classic/85.webp");
    assert.equal(setOf("classic").maps.get(12)?.terrain, undefined, "other art: today's terrain does not fit");
    assert.ok(setOf("cataclysm").maps.get(12)?.terrain, "unchanged continent keeps its terrain");
  });

  it("anchors an era's top on the current map of the same id", () => {
    const classic = setOf("classic");
    const now = base.maps.get(947) as AtlasMap;
    const then = classic.maps.get(947) as AtlasMap;
    close(then.frame[0], now.frame[0]);
    close(then.frame[2], now.frame[2]);
  });
});

describe("world map camera across eras", () => {
  it("keeps the point and zoom relative to the deepest map both eras have", () => {
    const classic = setOf("classic");
    const a = base.maps.get(85) as AtlasMap, b = classic.maps.get(85) as AtlasMap;
    const camera = { x: a.frame[0] + 0.3 * (a.frame[2] - a.frame[0]), y: a.frame[1] + 0.7 * (a.frame[3] - a.frame[1]), scale: 5 / (a.frame[2] - a.frame[0]) };
    const moved = transferCamera(camera, base, classic, chainUp(base, 85));
    assert.ok(moved);
    close((moved.x - b.frame[0]) / (b.frame[2] - b.frame[0]), 0.3, 1e-9);
    close((moved.y - b.frame[1]) / (b.frame[3] - b.frame[1]), 0.7, 1e-9);
    close(moved.scale * (b.frame[2] - b.frame[0]), 5, 1e-9);
  });

  it("falls back to the nearest ancestor when the focused map did not exist then", () => {
    const classic = setOf("classic");
    const k0 = base.maps.get(12) as AtlasMap, k1 = classic.maps.get(12) as AtlasMap;
    const nb = base.maps.get(10) as AtlasMap;
    const camera = { x: (nb.frame[0] + nb.frame[2]) / 2, y: (nb.frame[1] + nb.frame[3]) / 2, scale: 3 / (nb.frame[2] - nb.frame[0]) };
    const moved = transferCamera(camera, base, classic, chainUp(base, 10));
    assert.ok(moved);
    close((moved.x - k1.frame[0]) / (k1.frame[2] - k1.frame[0]), (camera.x - k0.frame[0]) / (k0.frame[2] - k0.frame[0]), 1e-9);
  });

  it("returns null when nothing of the chain exists, and is exact for the same set", () => {
    const empty = mapSet("empty", []);
    assert.equal(transferCamera({ x: 0, y: 0, scale: 1 }, base, empty, chainUp(base, 85)), null);
    const camera = { x: 0.1, y: 0.2, scale: 3 };
    assert.equal(transferCamera(camera, base, base, []), camera);
  });

  it("a page's own map anchors the first era of a link even before any focus is known", () => {
    // Kalimdor?era=cataclysm: the anchor chain of the page map in the era keeps Kalimdor in view.
    const cata = setOf("cataclysm");
    const k = base.maps.get(12) as AtlasMap;
    const camera = { x: (k.frame[0] + k.frame[2]) / 2, y: (k.frame[1] + k.frame[3]) / 2, scale: 1 / (k.frame[2] - k.frame[0]) };
    const moved = transferCamera(camera, base, cata, [...chainUp(base, -1), ...chainUp(cata, 12)]);
    assert.ok(moved);
    const kc = cata.maps.get(12) as AtlasMap;
    close(moved.x, (kc.frame[0] + kc.frame[2]) / 2, 1e-9);
  });
});

describe("world map URL state", () => {
  const frame: [number, number, number, number] = [2, 1, 2.5, 1.333];
  it("round-trips the view through x, y, z", () => {
    const fit = 2000;
    const camera = { x: 2.1, y: 1.2, scale: fit * 2 ** 1.5 };
    const q = viewToQuery(camera, frame, fit, { x: 2.25, y: 1.1665 });
    assert.ok(q);
    assert.equal(q.z, 1.5);
    const back = queryToView(q, frame, fit);
    assert.ok(back);
    close(back.x, 2.1, 1e-4);
    close(back.y, 1.2, 1e-3);
    close(back.scale, camera.scale, 1e-6);
  });

  it("omits the view at the map's home and clamps silly zooms", () => {
    assert.equal(viewToQuery({ x: 2.25, y: 1.1665, scale: 2000 }, frame, 2000, { x: 2.25, y: 1.1665 }), null);
    const deep = queryToView({ x: 0.5, y: 0.5, z: 99 }, frame, 10);
    assert.ok(deep);
    assert.equal(deep.scale, 10 * 2 ** 14);
    assert.equal(queryToView({ x: Number.NaN, y: 0, z: 0 }, frame, 10), null);
  });

  it("reads the page map from a path", () => {
    assert.equal(mapIdOfPath("/ru/wow/map/85-orgrimmar", 946), 85);
    assert.equal(mapIdOfPath("/wow/map/12-kalimdor/", 946), 12);
    assert.equal(mapIdOfPath("/wow/map", 946), 946);
    assert.equal(mapIdOfPath("/ru/wow/map/", 946), 946);
    assert.equal(mapIdOfPath("/wow/raids", 946), null);
  });

  it("adds history entries for flights and level changes, not for panning to a neighbour", () => {
    assert.equal(pushesHistory(null, { mapId: 85, depth: 3 }, true), false);
    assert.equal(pushesHistory({ mapId: 12, depth: 2 }, { mapId: 12, depth: 2 }, true), false);
    assert.equal(pushesHistory({ mapId: 12, depth: 2 }, { mapId: 85, depth: 3 }, false), true);
    assert.equal(pushesHistory({ mapId: 1, depth: 3 }, { mapId: 10, depth: 3 }, false), false);
    assert.equal(pushesHistory({ mapId: 1, depth: 3 }, { mapId: 10, depth: 3 }, true), true);
  });

  it("keeps an exact timeline moment (a phase) and the compare side through the URL", () => {
    for (const pos of [0.05, 3.95, 4.089, 4.1, 4.15, 11.4]) {
      const patch = positionToPatch(pos);
      assert.ok(Math.abs(patchPosition(patch) - pos) <= 0.005 + 1e-9, `${pos} → ${patch} → ${patchPosition(patch)}`);
    }
    assert.equal(positionToPatch(4.1), "5.1.0");
    // Theramore: left just before the phase that starts at 5.1 stays before it.
    assert.ok(patchPosition(positionToPatch(4.1 - 0.011)) < 4.1);
  });
});

describe("world map round 3 data", () => {
  const art = { width: 1000, height: 666, tileSize: 256, maxZoom: 2, url: "/maps/tiles/1/{z}/{x}_{y}.webp" };

  it("draws the Russian client's picture on /ru, today's elsewhere", () => {
    const withRu = { ...art, urlRu: "/maps/tiles/ru/1/{z}/{x}_{y}.webp", namesPainted: true };
    assert.equal(localArt(withRu, "ru").url, withRu.urlRu);
    assert.equal(localArt(withRu, "ru").localized, true);
    assert.equal(localArt(withRu, "en").url, art.url);
    assert.equal(localArt(withRu, "en").localized, true);
    assert.equal(localArt(art, "ru").url, art.url);
    assert.equal(localArt(art, "ru").localized, undefined, "no RU picture: its words are not in Russian");
    assert.ok(!("urlRu" in localArt(withRu, "ru")), "the bundle carries one url");
  });

  it("stands a world the era's Cosmic has no place for apart, as its own root", () => {
    const eras: EraRecord[] = [...fixture.eras, {
      id: "warlords-of-draenor", name: { en: "Warlords", ru: "Warlords" }, expansion: "wod", patchRange: ["6.0.2", "6.2.4"], rootMapId: 946,
      source: { product: "wow", build: "6" },
      maps: { ...Object.fromEntries(fixture.maps.map((m) => [String(m.id), "unchanged" as const])), "424": { art: { ...art, url: "/maps/tiles/424/{z}/{x}_{y}.webp" }, parentId: null, rectInParent: null } },
    }];
    const b = buildAtlasBundle({ maps: fixture.maps, pois: fixture.pois, eras, events: [] }, "en");
    const wod = composeSet("wod", mapSet("current", b.maps), [b.artEras.find((e) => e.id === "warlords-of-draenor") as ArtEra]);
    const alone = wod.maps.get(424) as AtlasMap;
    assert.ok(alone, "kept");
    assert.equal(alone.depth, 0);
    assert.equal(alone.parent, null);
    const cosmic = wod.maps.get(946) as AtlasMap;
    assert.ok(alone.frame[0] > cosmic.frame[2], "laid out apart, not on today's Cosmic");
    assert.ok(!(wod.maps.get(947) as AtlasMap).children.includes(424));
    assert.ok(wod.maps.has(371), "its zones come along");
  });

  it("reads ?era= as a timeline id, an art era id or an older art era id", () => {
    const eras = [
      { id: "wod", name: "WoD", expansion: "wod", range: ["6.0.2", "6.2.4"] as [string, string] },
      { id: "legion", name: "Legion", expansion: "legion", range: ["7.0.3", "7.3.5"] as [string, string] },
    ];
    const art = [{ id: "warlords-of-draenor", name: "WoD", range: ["6.0.2", "6.2.4"] as [string, string], changed: [] }, { id: "legion", name: "Legion", range: ["7.0.3", "7.3.5"] as [string, string], changed: [] }];
    assert.equal(eraFromParam("wod", eras, art)?.id, "wod");
    assert.equal(eraFromParam("warlords-of-draenor", eras, art)?.id, "wod");
    assert.equal(eraFromParam("warlords-legion", eras, art)?.id, "wod");
    assert.equal(eraFromParam("nonsense", eras, art), undefined);
    assert.equal(eraFromParam(null, eras, art), undefined);
  });

  it("tells a soft-rectangle mask from a place's shape and finds the bare sheet's colour", () => {
    const w = 40, h = 30;
    const rect = Array.from({ length: w * h }, (_, i) => { const x = i % w, y = (i / w) | 0; const e = Math.min(x, w - 1 - x, y, h - 1 - y); return Math.min(1, e / 3); });
    assert.equal(isRectMask(rect, w, h), true);
    const shape = rect.map((v, i) => ((i % w) > w * 0.6 ? 0 : v));
    assert.equal(isRectMask(shape, w, h), false);
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { px.set([200, 170, 120, 255], i * 4); }
    for (let y = 10; y < 20; y++) for (let x = 12; x < 28; x++) px.set([90, 40, 30, 255], (y * w + x) * 4);
    const paper = paperColour(px, w, h);
    assert.ok(paper);
    assert.deepEqual(paper.map((v) => Math.round(v * 255)), [200, 170, 120]);
  });

  it("takes the painted words from the data, the hand table where the data has none", () => {
    const map = (url: string, extra: Partial<AtlasMap["art"] & object> = {}, type: AtlasMap["type"] = "zone") =>
      ({ id: 1, slug: "x", type, name: "x", parent: null, children: [], box: [0, 0, 1, 1], frame: [0, 0, 1, 1], art: { ...art, url, ...extra }, depth: 1, page: true, portal: false }) as AtlasMap;
    const zone = paintedOf(map("/maps/tiles/ru/1/{z}/{x}_{y}.webp", { namesPainted: true, paintedLabels: [[0.1, 0.1, 0.2, 0.15]] }));
    assert.deepEqual(zone, { titles: [[0.1, 0.1, 0.2, 0.15]], names: true });
    // Kalimdor's painted words are its title and seas: the table says its zones are not named there.
    const kalimdor = paintedOf(map("/maps/tiles/ru/12/{z}/{x}_{y}.webp", { namesPainted: true, paintedLabels: [[0.4, 0.45, 0.6, 0.5]] }, "continent"));
    assert.equal(kalimdor?.names, false);
    assert.equal(paintedOf(map("/maps/tiles/101/{z}/{x}_{y}.webp"))?.names, true, "table fallback");
    assert.equal(paintedOf(map("/maps/tiles/9999/{z}/{x}_{y}.webp")), null);
  });
});

describe("world map events across phases", () => {
  const eras = [
    { id: "cataclysm", name: "Cata", expansion: "cataclysm", range: ["4.0.1", "4.3.4"] as [string, string] },
    { id: "mop", name: "MoP", expansion: "mop", range: ["5.0.4", "5.4.8"] as [string, string] },
  ];
  const art = [
    { id: "cataclysm", name: "Cata", range: ["4.0.1", "4.3.4"] as [string, string], changed: [] },
    { id: "cataclysm-pandaria", name: "MoP", range: ["5.0.4", "5.4.8"] as [string, string], changed: [] },
    { id: "theramore-fall", name: "Fall of Theramore", range: ["5.1.0", "5.4.8"] as [string, string], inherits: "cataclysm-pandaria", changed: [70] },
  ];
  const theramore = { patch: "5.0.4", map: 70, changed: [70], before: "cataclysm" };

  it("compares the city just before its fall with its ruins, not two pictures of it standing", () => {
    const pair = eventComparison(theramore, art, eras);
    assert.ok(pair);
    assert.equal(pair.right, patchPosition("5.1.0"));
    assert.ok(pair.left < patchPosition("5.1.0") && pair.left >= patchPosition("5.0.4"), "left: the Mists picture with Theramore standing");
  });

  it("takes a phase that starts with the event's own patch (no fixed later patch)", () => {
    const same = art.map((a) => (a.id === "theramore-fall" ? { ...a, range: ["5.0.4", "5.4.8"] as [string, string] } : a));
    const pair = eventComparison(theramore, same, eras);
    assert.ok(pair);
    assert.equal(pair.right, patchPosition("5.0.4"));
    assert.equal(positionToPatch(pair.left), "5.0.3");
    assert.equal(eventMoment(theramore, same), patchPosition("5.0.4"));
  });

  it("opens an event on the moment that shows its result", () => {
    assert.equal(eventMoment(theramore, art), patchPosition("5.1.0"));
    assert.equal(eventMoment({ patch: "4.0.3", map: 12, changed: [] }, art), patchPosition("4.0.3"));
  });

  it("falls back to the change of client picture at the patch, then to the era before", () => {
    const pair = eventComparison({ patch: "5.0.4", map: 12, changed: [] }, art, eras);
    assert.ok(pair);
    assert.ok(pair.left < patchPosition("5.0.4") && pair.right === patchPosition("5.0.4"));
    assert.equal(eventComparison({ patch: "5.2.0", map: 12, changed: [] }, art, eras), null);
  });
});

describe("world map depth backdrop and painted boxes", () => {
  it("blurs a far magnified backdrop wider than its magnified texels, up to a calm wash", () => {
    assert.equal(blurRadiusCss(0, 30), 0);
    for (const u of [6, 10, 20]) assert.ok(blurRadiusCss(blurOf(u), u) >= u * 7, `radius at ${u}×`);
    assert.equal(blurRadiusCss(1, 80), 200, "capped");
    assert.ok(vignetteOf(1.5) === 0 && vignetteOf(12) > 0.25);
  });

  it("groups blurs by radius and gets the radius back", () => {
    for (const r of [4, 30, 120]) assert.ok(Math.abs(radiusOfKey(blurKey(r)) - r) < 1e-6);
    assert.equal(blurKey(0), 0);
    const groups = blurGroups([blurKey(100), blurKey(120), blurKey(8), 0]);
    assert.deepEqual(groups.map((g) => [g.from, g.to]), [[0, 1], [2, 2], [3, 3]]);
  });

  it("reads painted words and decor as boxes or objects naming the map they label", () => {
    assert.deepEqual(labelBoxes({ paintedLabels: [[0.1, 0.1, 0.2, 0.2]] }), [{ box: [0.1, 0.1, 0.2, 0.2] }]);
    assert.deepEqual(labelBoxes({ paintedLabels: [{ box: [0.1, 0.1, 0.2, 0.2], labelFor: 84 }, { rect: [0, 0, 1, 1], labelFor: "85" }, { box: [0.5, 0.5, 0.4, 0.6] }] as never }),
      [{ box: [0.1, 0.1, 0.2, 0.2], for: 84 }, { box: [0, 0, 1, 1], for: 85 }]);
    assert.deepEqual(decorBoxes({ decor: [[0.9, 0.9, 1, 1]] }), [{ box: [0.9, 0.9, 1, 1] }]);
    // r5 data: the plaque (word with its banner) and a patch of the ground under it; era-only targets stay unbound.
    assert.deepEqual(labelBoxes({ paintedLabels: [{ box: [0.2, 0.2, 0.3, 0.25], plaque: [0.15, 0.18, 0.35, 0.27], labelFor: 84, patch: "/maps/patches/x/1.webp" }, { box: [0.1, 0.1, 0.2, 0.2], plaque: [0.1, 0.1, 0.2, 0.2], labelFor: "classic-1416" }] as never }),
      [{ box: [0.2, 0.2, 0.3, 0.25], for: 84, plaque: [0.15, 0.18, 0.35, 0.27], patch: "/maps/patches/x/1.webp" }, { box: [0.1, 0.1, 0.2, 0.2], plaque: [0.1, 0.1, 0.2, 0.2] }]);
    assert.deepEqual(decorBoxes({ decor: [{ box: [0, 0, 0.2, 0.3], kind: "crest" }] }), [{ box: [0, 0, 0.2, 0.3], kind: "crest" }]);
    assert.deepEqual(decorBoxes({}), []);
  });
});

describe("world map backdrop (tone)", () => {
  const picture = (w: number, h: number, paint: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = paint(x, y); data.set([r, g, b, 255], (y * w + x) * 4); }
    return data;
  };
  it("fills a word's box from the ground around it", () => {
    // Green ground with a black word in the middle.
    const w = 64, h = 40;
    const data = picture(w, h, (x, y) => (x >= 20 && x < 44 && y >= 16 && y < 24 ? [0, 0, 0] : [40, 160, 60]));
    fillBoxes(data, w, h, [[20 / w, 16 / h, 44 / w, 24 / h]]);
    for (let y = 16; y < 24; y++) for (let x = 20; x < 44; x++) {
      const i = (y * w + x) * 4;
      assert.deepEqual([data[i], data[i + 1], data[i + 2]], [40, 160, 60]);
    }
  });
  it("blends the fill between different grounds and leaves the rest as it was", () => {
    const w = 32, h = 32;
    const data = picture(w, h, (x) => (x < 16 ? [200, 0, 0] : [0, 0, 200]));
    const before = data.slice();
    fillBoxes(data, w, h, [[12 / w, 12 / h, 20 / w, 20 / h]], 0);
    const at = (x: number, y: number) => data[(y * w + x) * 4];
    assert.equal(at(2, 2), before[(2 * w + 2) * 4]);
    assert.ok(at(12, 16) > at(19, 16), "the red side stays redder");
    for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255);
  });
  it("washes out fine stripes (a magnified sea's lines) and keeps the average colour", () => {
    const w = 64, h = 64;
    const data = picture(w, h, (_x, y) => (y % 2 ? [0, 0, 0] : [200, 200, 200]));
    blurRgb(data, w, h, 2);
    const row = (y: number) => data[(y * w + 32) * 4];
    assert.ok(Math.abs(row(31) - row(32)) < 12, "no stripes left");
    assert.ok(Math.abs(row(32) - 100) < 12);
  });
  it("without word boxes washes out much more", () => {
    const w = 100, h = 60;
    const word = (x: number, y: number): [number, number, number] => (x >= 40 && x < 60 && y >= 25 && y < 35 ? [0, 0, 0] : [180, 180, 180]);
    const blind = picture(w, h, word), known = picture(w, h, word);
    toneImage(blind, w, h, null);
    toneImage(known, w, h, [[0.4, 25 / 60, 0.6, 35 / 60]]);
    const centre = (data: Uint8ClampedArray) => data[(30 * w + 50) * 4];
    assert.ok(centre(known) > 170, "the word is gone where its box is known");
    assert.ok(centre(blind) > 60, "an unknown word is washed out into the ground");
  });
});

describe("world map composition rules", () => {
  const drawn = (role: DrawnMap["role"]) => ({ role } as DrawnMap);
  it("gathers sharp neighbours (and the children of the map in view) into one flat layer each", () => {
    const list = [drawn("ancestor"), drawn("neighbour"), drawn("neighbour"), drawn("neighbour"), drawn("focus"), drawn("child"), drawn("child")];
    const groups = layerGroups(list.map((_, i) => ({ from: i, to: i, blur: 0 })), list);
    assert.deepEqual(groups, [
      { from: 0, to: 0, blur: 0 }, { from: 1, to: 3, blur: 0, flat: true }, { from: 4, to: 4, blur: 0 }, { from: 5, to: 6, blur: 0, flat: true },
    ]);
  });
  it("never shares a blurred layer between a backdrop and the maps over it", () => {
    const list = [drawn("ancestor"), drawn("ancestor"), drawn("neighbour"), drawn("neighbour")];
    assert.deepEqual(layerGroups([{ from: 0, to: 3, blur: 0.3 }], list), [{ from: 0, to: 1, blur: 0.3 }, { from: 2, to: 3, blur: 0.3 }]);
  });
  it("a lone neighbour needs no layer", () => {
    const list = [drawn("ancestor"), drawn("neighbour"), drawn("focus")];
    assert.deepEqual(layerGroups(list.map((_, i) => ({ from: i, to: i, blur: 0 })), list).map((g) => Boolean(g.flat)), [false, false, false]);
  });
  it("knows two pictures of one place by name or by the data's samePlace link", () => {
    const map = (id: number, name: string, samePlace?: number) => ({ id, name, depth: 3, ...(samePlace ? { samePlace } : {}) } as AtlasMap);
    const shared = (a: AtlasMap, b: AtlasMap) => placeKeys(a).some((key) => placeKeys(b).includes(key));
    assert.ok(shared(map(249, "Uldum"), map(1527, "Uldum")));
    assert.ok(shared(map(390, "Vale of Eternal Blossoms"), map(1530, "Vale (N'Zoth)", 390)));
    assert.ok(!shared(map(1, "Durotar"), map(10, "Northern Barrens")));
    assert.deepEqual(placeKeys({ id: 947, name: "Azeroth", depth: 0 } as AtlasMap), []);
  });
});

describe("one picture per place on the timeline", () => {
  const vale = { id: 390 }, nzoth = { id: 1530, samePlace: 390, placeRole: "phase" as const, activeFrom: "8.3.0", activeTo: "8.3.7" };
  const eversong = { id: 94, samePlace: 2395, placeRole: "predecessor" as const, activeTo: "11.2.7" };
  const midnight = { id: 2395, samePlace: 94, placeRole: "successor" as const, activeFrom: "12.0.0" };
  const maps = [vale, nzoth, eversong, midnight];
  it("a phase stands for its place only in its own patches", () => {
    assert.deepEqual([...hiddenAt(maps, [], 7.25)].sort(), [1530, 2395]);
    const assault = hiddenAt(maps, [], 7.33);
    assert.ok(assault.has(390) && !assault.has(1530));
  });
  it("Midnight's pictures replace the old ones; the era's own list counts too", () => {
    const now = hiddenAt(maps, [94, 1530, 4], 11.05);
    assert.ok(now.has(94) && now.has(1530) && now.has(4) && !now.has(2395) && !now.has(390));
  });
  it("the page's own map always shows", () => {
    assert.ok(!hiddenAt(maps, [94], 11.05, 94).has(94));
  });
});
