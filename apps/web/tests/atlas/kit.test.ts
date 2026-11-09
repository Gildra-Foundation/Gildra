import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { formatSeason, pluralRu } from "../../../../packages/atlas-ui/src/format.ts";
import { siteSearchCopy } from "../../components/platform/search/siteSearchCopy.ts";
import { matchRanges, normalize, otherLayout, searchIndex, transliterate } from "../../components/platform/search/siteSearchMatch.ts";
import { dungeonRoutes, dungeonSlugs } from "../../lib/data/wow/mythic/dungeonRoutes.ts";
import { routeTextEn } from "../../components/wow/mythic/routeStopsEn.ts";
import { atlasScenes } from "../../lib/atlas/scenes.ts";

const placeholders = JSON.parse(readFileSync(new URL("../../lib/atlas/artPlaceholders.json", import.meta.url), "utf8")) as Record<string, string>;
const portraits = JSON.parse(readFileSync(new URL("../../lib/atlas/artPortraits.json", import.meta.url), "utf8")) as Record<string, { src: string; x: number; width: number; height: number }>;

describe("atlas format helpers", () => {
  it("picks the Russian plural form", () => {
    assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => pluralRu(n, "босс", "босса", "боссов")),
      ["босс", "босса", "боссов", "боссов", "боссов", "босс", "босса", "боссов", "боссов"]);
  });
  it("formats a season label in both languages", () => {
    assert.equal(formatSeason("Midnight Season 2", "ru"), "Midnight · Сезон 2");
    assert.equal(formatSeason("Midnight Season 2", "en"), "Midnight · Season 2");
  });
});

describe("quick search matching", () => {
  const entries = [
    { t: "Den of Nalorakk", s: "Mythic+ dungeon", h: "/wow/mythic-plus/midnight-season-2/den-of-nalorakk", k: "Логово Налоракка" },
    { t: "Frost Mage", s: "Talent tree", h: "/talents/frost-mage" },
    { t: "Mage", s: "Class", h: "/wow/classes/mage" },
    { t: "Sal'uhan the Unbroken", s: "World boss", h: "/wow/lairs/saluhan" },
    { t: "Ёжиный лес", s: "Delve", h: "/wow/delves/x" },
  ];
  it("normalizes case, ё and punctuation", () => {
    assert.equal(normalize("Sal'uhan — the UNBROKEN!"), "saluhan the unbroken");
    assert.equal(normalize("Ёж"), "еж");
  });
  it("ranks a title prefix above a word inside the title", () => {
    assert.deepEqual(searchIndex(entries, "mage").map((hit) => hit.t), ["Mage", "Frost Mage"]);
  });
  it("needs every word of the query", () => {
    assert.deepEqual(searchIndex(entries, "frost mage").map((hit) => hit.t), ["Frost Mage"]);
    assert.deepEqual(searchIndex(entries, "frost priest"), []);
  });
  it("finds the other language's name and ignores apostrophes and ё", () => {
    assert.equal(searchIndex(entries, "налорак")[0]?.t, "Den of Nalorakk");
    assert.equal(searchIndex(entries, "saluhan")[0]?.t, "Sal'uhan the Unbroken");
    assert.equal(searchIndex(entries, "ежиный")[0]?.t, "Ёжиный лес");
  });
  it("returns nothing for an empty query", () => {
    assert.deepEqual(searchIndex(entries, "   "), []);
  });
  it("counts results in Russian", () => {
    assert.deepEqual([1, 3, 7, 21].map(siteSearchCopy.ru.count), ["1 результат", "3 результата", "7 результатов", "21 результат"]);
  });
});

describe("quick search tolerance and highlight", () => {
  const entries = [
    { t: "Druid", s: "Class", h: "/wow/classes#druid", k: "Друид", g: "class" as const },
    { t: "The Voidspire", s: "Raid", h: "/wow/raids/the-voidspire", k: "Шпиль Бездны", g: "raid" as const },
    { t: "Den of Nalorakk", s: "Mythic+ dungeon", h: "/wow/mythic-plus/midnight-season-2/den-of-nalorakk", k: "Логово Налоракка", g: "dungeon" as const },
    { t: "Orgrimmar", s: "Map", h: "/wow/map/85-orgrimmar", k: "Оргриммар", g: "place" as const },
  ];
  it("reads a query typed on the other keyboard layout", () => {
    assert.equal(otherLayout("lhebl"), "друид");
    assert.equal(otherLayout("вкгшв"), "druid");
    assert.equal(searchIndex(entries, "lhebl")[0]?.t, "Druid");
  });
  it("finds names spelled in the other alphabet", () => {
    assert.equal(transliterate("nalorak"), "налорак");
    assert.equal(searchIndex(entries, "logovo")[0]?.t, "Den of Nalorakk");
    assert.equal(searchIndex(entries, "друид")[0]?.t, "Druid");
  });
  it("forgives one typo per word of four letters or more", () => {
    assert.equal(searchIndex(entries, "voidspier")[0]?.t, "The Voidspire");
    assert.equal(searchIndex(entries, "orgrimar")[0]?.t, "Orgrimmar");
    assert.deepEqual(searchIndex(entries, "zzzz"), []);
  });
  it("keeps exact matches above the forgiving ones", () => {
    const hits = searchIndex([...entries, { t: "Druid of the Claw", s: "Talent", h: "/x" }], "druid");
    assert.deepEqual(hits.map((hit) => hit.t), ["Druid", "Druid of the Claw"]);
  });
  it("marks the matched words in the title as written", () => {
    assert.deepEqual(matchRanges("Sal'uhan the Unbroken", "saluhan"), [[0, 8]]);
    assert.deepEqual(matchRanges("Den of Nalorakk", "nal den"), [[0, 3], [7, 10]]);
    assert.deepEqual(matchRanges("Ёжиный лес", "ежи"), [[0, 3]]);
    assert.deepEqual(matchRanges("Druid", "лес"), []);
  });
});

describe("scene registry", () => {
  for (const [id, scene] of Object.entries(atlasScenes)) {
    it(`${id}: art exists, has a blurred placeholder and the preview focus is inside the picture`, () => {
      assert.ok(existsSync(new URL(`../../public${scene.art}`, import.meta.url)), scene.art);
      assert.ok(placeholders[scene.art]?.startsWith("data:image/webp;base64,"), `placeholder for ${scene.art} (npm run art:placeholders)`);
      assert.ok(scene.og.every((value) => value >= 0 && value <= 1));
    });
    it(`${id}: phones get a crop of the painting at the scene's focus`, () => {
      const portrait = portraits[scene.art];
      assert.ok(portrait, `phone crop for ${scene.art} (npm run art:portraits)`);
      assert.ok(existsSync(new URL(`../../public${portrait.src}`, import.meta.url)), portrait.src);
      const [x] = scene.position.split(" ");
      assert.equal(portrait.x, x === "center" ? 0.5 : parseFloat(x) / 100, "crop focus = scene focus");
      // The crop covers every box the frame swaps it into (ART_PORTRAIT_MEDIA: box at most 0.9 as wide as tall).
      assert.ok(portrait.width >= portrait.height * 0.9 - 1);
    });
  }
});

describe("English Mythic+ route text", () => {
  for (const slug of dungeonSlugs) {
    it(`${slug}: one English entry per step and floor`, () => {
      const route = dungeonRoutes[slug];
      const text = routeTextEn[slug];
      assert.equal(text.stops.length, route.stops.length);
      assert.equal(text.floors.length, route.floors.length);
      for (const stop of text.stops) assert.doesNotMatch(JSON.stringify(stop), /[а-яё]/i, "no Cyrillic in English text");
    });
  }
});

describe("kit documentation", () => {
  it("packages/atlas-ui/README.md describes every exported component", async () => {
    const { readFile } = await import("node:fs/promises");
    const index = await readFile(new URL("../../../../packages/atlas-ui/src/index.ts", import.meta.url), "utf8");
    const readme = await readFile(new URL("../../../../packages/atlas-ui/README.md", import.meta.url), "utf8");
    const components = [...index.matchAll(/export \{([^}]+)\}/g)]
      .flatMap((match) => match[1].split(","))
      .map((name) => name.trim().replace(/^type\s+/, ""))
      .filter((name) => /^Atlas[A-Z]/.test(name) && !/^Atlas(Stat|Anchor|CardImage|CardMeta|MetaItem|Crumb|Column|Tab|PathStep|BadgeTone|Locale|ChartDatum|FrameShellProps|Glow)$/.test(name));
    const missing = components.filter((name) => !readme.includes(`\`${name}\``));
    assert.deepEqual(missing, [], `README lacks ${missing.join(", ")}`);
  });
});
