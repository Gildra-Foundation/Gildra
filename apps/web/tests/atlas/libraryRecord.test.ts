import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bossNeighbours, encounterInstance, instanceBosses, itemLevelCell, lootLookups, lootRows, mapLimit, relationGroups, sameName,
  type LootFacts, type Relationship,
} from "../../components/database/recordSections.ts";
import { formatQuestText, playerText } from "../../lib/gameText.ts";
import { itemStatNames } from "../../components/database/itemStats.ts";

let next = 0;
const rel = (direction: Relationship["direction"], relation: string, entity: Partial<Relationship["entity"]>, attributes: Record<string, unknown> = {}): Relationship => {
  next += 1;
  return { direction, relation, attributes, entity: { id: `id-${next}`, type: "item", externalId: next, name: `Record ${next}`, ...entity } };
};

describe("library record: game text", () => {
  it("reads values the catalog could not resolve as X, in both languages", () => {
    assert.equal(playerText("Deals a game-defined value Fire damage to a random enemy.", "en"), "Deals X Fire damage to a random enemy.");
    assert.equal(playerText("Наносит значение, определяемое игрой ед. урона от огня.", "ru"), "Наносит X ед. урона от огня.");
    assert.equal(playerText("снижая скорость атаки на значение, определяемое игрой% в течение 12 сек.", "ru"), "снижая скорость атаки на X% в течение 12 сек.");
    assert.equal(playerText("Riding him is  truly a feat.", "en"), "Riding him is truly a feat.");
  });

  it("addresses the player as the game does, not with template braces", () => {
    assert.equal(formatQuestText("Meet me by Dreadmaul, {class}. Thanks, {name}!", "en"), "Meet me by Dreadmaul, hero. Thanks, adventurer!");
    assert.equal(playerText("Спасибо, {name}.", "ru"), "Спасибо, герой.");
  });

  it("names the stats of an item whose build gives types without values", () => {
    const variants = [{ key: "base", stats: [] }, { key: "raidbots:encounter", stats: [{ type: 7, value: null }, { type: 73, value: null }, { type: 36, value: null }, { type: 7, value: null }, { type: 999 }] }];
    assert.deepEqual(itemStatNames(variants, "en"), ["Agility / Intellect", "Stamina", "Haste"]);
    assert.deepEqual(itemStatNames([{ stats: [] }], "en"), []);
  });
});

describe("library record: related groups", () => {
  it("leaves client placeholders out and shows a record once, in the group a player looks for first", () => {
    const recipe = { id: "recipe", type: "recipe", name: "Thunderfury" };
    const groups = relationGroups([
      rel("incoming", "creates", recipe),
      rel("incoming", "creates", { name: "TK34[DNT]", type: "recipe" }),
      rel("outgoing", "obtained_from", recipe),
      rel("incoming", "rewards", { type: "quest", name: "Rise, Thunderfury!" }),
    ]);
    assert.deepEqual(groups.map((group) => group.key), ["outgoing:obtained_from", "incoming:rewards"]);
    assert.equal(groups[0].entries[0].entity.id, "recipe");
  });
});

describe("library record: instances and bosses", () => {
  const instance = { id: "mc", type: "instance", name: "Molten Core" };
  const bosses = [
    rel("incoming", "belongs_to", { id: "rag", type: "encounter", name: "Ragnaros" }, { order_index: 10 }),
    rel("incoming", "belongs_to", { id: "luc", type: "encounter", name: "Lucifron" }, { order_index: 1 }),
    rel("incoming", "belongs_to", { id: "mag", type: "encounter", name: "Magmadar" }, { order_index: 2 }),
  ];

  it("lists the bosses in the Adventure Guide's order", () => {
    assert.deepEqual(instanceBosses(bosses).map((entry) => entry.entity.name), ["Lucifron", "Magmadar", "Ragnaros"]);
  });

  it("steps from a boss to the ones before and after it", () => {
    assert.deepEqual(Object.values(bossNeighbours(bosses, "mag")).map((boss) => boss?.name), ["Lucifron", "Ragnaros"]);
    assert.deepEqual(Object.values(bossNeighbours(bosses, "luc")).map((boss) => boss?.name), [undefined, "Magmadar"]);
    assert.deepEqual(Object.values(bossNeighbours(bosses, "unknown")), [undefined, undefined]);
    assert.equal(encounterInstance([rel("outgoing", "belongs_to", instance)])?.name, "Molten Core");
  });

  it("matches a creature and a boss by their exact name", () => {
    assert.ok(sameName("Ragnaros", " ragnaros "));
    assert.ok(!sameName("Ragnaros", "Lil' Ragnaros"));
    assert.ok(!sameName("", ""));
  });
});

describe("library record: loot table", () => {
  const loot = [
    rel("incoming", "obtained_from", { id: "crown-37", name: "Crown of Flame", itemLevel: 37 }),
    rel("incoming", "obtained_from", { id: "crown-60", name: "Crown of Flame", itemLevel: 60, iconUrl: "https://api.gildra.net/v1/media/crown" }),
    rel("incoming", "obtained_from", { id: "sulfuras", name: "Sulfuras, the Extinguished Hand", itemLevel: 37, quality: 4 }),
    rel("incoming", "obtained_from", { id: "egg", name: "Smoldering Egg of Millagazor", itemLevel: 1 }),
    rel("incoming", "obtained_from", { id: "dnt", name: "TK34[DNT]" }),
    rel("outgoing", "belongs_to", { id: "fl", type: "instance", name: "Firelands" }),
  ];
  const facts = new Map<string, LootFacts>([
    ["crown-60", { quality: 4, slotCode: 1, slot: "Head", kind: "Mail" }],
    ["sulfuras", { slotCode: 17, slot: "Two-Hand", kind: "Two-Handed Mace" }],
  ]);

  it("shows one row per piece with its item levels, linked to the highest one, in paper-doll order", () => {
    const rows = lootRows(loot, facts);
    assert.deepEqual(rows.map((row) => row.name), ["Crown of Flame", "Sulfuras, the Extinguished Hand", "Smoldering Egg of Millagazor"]);
    assert.equal(rows[0].id, "crown-60");
    assert.deepEqual(rows[0].itemLevels, [37, 60]);
    assert.equal(itemLevelCell(rows[0].itemLevels), "37 / 60");
    assert.deepEqual([rows[0].quality, rows[0].slot, rows[0].kind], [4, "Head", "Mail"]);
    assert.equal(rows[1].quality, 4, "the summary's quality stays when the record adds none");
    assert.equal(itemLevelCell(rows[2].itemLevels), undefined, "item level 1 is no level for a player");
  });

  it("reads in full only the rows that still lack a fact, up to a limit", () => {
    const rows = lootRows(loot, facts);
    assert.deepEqual(lootLookups(rows), ["egg"]);
    assert.deepEqual(lootLookups(rows, 0), []);
  });
});

describe("library record: bounded reads", () => {
  it("keeps every result in place and turns a failure into an empty slot", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      if (value === 3) throw new Error("slow");
      return value * 10;
    });
    assert.deepEqual(results, [10, 20, undefined, 40, 50]);
    assert.ok(peak <= 2);
  });
});
