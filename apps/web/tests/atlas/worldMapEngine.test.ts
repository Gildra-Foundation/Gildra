import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { buildAtlasBundle, type ArtEra, type AtlasMap } from "@/lib/wow/worldMap/bundle";
import type { EraRecord, MapRecord, PoiRecord } from "@/lib/wow/worldMap/types";
import { blurGroups, blurOf, desatOf, dimOf, featherOf, layerScale, levelFor, maskFeatherOf, maxScaleOf, terrainAlphaOf, upscaleOf } from "@/components/wow/worldMap/engine/lod";
import { chainUp, composeSet, mapSet, transferCamera } from "@/components/wow/worldMap/engine/sets";
import { wheelKind } from "@/components/wow/worldMap/engine/input";
import { mapIdOfPath, patchPosition, positionToPatch, pushesHistory, queryToView, viewToQuery } from "@/components/wow/worldMap/worldMapModel";

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
    assert.ok(dimOf(25) > 0.3 && dimOf(25) <= 0.34);
    assert.ok(desatOf(25) > 0.25 && desatOf(25) <= 0.3);
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
    assert.equal(layerScale(400), 16);
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
