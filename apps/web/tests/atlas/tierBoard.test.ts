import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fromTierEntry, groupByTier, listColumns, specInfo, tierWeight } from "../../components/blocks/wow/tierWorkspace/tierBoardRows.ts";
import type { TierEntry } from "../../lib/platform/games/intelligence.ts";

const entry = (rank: number, tier: string, extra: Partial<TierEntry> = {}): TierEntry => ({
  rank, tier, role: "dps", className: "Mage", classSlug: "mage", specName: `Spec ${rank}`, specSlug: `spec-${rank}`, sourceUrl: "", ...extra,
});

describe("tier board rows", () => {
  it("orders tiers S+ … F with unknown labels last", () => {
    const labels = ["B", "A", "S", "A+", "F", "?", "S+", "A-", "D", "C"];
    assert.deepEqual([...labels].sort((a, b) => tierWeight(a) - tierWeight(b)), ["S+", "S", "A+", "A", "A-", "B", "C", "D", "F", "?"]);
  });

  it("groups by tier label and keeps the source order inside a row", () => {
    const rows = groupByTier([entry(3, "A"), entry(1, "S"), entry(2, "A+"), entry(5, "a"), entry(4, "A")]);
    assert.deepEqual(rows.map((row) => [row.tier, row.entries.map((item) => item.rank)]), [["S", [1]], ["A+", [2]], ["A", [3, 4, 5]]]);
  });

  it("treats a published popularity of 0 and a missing max key as absent", () => {
    const board = fromTierEntry(entry(1, "S", { popularity: 0, maxKey: 0, score: 10, averageDps: 5 }), {});
    assert.equal(board.popularity, undefined);
    assert.equal(board.maxKey, undefined);
    assert.equal(board.rate, 5);
    const columns = listColumns([board]);
    assert.deepEqual([columns.score, columns.rate, columns.popularity, columns.maxKey, columns.trend, columns.sim], [true, true, false, false, false, false]);
  });

  it("uses HPS for healers and the localized names, hero trees and talents slug of the spec", () => {
    const names = { "frost-mage": { specName: "Лёд", className: "Маг", heroes: ["Ткач заклинаний", "Буревестник"] as [string, string], talents: "frost-mage" } };
    const board = fromTierEntry(entry(1, "A", { role: "healer", specSlug: "frost", averageHps: 9, averageDps: 3 }), names);
    assert.equal(board.rate, 9);
    assert.equal(board.specName, "Лёд");
    assert.equal(specInfo(names, "mage", "frost")?.talents, "frost-mage");
    assert.equal(specInfo(names, "mage", "fire"), undefined);
  });
});

import { listParams, sourceKey, isTierMode, isBracket } from "../../components/blocks/wow/tierWorkspace/tierSourceKeys.ts";

describe("tier source requests", () => {
  it("keys a list by every part its mode uses", () => {
    assert.equal(sourceKey({ source: "wowhead", mode: "mythic_plus" }), "wowhead|mythic_plus");
    assert.equal(sourceKey({ source: "ugg", mode: "raid", difficulty: "raid_myth" }), "ugg|raid|raid_myth");
    assert.equal(sourceKey({ source: "gildra", mode: "pvp", bracket: "shuffle", region: "eu" }), "gildra|pvp|shuffle|eu");
    assert.notEqual(sourceKey({ source: "gildra", mode: "pvp", bracket: "3v3" }), sourceKey({ source: "gildra", mode: "pvp", bracket: "2v2" }));
  });

  it("asks the API for the source, bracket and region of the open tab", () => {
    assert.equal(listParams({ source: "gildra", mode: "pvp", bracket: "blitz", region: "all" }, "healer").toString(), "activity=pvp&role=healer&limit=60&bracket=blitz");
    assert.equal(listParams({ source: "murlok", mode: "pvp", bracket: "rbg", region: "us" }, "dps").toString(), "activity=pvp&role=dps&limit=60&source=murlok&bracket=rbg&region=us");
    // Only u.gg and wow.gg split raids by difficulty.
    assert.equal(listParams({ source: "wowhead", mode: "raid", difficulty: "raid_myth" }, "tank").get("difficulty"), null);
    assert.equal(listParams({ source: "wowgg", mode: "raid", difficulty: "raid_myth" }, "tank").get("difficulty"), "raid_myth");
    const slice = listParams({ source: "wowgg", mode: "mythic_plus", selection: { type: "dungeon", id: "12", addon: "midnight", keyType: "high" } }, "dps");
    assert.deepEqual([slice.get("selectionType"), slice.get("selectionId"), slice.get("keyType")], ["dungeon", "12", "high"]);
  });

  it("accepts only known modes and brackets from the URL", () => {
    assert.equal(isTierMode("pvp"), true);
    assert.equal(isTierMode("arena"), false);
    assert.equal(isBracket("shuffle"), true);
    assert.equal(isBracket("5v5"), false);
  });

  it("reads the arena numbers and the source's change marker", () => {
    const board = fromTierEntry(entry(1, "S", { rating: 2650.5, players: 120, winRate: 0.56, change: "up", sources: 7 }), {});
    assert.deepEqual([board.rating, board.players, board.winRate, board.change, board.sources], [2650.5, 120, 0.56, "up", 7]);
    const columns = listColumns([board]);
    assert.deepEqual([columns.rating, columns.players, columns.winRate, columns.change], [true, true, true, true]);
  });
});
