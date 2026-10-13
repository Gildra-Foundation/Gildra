import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

import { formatSeason, pluralRu } from "../../components/atlas/format.ts";
import { siteSearchCopy } from "../../components/platform/search/siteSearchCopy.ts";
import { normalize, searchIndex } from "../../components/platform/search/siteSearchMatch.ts";
import { dungeonRoutes, dungeonSlugs } from "../../components/wow/mythic/dungeonRoutes.ts";
import { routeTextEn } from "../../components/wow/mythic/routeStopsEn.ts";
import { atlasScenes } from "../../lib/atlas/scenes.ts";

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

describe("scene registry", () => {
  for (const [id, scene] of Object.entries(atlasScenes)) {
    it(`${id}: art exists and the preview focus is inside the picture`, () => {
      assert.ok(existsSync(new URL(`../../public${scene.art}`, import.meta.url)), scene.art);
      assert.ok(scene.og.every((value) => value >= 0 && value <= 1));
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
  it("components/atlas/README.md describes every exported component", async () => {
    const { readFile } = await import("node:fs/promises");
    const index = await readFile(new URL("../../components/atlas/index.ts", import.meta.url), "utf8");
    const readme = await readFile(new URL("../../components/atlas/README.md", import.meta.url), "utf8");
    const components = [...index.matchAll(/export \{([^}]+)\}/g)]
      .flatMap((match) => match[1].split(","))
      .map((name) => name.trim().replace(/^type\s+/, ""))
      .filter((name) => /^Atlas[A-Z]/.test(name) && !/^Atlas(Stat|Anchor|CardImage|CardMeta|MetaItem|Crumb|Column|Tab|PathStep|BadgeTone|Locale)$/.test(name));
    const missing = components.filter((name) => !readme.includes(`\`${name}\``));
    assert.deepEqual(missing, [], `README lacks ${missing.join(", ")}`);
  });
});
