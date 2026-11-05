import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { routeSections, type SectionId } from "../../lib/routes/registry.ts";
import { sectionMetadata } from "../../lib/routes/metadata.ts";
import { staticPaths } from "../../lib/games/wow/sitemap.ts";
import { dungeonSlugs } from "../../lib/data/wow/mythic/dungeonRoutes.ts";
import { midnightLairEncounters } from "../../lib/data/wow.ts";

/** Public pages are open to search engines (2026-11-05); private and service pages stay noindex. */
describe("seo: open pages", () => {
  it("no registry section page is noindex", () => {
    for (const id of Object.keys(routeSections) as SectionId[]) {
      for (const locale of ["en", "ru"] as const) {
        let meta;
        try { meta = sectionMetadata(id, locale); } catch { continue; } // a section without registry metadata has its own page metadata
        assert.equal(meta.robots, undefined, `${id} ${locale}`);
      }
    }
  });

  it("content pages carry no noindex in their metadata", () => {
    const files = [
      "lib/games/wow/pages/tier-lists.ts",
      ...["(site)", "ru"].flatMap((root) => [
        "library/page.tsx", "library/[dataset]/page.tsx", "wow/lairs/[slug]/page.tsx", "wow/mythic-plus/[season]/[dungeon]/page.tsx",
        "wow/raids/[raid]/page.tsx", "wow/raids/sporefall/page.tsx", "wow/raids/venomous-abyss/page.tsx", "wow/raids/the-unbinding-of-kithix/page.tsx",
      ].map((file) => `app/${root}/${file}`)),
    ];
    for (const file of files) assert.doesNotMatch(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), /index: false/, file);
  });

  it("private and service pages stay noindex", () => {
    const files = ["search/page.tsx", "talents/[spec]/page.tsx", "wow/rotation/[spec]/page.tsx", "wow/characters/page.tsx", "wow/characters/[slug]/page.tsx", "wow/shared/[token]/page.tsx"]
      .flatMap((file) => [`app/(site)/${file}`, `app/ru/${file}`]);
    for (const file of [...files, "app/(console)/layout.tsx", "app/(site)/dev/atlas/page.tsx", "app/(site)/dev/blocks/page.tsx"]) {
      assert.match(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"), /index: false/, file);
    }
  });
});

describe("seo: static sitemap paths", () => {
  const paths = staticPaths({ catalogPublic: true });
  it("lists every open section, dungeon, raid and lair once", () => {
    assert.equal(new Set(paths).size, paths.length);
    for (const path of ["/", "/wow", "/wow/whats-new", "/wow/mythic-plus", "/wow/mythic-plus/meta", "/wow/raids", "/wow/lairs", "/wow/auction", "/wow/transmog", "/tier-lists", "/wow/classes", "/wow/midnight/season-2", "/library", "/privacy",
      "/wow/raids/the-voidspire", "/wow/raids/sporefall", "/wow/raids/venomous-abyss", "/wow/raids/the-unbinding-of-kithix"]) assert.ok(paths.includes(path), path);
    for (const slug of dungeonSlugs) assert.ok(paths.includes(`/wow/mythic-plus/midnight-season-2/${slug}`), slug);
    for (const { slug } of midnightLairEncounters) assert.ok(paths.includes(`/wow/lairs/${slug}`), slug);
  });
  it("leaves out redirects and private pages", () => {
    for (const path of ["/wow/dungeons", "/wow/delves", "/wow/characters", "/search", "/login"]) assert.ok(!paths.includes(path), path);
    assert.ok(!staticPaths().includes("/library"), "the library is listed only while the catalog is public");
  });
});

describe("seo: library record addresses", async () => {
  const { libraryRecordPath, legacyLibraryRecordPath } = await import("../../lib/library/recordPath.ts");
  const id = "00004a86-3321-43ac-983d-9d73d79d11ae";
  it("records live at /library/<dataset>/<id>/<slug>, without the repeated type", () => {
    assert.equal(libraryRecordPath("en", "item", id, "grievous-gladiator-s-wyrmhide-legguards"), `/library/items/${id}/grievous-gladiator-s-wyrmhide-legguards`);
    assert.equal(libraryRecordPath("ru", "spell", id, "шар"), `/ru/library/spells/${id}/${encodeURIComponent("шар")}`);
    assert.equal(libraryRecordPath("en", "item_set", id, "regalia"), `/library/records/${id}/regalia`, "a type without a dataset opens under records");
    assert.equal(libraryRecordPath("en", "item", id, "x", "wow_classic"), `/library/items/${id}/x?product=wow_classic`);
    assert.equal(libraryRecordPath("en", "item", id, null), `/library/items/${id}/record`);
  });
  it("the old /library/<dataset>/<type>/<id>/<slug> moves to the type's home dataset with its query", () => {
    assert.equal(legacyLibraryRecordPath("en", "item", id, "x", "?product=wow_classic&a=1"), `/library/items/${id}/x?product=wow_classic&a=1`);
    assert.equal(legacyLibraryRecordPath("ru", "item_set", id, "x"), `/ru/library/records/${id}/x`);
  });
  it("the old four-segment route answers a 308 route handler in both languages", () => {
    for (const root of ["(site)", "ru"]) {
      const file = readFileSync(new URL(`../../app/${root}/library/[dataset]/[id]/[slug]/[legacy]/route.ts`, import.meta.url), "utf8");
      assert.match(file, /legacyRecordRedirect\("(en|ru)"\)/, root);
      assert.match(readFileSync(new URL(`../../app/${root}/library/[dataset]/[id]/[slug]/page.tsx`, import.meta.url), "utf8"), /LibraryRecordRoute/, root);
    }
  });
});
