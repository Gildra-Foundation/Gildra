import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

describe("seo: page metadata (2026-11-06 audit)", async () => {
  const { dungeonMetadata } = await import("../../lib/seo/dungeonMetadata.ts");
  const { seoTitles, professionSeoTitle } = await import("../../lib/seo/titles.ts");
  const professions = (await import("../../data/wow/professions/index.json", { with: { type: "json" } })).default as Array<{ slug: string; name: { en: string; ru: string } }>;

  it("every dungeon page has its own description and Open Graph in both languages", () => {
    for (const locale of ["en", "ru"] as const) {
      const descriptions = dungeonSlugs.map((slug) => {
        const meta = dungeonMetadata(locale, "midnight-season-2", slug);
        const description = String(meta.description);
        assert.ok(description.length >= 70 && description.length <= 165, `${slug} ${locale} (${description.length}) ${description}`);
        assert.equal(meta.openGraph?.url, `${locale === "ru" ? "/ru" : ""}/wow/mythic-plus/midnight-season-2/${slug}`);
        return description;
      });
      assert.equal(new Set(descriptions).size, descriptions.length, locale);
    }
    assert.deepEqual(dungeonMetadata("en", "midnight-season-1", dungeonSlugs[0]), {});
  });

  it("section titles are unique and descriptions fit a search snippet", () => {
    for (const locale of ["en", "ru"] as const) {
      const titles = new Set<string>();
      for (const id of Object.keys(routeSections) as SectionId[]) {
        let meta;
        try { meta = sectionMetadata(id, locale); } catch { continue; }
        const title = String(meta.title);
        assert.ok(!titles.has(title), `${id} ${locale}: duplicate title ${title}`);
        titles.add(title);
        assert.ok(title.length <= 70, `${id} ${locale}: title ${title.length}`);
        if (meta.description) assert.ok(meta.description.length <= 200, `${id} ${locale}: description ${meta.description.length}`);
      }
    }
  });

  it("tool pages are titled with the game and the task, not one word", () => {
    for (const titles of Object.values(seoTitles)) for (const title of Object.values(titles)) {
      assert.ok(title.length >= 25 && title.length <= 65 && title.endsWith("— Gildra"), title);
    }
    for (const profession of professions) for (const locale of ["en", "ru"] as const) {
      const title = professionSeoTitle(locale, profession.name[locale]);
      assert.ok(title.length <= 65 && title.includes(profession.name[locale]), title);
    }
  });
});

describe("seo: cached views of query-driven pages", async () => {
  const { cachedViewRewrite } = await import("../../lib/routes/cachedViews.ts");
  const view = (url: string) => cachedViewRewrite(new URL(url, "https://gildra.net"));
  it("?region=us of a profession is served from the cached region/us path; EU stays on the page itself", () => {
    assert.equal(view("/wow/professions/alchemy?region=us"), "/wow/professions/alchemy/region/us");
    assert.equal(view("/ru/wow/professions/alchemy/?region=us&x=1"), "/ru/wow/professions/alchemy/region/us");
    assert.equal(view("/wow/professions/alchemy"), null);
    assert.equal(view("/wow/professions/alchemy?region=eu"), null);
    assert.equal(view("/wow/professions?region=us"), null);
  });
  it("the unfiltered Mythic+ data pages and spec leaderboards are served from their cached views", () => {
    for (const page of ["stats", "comps", "routes", "leaderboard"]) {
      assert.equal(view(`/wow/mythic-plus/${page}`), `/wow/mythic-plus/cached/${page}`);
      assert.equal(view(`/ru/wow/mythic-plus/${page}/`), `/ru/wow/mythic-plus/cached/${page}`);
      assert.equal(view(`/wow/mythic-plus/${page}?_rsc=abc`), `/wow/mythic-plus/cached/${page}`, "the router's cache-buster is not a filter");
      assert.equal(view(`/wow/mythic-plus/${page}?region=us`), null, "a filtered view renders per request");
    }
    assert.equal(view("/wow/mythic-plus/leaderboard/holy-priest"), "/wow/mythic-plus/cached/leaderboard/holy-priest");
    assert.equal(view("/wow/mythic-plus/leaderboard/holy-priest?realm=x"), null);
    assert.equal(view("/wow/mythic-plus/leaderboard/opengraph-image"), null, "the hub's card is not a spec");
    assert.equal(view("/wow/mythic-plus/leaderboard/no-such-spec"), null);
    assert.equal(view("/wow/mythic-plus"), null);
    assert.equal(view("/wow/mythic-plus/midnight-season-2/kings-rest"), null);
  });
  it("live meta renders in the public request while its API payload remains cached", () => {
    for (const prefix of ["", "/ru"]) {
      for (const suffix of ["", "/", "?_rsc=abc"]) assert.equal(view(`${prefix}/wow/mythic-plus/meta${suffix}`), null);
      assert.equal(view(`${prefix}/wow/mythic-plus/cached/meta`), "direct");
    }
  });
  it("internal paths opened directly are a 404; their link-preview cards stay reachable", () => {
    assert.equal(view("/wow/professions/alchemy/region/us"), "direct");
    assert.equal(view("/ru/wow/professions/alchemy/region"), "direct");
    assert.equal(view("/wow/mythic-plus/cached/stats"), "direct");
    assert.equal(view("/ru/wow/mythic-plus/cached/leaderboard/holy-priest"), "direct");
    assert.equal(view("/wow/mythic-plus/cached/stats/opengraph-image-usi2he"), null);
    assert.equal(view("/ru/wow/mythic-plus/cached/leaderboard/holy-priest/opengraph-image"), null);
  });
});

describe("seo: structured data", async () => {
  const { websiteLd, itemListLd } = await import("../../lib/seo/structuredData.ts");
  const { tierListLd, specPagePath } = await import("../../lib/seo/itemLists.ts");
  const { breadcrumbJsonLd } = await import("../../../../packages/atlas-ui/src/breadcrumbJsonLd.ts");
  const { midnightSpecializations } = await import("../../lib/data/wow/specializations.ts");

  it("the home page names the site search", () => {
    for (const locale of ["en", "ru"] as const) {
      const site = websiteLd(locale, "x")[0] as unknown as { potentialAction: { target: { urlTemplate: string } } };
      assert.equal(site.potentialAction.target.urlTemplate, `https://gildra.net${locale === "ru" ? "/ru" : ""}/search?q={search_term_string}`);
    }
  });

  it("breadcrumbs resolve to absolute URLs; the current page may go without one", () => {
    const ld = breadcrumbJsonLd([{ label: "World of Warcraft", href: "/ru/wow" }, { label: "Рейды", href: "/ru/wow/raids" }, { label: "Пустотный шпиль" }]);
    assert.deepEqual(ld.itemListElement.map((item) => [item.position, item.name, "item" in item ? item.item : null]),
      [[1, "World of Warcraft", "https://gildra.net/ru/wow"], [2, "Рейды", "https://gildra.net/ru/wow/raids"], [3, "Пустотный шпиль", null]]);
  });

  it("every tier-list spec links to its specialization page", () => {
    for (const spec of midnightSpecializations) {
      const short = spec.slug.slice(0, -(spec.classSlug.length + 1));
      assert.equal(specPagePath("en", spec.classSlug, short), `/wow/classes/${spec.classSlug}/${spec.slug}`, spec.slug);
    }
    const roles = { tank: [], healer: [{ rank: 2, tier: "A", role: "healer", className: "Priest", classSlug: "priest", specName: "Holy", specSlug: "holy" }, { rank: 1, tier: "S", role: "healer", className: "Druid", classSlug: "druid", specName: "Restoration", specSlug: "restoration" }], dps: [] };
    const [healers] = tierListLd("ru", { roles: roles as never });
    const items = healers.itemListElement as Array<{ name: string; url?: string; position: number }>;
    assert.deepEqual(items.map((item) => [item.position, item.name, item.url]), [[1, "Restoration Druid — S", "https://gildra.net/ru/wow/classes/druid/restoration-druid"], [2, "Holy Priest — A", "https://gildra.net/ru/wow/classes/priest/holy-priest"]]);
    assert.equal(itemListLd("x", []).numberOfItems, 0);
  });
});

describe("seo: link previews", () => {
  it("every indexable page family has its own Open Graph card in both languages", () => {
    const routes = ["wow", "wow/mythic-plus", "wow/mythic-plus/comps", "wow/mythic-plus/stats", "wow/mythic-plus/routes", "wow/mythic-plus/meta", "wow/mythic-plus/leaderboard",
      "wow/mythic-plus/leaderboard/[spec]", "wow/mythic-plus/[season]/[dungeon]", "wow/raids", "wow/raids/[raid]", "wow/raids/composition", "wow/lairs", "wow/lairs/[slug]",
      "wow/classes", "wow/classes/[class]", "wow/classes/[class]/[spec]", "wow/professions", "wow/professions/[slug]", "wow/transmog", "wow/auction", "wow/midnight/season-2",
      "wow/whats-new", "tier-lists", "library", "library/[dataset]", "wow/raids/the-unbinding-of-kithix", "privacy",
      "wow/mythic-plus/cached/[page]", "wow/mythic-plus/cached/leaderboard/[spec]", "wow/professions/[slug]/region/[region]"];
    for (const root of ["(site)", "ru"]) for (const route of routes) {
      const dir = new URL(`../../app/${root}/${route}/`, import.meta.url);
      assert.ok(["opengraph-image.tsx", "opengraph-image.png"].some((file) => existsSync(new URL(file, dir))), `${root}/${route}`);
    }
  });
});
