import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuditGearItem } from "../../lib/wow/characterAudit.ts";
import type { AuctionGearRecommendationGroup } from "../../lib/wow/auctionGearRecommendations.ts";
import type { FarmActivity, GearFarmResult } from "../../lib/wow/gearFarm/types.ts";
import { formatGoldRate } from "../../components/wow/audit/auctionFormat.ts";
import { buildUpgradePlan, filterUpgradePlan, rankedFarmActivities, upgradeFilterCounts, upgradeSlotOf } from "../../lib/wow/upgradePlan.ts";

/** A Battle.net-shaped item: slotType present, enchant missing when Blizzard reports none, sockets as reported. */
const item = (slotType: string, itemLevel: number, extra: Partial<AuditGearItem["details"]> = {}): AuditGearItem => ({
  slotType, slot: slotType, name: `Item ${slotType}`, itemLevel, iconUrl: "", state: "good",
  details: { quality: "Редкий", binding: "", category: slotType, secondaries: [], source: "", audit: { impact: "", nextStep: "" }, ...extra },
});
const empty = { color: "prismatic" as const, gem: "", effect: "", filled: false };
const filled = { ...empty, filled: true };

// The shape of a real low-level character (item levels 158–189, no enchants, two empty sockets).
const gear = [
  item("HEAD", 180), item("NECK", 183, { sockets: [empty] }), item("SHOULDER", 180), item("CHEST", 189), item("WAIST", 187),
  item("LEGS", 180), item("FEET", 189), item("WRIST", 187), item("HANDS", 180), item("FINGER_1", 183, { sockets: [empty] }),
  item("FINGER_2", 189), item("TRINKET_1", 174), item("TRINKET_2", 158), item("BACK", 187), item("MAIN_HAND", 189), item("OFF_HAND", 180),
  item("TABARD", 1),
];

const target = (slotType: string, deltaPercent: number, extra: object = {}) => ({
  itemId: Math.round(deltaPercent * 1000), entityId: "e", name: `Reward ${slotType}`, slotType, currentItemId: 1, currentItemLevel: 180,
  encounterId: 1, encounterName: "Boss", verification: "simulated" as const, deltaDps: deltaPercent * 1000, deltaPercent, marginPercent: 0.1, ...extra,
});
const activity = (id: string, group: "dungeon" | "raid", targets: ReturnType<typeof target>[], access: FarmActivity["access"] = "level_condition_met"): FarmActivity => ({
  id, name: id, slug: id, difficulty: "normal", access, group, sourceUrl: "", sourceVerifiedAt: "", targets, lootItemsChecked: targets.length, variantsUnverified: 0,
});
const farm = (activities: FarmActivity[]): GearFarmResult => ({
  character: { name: "C", level: 88, equippedItemLevel: 182, specId: 258 }, activities, checkedAt: "", profileFingerprint: "",
  coverage: { instancesChecked: 1, lootItemsChecked: 1, exactVariants: 1, simulations: 1, searchLimited: false },
});

describe("upgrade plan", () => {
  it("lists every equipped slot once, cosmetic slots excluded, weakest first", () => {
    const plan = buildUpgradePlan({ gear, averageItemLevel: 182 });
    assert.equal(plan.length, 16);
    assert.deepEqual(plan.slice(0, 2).map((row) => [row.slotType, row.gap]), [["TRINKET_2", 24], ["TRINKET_1", 8]]);
    assert.ok(plan.every((row) => row.best === null));
  });

  it("marks empty sockets and missing enchants only where an enchant is certain", () => {
    const plan = new Map(buildUpgradePlan({ gear, averageItemLevel: 182 }).map((row) => [row.slotType, row]));
    assert.equal(plan.get("NECK")!.emptySockets, 1);
    assert.equal(plan.get("FINGER_1")!.missingEnchant, true);
    assert.equal(plan.get("CHEST")!.missingEnchant, true);
    for (const slot of ["HEAD", "SHOULDER", "BACK", "WRIST", "HANDS", "WAIST", "TRINKET_1", "NECK"] as const) assert.equal(plan.get(slot)!.missingEnchant, false, slot);
    // A Battle.net off-hand may be a held item or a shield: no enchant alarm without weapon facts.
    assert.equal(plan.get("OFF_HAND")!.missingEnchant, false);
    const weaponOffHand = buildUpgradePlan({ gear: [item("OFF_HAND", 180, { weapon: { damage: "1", speed: "2", dps: "3" } })], averageItemLevel: 180 });
    assert.equal(weaponOffHand[0].missingEnchant, true);
    const enchanted = buildUpgradePlan({ gear: [item("CHEST", 180, { enchant: { name: "E", effect: "", active: true }, sockets: [filled] })], averageItemLevel: 180 });
    assert.equal(enchanted[0].missingEnchant, false);
    assert.equal(enchanted[0].emptySockets, 0);
  });

  it("maps fixture slot names that carry no slot type", () => {
    assert.equal(upgradeSlotOf({ slot: "Кольцо 2" }), "FINGER_2");
    assert.equal(upgradeSlotOf({ slot: "Гербовая накидка", slotType: "TABARD" }), null);
  });

  it("puts confirmed replacements first by gain and ignores unconfirmed or locked rewards", () => {
    const result = farm([
      activity("dungeon", "dungeon", [target("WAIST", 0.6), target("HEAD", 0.05, { marginPercent: 0.2 }), target("HANDS", 2, { verification: "item_level" })]),
      activity("locked raid", "raid", [target("FEET", 9)], "level_locked"),
      activity("raid", "raid", [target("TRINKET_2", 3.1)]),
    ]);
    const auction: AuctionGearRecommendationGroup[] = [{
      slotType: "WAIST",
      best: { optionId: "a", slotType: "WAIST", lotCostCopper: 5_000_000, comparison: { deltaDps: 900, deltaPercent: 0.9 } } as AuctionGearRecommendationGroup["best"],
      alternatives: [],
    }];
    const plan = buildUpgradePlan({ gear, averageItemLevel: 182, farm: result, auction });
    assert.deepEqual(plan.slice(0, 2).map((row) => [row.slotType, row.best?.kind, row.best?.deltaPercent]), [["TRINKET_2", "raid", 3.1], ["WAIST", "auction", 0.9]]);
    assert.equal(plan[1].sources.length, 2);
    assert.equal(plan[1].best?.priceCopper, 5_000_000);
    const bySlot = new Map(plan.map((row) => [row.slotType, row]));
    assert.equal(bySlot.get("HEAD")!.best, null, "gain within the margin");
    assert.equal(bySlot.get("HANDS")!.best, null, "not simulated");
    assert.equal(bySlot.get("FEET")!.best, null, "locked activity");
  });

  it("filters weak spots, fixes and replacements with matching counts", () => {
    const plan = buildUpgradePlan({ gear, averageItemLevel: 182, farm: farm([activity("raid", "raid", [target("WAIST", 1)])]) });
    const counts = upgradeFilterCounts(plan);
    assert.deepEqual(counts, { all: 16, attention: 14, fixes: 7, sources: 1 });
    for (const filter of ["attention", "fixes", "sources", "all"] as const) assert.equal(filterUpgradePlan(plan, filter).length, counts[filter], filter);
    assert.ok(!filterUpgradePlan(plan, "attention").some((row) => row.slotType === "BACK"), "on par, nothing to fix, no replacement");
  });

  it("ranks dungeon and raid activities by their best confirmed reward", () => {
    const ranked = rankedFarmActivities([
      activity("a", "dungeon", [target("HEAD", 0.4), target("NECK", 1.2)]),
      activity("b", "raid", [target("FEET", 2.5)]),
      activity("c", "dungeon", [target("HANDS", 3, { verification: "not_upgrade" })]),
    ]);
    assert.deepEqual(ranked.map((entry) => entry.id), ["b", "a"]);
    assert.deepEqual(ranked[1].targets.map((entry) => entry.slotType), ["NECK", "HEAD"]);
  });
});

describe("gold per +1 DPS", () => {
  it("rounds a derived price to hundredths and never shows a false zero", () => {
    assert.equal(formatGoldRate(7885, "en"), "0.79 gold");
    assert.equal(formatGoldRate(19_421, "en"), "1.94 gold");
    assert.equal(formatGoldRate(12_345_678, "en"), "1,234.57 gold");
    assert.equal(formatGoldRate(50, "en"), "<0.01 gold");
    assert.equal(formatGoldRate(7885, "ru"), "0,79 зол.");
  });
});
