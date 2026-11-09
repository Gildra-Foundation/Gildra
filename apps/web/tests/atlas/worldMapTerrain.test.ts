import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, it } from "node:test";

const web = fileURLToPath(new URL("../../", import.meta.url));
const load = (name: string) => JSON.parse(readFileSync(join(web, "data/wow/map", name), "utf8"));
const maps = load("maps.json");
const eras = load("eras.json");

describe("native terrain data", () => {
  it("uses pre-Cataclysm terrain for all three early eras", () => {
    for (const id of ["classic", "burning-crusade", "wrath-of-the-lich-king"]) {
      const era = eras.find((e: { id: string }) => e.id === id);
      for (const map of ["12", "13"]) {
        assert.match(era.maps[map].terrain.url, /^\/maps\/terrain\/classic\//);
      }
    }
    for (const id of ["burning-crusade", "wrath-of-the-lich-king", "cataclysm", "cataclysm-pandaria", "warlords-of-draenor", "legion"]) {
      const era = eras.find((e: { id: string }) => e.id === id);
      for (const map of ["94", "95", "97", "101", "106"]) assert.match(era.maps[map].terrain.url, /\/tbc\//, `${id} ${map}`);
    }
    assert.match(eras.find((e: { id: string }) => e.id === "wrath-of-the-lich-king").maps["113"].terrain.url, /\/wrath\//);
  });
  it("indexes each sparse tile or declares it empty without overlap", () => {
    const terrains = [...maps.map((m: { terrain?: object }) => m.terrain), ...eras.flatMap((e: { maps: object }) => Object.values(e.maps).map((m) => m.terrain))].filter(Boolean);
    const seen = new Set();
    for (const t of terrains) {
      if (seen.has(t.index)) continue;
      seen.add(t.index);
      const present = JSON.parse(readFileSync(join(web, "public", t.index), "utf8"));
      if (!t.empty) continue; // Earlier generated continents remain supported.
      assert.match(t.ocean, /^#[0-9a-f]{6}$/i);
      const empty = JSON.parse(readFileSync(join(web, "public", t.empty), "utf8"));
      for (let z = 0; z <= t.maxZoom; z++) {
        const scale = 2 ** (t.maxZoom - z);
        const nx = Math.ceil(t.width / 256 / scale), ny = Math.ceil(t.height / 256 / scale);
        const all = [...present[z], ...empty[z]];
        assert.equal(new Set(all).size, nx * ny, `${t.index} z${z} full extent`);
        assert.equal(all.length, nx * ny, `${t.index} z${z} disjoint`);
        for (const tile of present[z]) assert.ok(existsSync(join(web, "public", t.url.replace("{z}", String(z)).replace("{x}_{y}", tile))));
        for (const tile of all) {
          const [x, y] = tile.split("_").map(Number);
          assert.ok(x >= 0 && x < nx && y >= 0 && y < ny);
        }
      }
    }
    assert.ok(seen.size > 15);
  });
  it("places the separate-instance zones on their own sources", () => {
    for (const id of [572, 1525, 1533, 1970, 2248, 2133]) assert.ok(maps.find((m: { id: number }) => m.id === id).terrain);
    const rev = maps.find((m: { id: number }) => m.id === 1525).terrain;
    const bas = maps.find((m: { id: number }) => m.id === 1533).terrain;
    assert.equal(rev.url, bas.url);
    assert.notDeepEqual(rev.rect, bas.rect);
  });
});
