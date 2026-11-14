import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bracketOfSlug, legacyTierMode, restOfQuery, tierModeMeta, tierModePath, tierModePaths } from "../../components/blocks/wow/tierWorkspace/tierModes.ts";
import { PVP_BRACKETS } from "../../components/blocks/wow/tierWorkspace/tierSourceKeys.ts";
import { datasetHasRecordSitemap, entriesHaveLocales, homeDatasetType, internalRecordSlug, isRecordShard, recordSitemapShards, recordSitemapUrls, requestShards } from "../../lib/library/recordSitemap.ts";
import { specLinkTargets } from "../../components/wow/shared/relatedLinksCopy.ts";
import { talentSpecThemes } from "../../lib/talentSpecThemes.ts";
import { midnightSpecializations } from "../../lib/data/wow/specializations.ts";

describe("tier-list modes: one address each", () => {
  it("paths of every mode and bracket are unique and round-trip", () => {
    const paths = tierModePaths();
    assert.equal(new Set(paths).size, paths.length);
    assert.deepEqual(paths.slice(0, 3), ["/tier-lists", "/tier-lists/raid", "/tier-lists/arena"]);
    for (const bracket of PVP_BRACKETS) {
      const path = tierModePath("pvp", bracket);
      const slug = path.split("/")[3];
      assert.equal(slug ? bracketOfSlug(slug) : "3v3", bracket, path);
    }
    assert.equal(bracketOfSlug("3v3"), null, "3v3 is the arena page itself");
    assert.equal(bracketOfSlug("shuffle"), null, "the address part is solo-shuffle");
  });

  it("titles and descriptions are unique per page and language, within search-result lengths", () => {
    for (const lang of ["en", "ru"] as const) {
      const metas = [tierModeMeta(lang, "mythic_plus"), tierModeMeta(lang, "raid"), ...PVP_BRACKETS.map((bracket) => tierModeMeta(lang, "pvp", bracket))];
      assert.equal(new Set(metas.map((meta) => meta.title)).size, metas.length);
      assert.equal(new Set(metas.map((meta) => meta.description)).size, metas.length);
      for (const meta of metas) {
        assert.ok(meta.title.length >= 20 && meta.title.length <= 65, `${meta.title} (${meta.title.length})`);
        assert.ok(meta.description.length >= 70 && meta.description.length <= 165, `${meta.description} (${meta.description.length})`);
      }
    }
  });

  it("old queries name their mode; the rest of the query travels along", () => {
    assert.deepEqual(legacyTierMode({ activity: "pvp", bracket: "shuffle" }), { mode: "pvp", bracket: "shuffle" });
    assert.deepEqual(legacyTierMode({ mode: "raid" }), { mode: "raid", bracket: null });
    assert.deepEqual(legacyTierMode({ role: "tank" }), { mode: null, bracket: null });
    assert.equal(restOfQuery({ activity: "raid", role: "healer", view: "list", bracket: "2v2" }), "?role=healer&view=list");
    assert.equal(restOfQuery({ activity: "raid" }), "");
  });
});

describe("library record sitemaps", () => {
  it("shards keep each file under the 50 000-URL limit", () => {
    assert.deepEqual(recordSitemapShards(1_689), ["all"]);
    assert.equal(recordSitemapShards(413_975).length, 16);
    assert.ok(413_975 / 16 < 50_000);
    assert.equal(recordSitemapShards(900_000).length, 256);
    assert.ok(recordSitemapShards(900_000).every(isRecordShard));
    assert.ok(!isRecordShard("xyz") && !isRecordShard("000"));
  });

  it("a file is read in API shards of at most ~2 500 records (the API answers within 20 s)", () => {
    assert.deepEqual(requestShards("all", 1_689), [""]);
    assert.equal(requestShards("all", 23_075).length, 16);
    assert.deepEqual(requestShards("a", 413_975).slice(0, 2), ["a0", "a1"]);
    assert.equal(requestShards("a", 413_975).length, 16);
    assert.deepEqual(requestShards("a", 30_000), ["a"]);
    assert.deepEqual(requestShards("0f", 900_000), ["0f"]);
  });

  it("only home datasets list records", () => {
    assert.equal(homeDatasetType("items"), "item");
    assert.equal(homeDatasetType("npcs"), "creature");
    assert.equal(homeDatasetType("weapons"), undefined);
  });

  it("datasets hidden from players and the client's bookkeeping records stay out", () => {
    assert.ok(datasetHasRecordSitemap("items") && datasetHasRecordSitemap("achievements"));
    for (const hidden of ["quest-reward-packages", "ui-maps", "weapons", "nosuch"]) assert.ok(!datasetHasRecordSitemap(hidden), hidden);
    for (const slug of ["10-2-7-timewalking-season-artifact-cloak-haste", "12-x-professions-tracker", "conversation-dnt", "test-item", "zzold-sword"]) assert.ok(internalRecordSlug(slug), slug);
    for (const slug of ["battle-horn", "temple-of-elune", "1000-needles", "thunderfury-blessed-blade-of-the-windseeker", "7th-legion-battle-standard"]) assert.ok(!internalRecordSlug(slug), slug);
    // Classes and specializations a player cannot pick are `noindex` pages (isInternalRecord): not in the files either.
    for (const [type, slug] of [["class", "adventurer"], ["class", "traveler"], ["specialization", "initial"], ["specialization", "cunning"]]) assert.ok(internalRecordSlug(slug, type), slug);
    for (const [type, slug] of [["class", "hunter"], ["specialization", "frost"], ["item", "cunning"], ["spell", "initial"]]) assert.ok(!internalRecordSlug(slug, type), `${type} ${slug}`);
    assert.equal(recordSitemapUrls([{ id: "00000000-0000-4000-8000-000000000003", type: "specialization", slug: "cunning", slugRu: "хитрость" }], "ru").length, 0);
    const urls = recordSitemapUrls([
      { id: "00000000-0000-4000-8000-000000000001", type: "currency", slug: "10-2-7-timewalking-season-artifact-cloak-haste", slugRu: null },
      { id: "00000000-0000-4000-8000-000000000002", type: "currency", slug: "honor", slugRu: "очки-чести" },
    ], "en");
    assert.equal(urls.length, 1);
    assert.match(urls[0], /\/library\/currencies\/00000000-0000-4000-8000-000000000002\/honor</);
  });

  it("English lists every record, Russian only records with a Russian slug; each names its twins", () => {
    const entries = [
      { id: "00000000-0000-4000-8000-000000000001", type: "mount", slug: "swift-gryphon", slugRu: "быстрый-грифон", updatedAt: "2026-11-01T10:00:00Z" },
      { id: "00000000-0000-4000-8000-000000000002", type: "talent", slug: "package-1", slugRu: null },
    ];
    const en = recordSitemapUrls(entries, "en");
    const ru = recordSitemapUrls(entries, "ru");
    assert.equal(en.length, 2);
    assert.equal(ru.length, 1);
    assert.match(en[0], /<loc>https:\/\/wowarcana\.com\/library\/mounts\/00000000-0000-4000-8000-000000000001\/swift-gryphon<\/loc><lastmod>2026-11-01<\/lastmod>/);
    assert.match(en[0], /hreflang="ru" href="https:\/\/wowarcana\.com\/ru\/library\/mounts\/00000000-0000-4000-8000-000000000001\/%D0%B1/);
    assert.doesNotMatch(en[1], /hreflang="ru"/);
    assert.match(en[1], /\/library\/records\//, "a type without a dataset opens under records");
    assert.match(ru[0], /<loc>https:\/\/wowarcana\.com\/ru\/library\/mounts\//);
  });

  it("an API without Russian slugs is recognised (it also lists records the library does not serve)", () => {
    assert.equal(entriesHaveLocales([{ id: "x", type: "class", slug: "mage" }]), false);
    assert.equal(entriesHaveLocales([{ id: "x", type: "class", slug: "mage", slugRu: "маг" }]), true);
  });
});

describe("related links of a spec", () => {
  it("every spec theme has a spec page under its class", () => {
    for (const theme of talentSpecThemes) {
      const spec = midnightSpecializations.find((entry) => entry.slug === theme.slug);
      assert.ok(spec, theme.slug);
      // The spec leaderboard and the talents hero derive the class from its English name.
      assert.equal(theme.className.toLowerCase().replace(/[^a-z]+/g, "-"), spec.classSlug, theme.slug);
      const [page] = specLinkTargets("en", spec);
      assert.equal(page.href, `/wow/classes/${spec.classSlug}/${spec.slug}`);
    }
  });
  it("the page the reader is on is left out", () => {
    assert.deepEqual(specLinkTargets("ru", { slug: "holy-priest", classSlug: "priest" }, ["spec", "talents", "leaderboard"]).map((link) => link.href),
      ["/ru/tier-lists", "/ru/tier-lists/raid", "/ru/wow/mythic-plus/meta"]);
  });
});
