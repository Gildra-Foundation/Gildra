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
