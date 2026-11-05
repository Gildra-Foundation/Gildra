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
    for (const path of ["/", "/wow", "/wow/whats-new", "/wow/mythic-plus", "/wow/mythic-plus/meta", "/wow/raids", "/wow/lairs", "/wow/delves", "/wow/auction", "/wow/transmog", "/tier-lists", "/wow/classes", "/wow/midnight/season-2", "/library", "/privacy",
      "/wow/raids/the-voidspire", "/wow/raids/sporefall", "/wow/raids/venomous-abyss", "/wow/raids/the-unbinding-of-kithix"]) assert.ok(paths.includes(path), path);
    for (const slug of dungeonSlugs) assert.ok(paths.includes(`/wow/mythic-plus/midnight-season-2/${slug}`), slug);
    for (const { slug } of midnightLairEncounters) assert.ok(paths.includes(`/wow/lairs/${slug}`), slug);
  });
  it("leaves out redirects and private pages", () => {
    for (const path of ["/wow/dungeons", "/wow/characters", "/search", "/login"]) assert.ok(!paths.includes(path), path);
    assert.ok(!staticPaths().includes("/library"), "the library is listed only while the catalog is public");
  });
});
