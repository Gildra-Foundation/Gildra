import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

type Art = { width: number; height: number; tileSize: number; maxZoom: number; url: string };
type MapNode = {
  id: number; slug: string; name: { en: string; ru: string }; type: string; parentId: number | null;
  children: number[]; rectInParent: [number, number, number, number] | null; art: Art | null; href?: string;
};
type Poi = { id: string; mapId: number | string; kind: string; name: { en: string; ru: string }; x: number; y: number; faction?: string; href?: string; targetMapId?: number | string };
type Override = Partial<MapNode> & { art?: Art | null; id?: number | string };
type Era = {
  id: string; name: { en: string; ru: string }; expansion: string; patchRange: [string, string];
  source: { product: string; build: string }; rootMapId: number | string; inherits?: string;
  maps: Record<string, "unchanged" | Override>; pois?: Poi[];
};

const web = fileURLToPath(new URL("../../", import.meta.url));
const data = (file: string) => JSON.parse(readFileSync(join(web, "data/wow/map", file), "utf8"));
const maps: MapNode[] = data("maps.json");
const pois: Poi[] = data("pois.json");
const eras: Era[] = data("eras.json");
const byId = new Map(maps.map((m) => [m.id, m]));
const TYPES = new Set(["cosmic", "world", "continent", "zone", "dungeon", "micro", "orphan"]);
const KINDS = new Set(["capital", "city", "town", "flight", "portal", "dungeon", "raid", "delve", "zone-label"]);
const COSMIC = 946;

function tilesOf(art: Art): string[] {
  const dir = join(web, "public", art.url.replace(/^\//, "").replace(/\{z\}\/\{x\}_\{y\}\.webp$/, ""));
  const files: string[] = [];
  for (let z = 0; z <= art.maxZoom; z += 1) {
    const scale = 2 ** (art.maxZoom - z);
    const cols = Math.ceil(Math.ceil(art.width / scale) / art.tileSize);
    const rows = Math.ceil(Math.ceil(art.height / scale) / art.tileSize);
    for (let x = 0; x < cols; x += 1) for (let y = 0; y < rows; y += 1) files.push(join(dir, String(z), `${x}_${y}.webp`));
  }
  return files;
}

function assertArt(art: Art, label: string) {
  assert.equal(art.tileSize, 256, label);
  assert.ok(art.width > 0 && art.height > 0, label);
  assert.equal(art.maxZoom, Math.max(0, Math.ceil(Math.log2(Math.max(art.width, art.height) / 256))), `${label} maxZoom`);
  assert.match(art.url, /^\/maps\/tiles\/[a-z0-9/-]+\/\{z\}\/\{x\}_\{y\}\.webp$/, label);
  for (const file of tilesOf(art)) assert.ok(existsSync(file), `${label}: missing ${file}`);
}

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? dirBytes(path) : statSync(path).size;
  }
  return total;
}

describe("world map hierarchy", () => {
  it("has unique ids, one Cosmic root and valid types", () => {
    assert.equal(byId.size, maps.length);
    const roots = maps.filter((m) => m.parentId === null);
    assert.deepEqual(roots.map((m) => m.id), [COSMIC]);
    for (const m of maps) {
      assert.ok(TYPES.has(m.type), `${m.id} type ${m.type}`);
      assert.match(m.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${m.id} slug`);
    }
    assert.equal(byId.get(COSMIC)?.type, "cosmic");
  });

  it("links parents and children both ways, without cycles", () => {
    for (const m of maps) {
      if (m.parentId !== null) {
        const parent = byId.get(m.parentId);
        assert.ok(parent, `${m.id} parent ${m.parentId}`);
        assert.ok(parent.children.includes(m.id), `${m.parentId} lists ${m.id}`);
      }
      assert.equal(new Set(m.children).size, m.children.length, `${m.id} duplicate children`);
      for (const child of m.children) assert.equal(byId.get(child)?.parentId, m.id, `${child} parent is ${m.id}`);
      const seen = new Set<number>();
      let cursor: MapNode | undefined = m;
      while (cursor && cursor.parentId !== null) {
        assert.ok(!seen.has(cursor.id), `cycle at ${m.id}`);
        seen.add(cursor.id);
        cursor = byId.get(cursor.parentId);
      }
      assert.equal(cursor?.id, COSMIC, `${m.id} reaches Cosmic`);
    }
  });

  it("covers the worlds, continents and capitals of the game", () => {
    const expected: Record<number, string> = {
      947: "Azeroth", 101: "Outland", 572: "Draenor", 1550: "The Shadowlands", 12: "Kalimdor", 13: "Eastern Kingdoms",
      113: "Northrend", 424: "Pandaria", 619: "Broken Isles", 875: "Zandalar", 876: "Kul Tiras", 1978: "Dragon Isles",
      2274: "Khaz Algar", 2537: "Quel'Thalas", 85: "Orgrimmar", 84: "Stormwind City", 87: "Ironforge", 88: "Thunder Bluff",
      90: "Undercity", 89: "Darnassus", 110: "Silvermoon City", 103: "The Exodar", 111: "Shattrath City", 125: "Dalaran",
      627: "Dalaran", 2112: "Valdrakken", 2339: "Dornogal", 1161: "Boralus", 1165: "Dazar'alor", 1670: "Oribos",
    };
    for (const [id, name] of Object.entries(expected)) assert.equal(byId.get(Number(id))?.name.en, name, `map ${id}`);
    assert.deepEqual([1, 85].map((id) => byId.get(id)?.parentId), [12, 12]);
    assert.equal(byId.get(12)?.parentId, 947);
  });

  it("names every map in English and Russian", () => {
    for (const m of maps) {
      assert.ok(m.name.en.trim() && m.name.ru.trim(), `${m.id} names`);
    }
    for (const m of maps.filter((n) => ["cosmic", "world", "continent"].includes(n.type))) {
      assert.match(m.name.ru, /[А-Яа-яЁё]/, `${m.id} ${m.name.en} has a Russian name`);
    }
    assert.equal(byId.get(85)?.name.ru, "Оргриммар");
    assert.equal(byId.get(12)?.name.ru, "Калимдор");
  });

  it("places child rects inside their parent", () => {
    for (const m of maps) {
      const rect = m.rectInParent;
      if (!rect) continue;
      const [x0, y0, x1, y1] = rect;
      assert.ok(x1 > x0 && y1 > y0, `${m.id} rect order`);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      // a child's picture may reach past the parent's edge (sea margins, Korthia below the Maw),
      // its centre stays on the parent's picture
      assert.ok(cx >= -0.1 && cx <= 1.1 && cy >= -0.1 && cy <= 1.1, `${m.id} ${m.name.en} centre inside ${m.parentId}`);
      if (m.type === "continent" || (m.type === "zone" && m.id !== 1961)) assert.ok(cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1, `${m.id} ${m.name.en} centre`);
      if (m.type === "zone" || m.type === "micro") {
        assert.ok(x0 > -0.6 && y0 > -0.6 && x1 < 1.6 && y1 < 1.6, `${m.id} ${m.name.en} rect near parent`);
      }
    }
    // known geometry: Durotar and Orgrimmar sit on the east coast of Kalimdor, Orgrimmar north of Durotar's centre
    const durotar = byId.get(1)!.rectInParent!;
    const orgrimmar = byId.get(85)!.rectInParent!;
    assert.ok(durotar[0] > 0.45 && durotar[2] < 0.75, "Durotar east");
    assert.ok(orgrimmar[0] >= durotar[0] && orgrimmar[2] <= durotar[2] && (orgrimmar[1] + orgrimmar[3]) / 2 < (durotar[1] + durotar[3]) / 2, "Orgrimmar inside northern Durotar");
  });
});

describe("world map art", () => {
  it("has tiles for every level of every map with art", () => {
    const withArt = maps.filter((m) => m.art);
    assert.ok(withArt.length > 400, `maps with art: ${withArt.length}`);
    for (const m of withArt) assertArt(m.art!, `map ${m.id}`);
    for (const id of [COSMIC, 947, 12, 13, 1, 85, 84, 2339]) assert.ok(byId.get(id)?.art, `${id} has art`);
  });

  it("stays within the tile budget", () => {
    const tiles = join(web, "public/maps/tiles");
    const total = dirBytes(tiles);
    const eraBytes = dirBytes(join(tiles, "era"));
    assert.ok(total - eraBytes <= 200e6, `retail tiles ${(total - eraBytes) / 1e6} MB`);
    assert.ok(total <= 400e6, `all tiles ${total / 1e6} MB`);
  });
});

describe("world map points", () => {
  it("are valid and sit on maps with art", () => {
    assert.equal(new Set(pois.map((p) => p.id)).size, pois.length);
    for (const p of pois) {
      assert.ok(KINDS.has(p.kind), `${p.id} kind`);
      const map = byId.get(p.mapId as number);
      assert.ok(map?.art, `${p.id} map ${p.mapId}`);
      assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${p.id} position`);
      assert.ok(p.name.en && p.name.ru, `${p.id} names`);
      if (p.faction) assert.ok(["alliance", "horde", "neutral"].includes(p.faction), p.id);
      if (p.href) assert.match(p.href, /^\/wow\/(dungeons|raids|mythic-plus)\/[a-z0-9-]+$/, p.id);
    }
  });

  it("marks capitals, flight paths and instance entrances", () => {
    const capital = pois.find((p) => p.id === "city-85");
    assert.equal(capital?.kind, "capital");
    assert.equal(capital?.mapId, 12);
    assert.equal(capital?.faction, "horde");
    for (const city of [84, 85, 87, 88, 89, 90, 103, 110, 2339, 2112]) assert.ok(pois.some((p) => p.targetMapId === city), `city ${city}`);
    assert.ok(pois.filter((p) => p.kind === "flight").length > 300);
    assert.ok(pois.some((p) => p.kind === "flight" && p.mapId === 85), "Orgrimmar flight master");
    assert.ok(pois.some((p) => p.kind === "dungeon" && p.name.en === "Ragefire Chasm" && p.mapId === 85));
    assert.ok(pois.filter((p) => p.kind === "raid").length > 30);
    assert.ok(pois.some((p) => p.href === "/wow/raids/the-voidspire"));
  });
});

describe("world map eras", () => {
  const eraIds = new Map(eras.map((e) => [e.id, e]));
  const resolveArt = (era: Era, key: string): Art | null | undefined => {
    const value = era.maps[key];
    if (value === undefined) return era.inherits ? resolveArt(eraIds.get(era.inherits)!, key) : undefined;
    if (value === "unchanged") return byId.get(Number(key))?.art;
    return value.art ?? null;
  };

  it("come from the game clients of each era", () => {
    assert.equal(eraIds.size, eras.length);
    const products = new Set(["wow", "wow_classic", "wow_classic_era", "wow_anniversary", "wow_classic_titan"]);
    for (const era of eras) {
      assert.ok(products.has(era.source.product), `${era.id} product`);
      assert.match(era.source.build, /^\d+\.\d+\.\d+\.\d+$/, `${era.id} build`);
      assert.ok(era.name.en && era.name.ru, `${era.id} names`);
      if (era.inherits) assert.ok(eraIds.has(era.inherits), `${era.id} inherits`);
    }
    const expectations: Record<string, string> = { classic: "1.", "burning-crusade": "2.", "wrath-of-the-lich-king": "3.", "cataclysm-pandaria": "5.", midnight: "12." };
    for (const [id, major] of Object.entries(expectations)) assert.ok(eraIds.get(id)?.source.build.startsWith(major), `${id} build`);
  });

  it("follow each other on the timeline", () => {
    const main = eras.filter((e) => !e.inherits);
    const v = (p: string) => p.split(".").map(Number).reduce((acc, n) => acc * 100 + n, 0);
    for (let i = 1; i < main.length; i += 1) assert.ok(v(main[i].patchRange[0]) > v(main[i - 1].patchRange[1]), `${main[i].id} after ${main[i - 1].id}`);
    for (const e of eras) assert.ok(v(e.patchRange[0]) <= v(e.patchRange[1]), e.id);
  });

  it("list existing maps with real art and tiles", () => {
    for (const era of eras) {
      assert.ok(era.maps[String(era.rootMapId)] !== undefined || era.inherits, `${era.id} root listed`);
      for (const [key, value] of Object.entries(era.maps)) {
        if (value === "unchanged") {
          assert.ok(byId.has(Number(key)), `${era.id} ${key} unchanged exists`);
          continue;
        }
        if (!byId.has(Number(key))) {
          assert.ok(value.type && value.name?.en && value.name?.ru && value.slug, `${era.id} era-only ${key}`);
        }
        if (value.art) assertArt(value.art, `${era.id} ${key}`);
        if (value.rectInParent) assert.equal(value.rectInParent.length, 4);
      }
    }
  });

  it("show the world before and after the Cataclysm", () => {
    const classic = eraIds.get("classic")!;
    const cata = eraIds.get("cataclysm-pandaria")!;
    for (const id of ["12", "13", "1", "85", "90", "89"]) {
      const value = classic.maps[id];
      assert.ok(value && value !== "unchanged" && value.art, `classic ${id} has its own art`);
    }
    assert.equal(classic.maps["424"], undefined, "no Pandaria in 1.x");
    assert.equal(classic.maps["113"], undefined, "no Northrend in 1.x");
    assert.ok(eraIds.get("burning-crusade")!.maps["101"], "Outland in 2.x");
    assert.ok(eraIds.get("wrath-of-the-lich-king")!.maps["113"], "Northrend in 3.x");
    assert.ok(cata.maps["424"], "Pandaria in 5.x");
    assert.notEqual(resolveArt(classic, "12")?.url, resolveArt(cata, "12")?.url, "Kalimdor changed");
    // the Vale of Eternal Blossoms before and after its corruption
    assert.notEqual(resolveArt(cata, "390")?.url, resolveArt(eraIds.get("vale-corruption")!, "390")?.url);
    // phased art of the retail client
    assert.notEqual(resolveArt(eraIds.get("warlords-legion")!, "81")?.url, resolveArt(eraIds.get("battle-for-azeroth")!, "81")?.url, "Silithus wound");
    assert.notEqual(resolveArt(cata, "70")?.url, resolveArt(eraIds.get("theramore-fall")!, "70")?.url, "Theramore");
    assert.equal(eraIds.get("battle-for-azeroth")!.maps["2537"], undefined, "Quel'Thalas rebuilt only in Midnight");
    assert.ok(eraIds.get("midnight")!.maps["2537"]);
  });

  it("place era points on maps of that era", () => {
    for (const era of eras.filter((e) => e.pois)) {
      assert.ok(era.pois!.length > 20, `${era.id} points`);
      for (const p of era.pois!) {
        assert.ok(era.maps[String(p.mapId)] !== undefined, `${era.id} ${p.id} on listed map`);
        assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${era.id} ${p.id}`);
        assert.ok(KINDS.has(p.kind));
      }
    }
  });
});
