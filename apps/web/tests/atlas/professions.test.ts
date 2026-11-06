import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { buyCost, planRoute, profitRows, recipeFloor, shoppingList, skillBand, skillUpChance, specializationUnlocks, treasureMacro, wayCommand } from "../../lib/wow/professions/leveling.ts";
import type { ProfessionData, ProfessionItem, ProfessionPrices, ProfessionRecipe } from "../../lib/wow/professions/types.ts";
import { parseHandyNotesKnowledge, parseWowheadSpellList } from "../../scripts/wow-professions-parsers.mjs";
import { applyRecipeSources, parseCost, parseDiscovery, parseListviewTab, parseRenown } from "../../scripts/wow-profession-sources.mjs";

const dataDir = new URL("../../data/wow/professions/", import.meta.url);
const fixtures = new URL("../professions/fixtures/", import.meta.url);

const recipe = (id: number, over: Partial<ProfessionRecipe>): ProfessionRecipe => ({
  id, spell: id, name: { en: `R${id}`, ru: `R${id}` }, category: { en: "", ru: "" }, yellow: 50, grey: 100, ups: 1, source: "trainer", reagents: [[1, 1]], ...over,
});
const items: Record<string, ProfessionItem> = {
  1: { name: { en: "Herb", ru: "Трава" }, icon: null, quality: 1, ranks: [1, 2] },
  3: { name: { en: "Vial", ru: "Флакон" }, icon: null, quality: 1, vendor: 50 },
  9: { name: { en: "Potion", ru: "Зелье" }, icon: null, quality: 1, ranks: [9, 10] },
};
const prices: ProfessionPrices = {
  1: { min: 100, median: 110, quantity: 10, ladder: [[100, 4], [120, 6]] },
  2: { min: 90, median: 95, quantity: 1000, ladder: [[90, 1000]] },
  9: { min: 1000, median: 1100, quantity: 50, ladder: [[1000, 50]] },
};

describe("profession leveling", () => {
  it("skill-up chance: certain before yellow, falling to zero at grey", () => {
    const r = { yellow: 25, grey: 60 };
    assert.equal(skillUpChance(r, 1), 1);
    assert.equal(skillUpChance(r, 24), 1);
    assert.equal(skillUpChance(r, 25), 1);
    assert.ok(Math.abs(skillUpChance(r, 42) - 18 / 35) < 1e-9);
    assert.equal(skillUpChance(r, 60), 0);
  });

  it("recipes unlocked later are used from 20 points before yellow", () => {
    assert.equal(recipeFloor({ source: "trainer", yellow: 90 }), 1);
    assert.equal(recipeFloor({ source: "research", yellow: 90 }), 70);
    assert.equal(recipeFloor({ source: "vendor", yellow: 10 }), 1);
  });

  it("a recipe item's skill requirement sets the floor when known", () => {
    assert.equal(recipeFloor({ source: "vendor", yellow: 25, learn: { skill: 10 } }), 10);
    assert.equal(recipeFloor({ source: "trainer", yellow: 25 }), 1);
  });

  it("difficulty band: orange to yellow, green from the middle, grey from grey", () => {
    assert.deepEqual(skillBand({ yellow: 60, grey: 80 }), { orange: 0, yellow: 60, green: 70, grey: 80 });
  });

  it("finds the specialization node that teaches a recipe", () => {
    const leaf = { id: 2, name: { en: "Leaf", ru: "Лист" }, text: { en: "", ru: "" }, ranks: 20, perks: [{ at: 5, text: { en: "", ru: "" }, recipe: 77 }], children: [] };
    const root = { id: 1, name: { en: "Root", ru: "Корень" }, text: { en: "", ru: "" }, ranks: 30, perks: [{ at: 1, text: { en: "", ru: "" }, recipe: 66 }], children: [leaf] };
    const unlocks = specializationUnlocks([root]);
    assert.deepEqual(unlocks[77], { tree: root.name, node: leaf.name, at: 5 });
    assert.equal(unlocks[66].node.en, "Root");
  });

  it("takes the cheapest recipe per point, merges levels and counts crafts", () => {
    const cheap = recipe(1, { yellow: 30, grey: 40, reagents: [[1, 1]] });
    const dear = recipe(2, { yellow: 100, grey: 100, reagents: [[1, 5]] });
    const route = planRoute([cheap, dear], items, prices, { from: 1, to: 100 });
    assert.equal(route.reached, 100);
    assert.equal(route.steps[0].recipe.id, 1);
    assert.equal(route.steps[0].from, 1);
    assert.equal(route.steps.at(-1)!.recipe.id, 2);
    assert.equal(route.steps.at(-1)!.to, 100);
    // Below yellow every craft is one point.
    assert.ok(route.steps[0].crafts >= route.steps[0].to - route.steps[0].from);
    // Cheapest rank: rank 2 at 90 copper.
    assert.equal(route.steps[0].cost, 90 * route.steps[0].crafts);
  });

  it("stops where the chosen recipe sources stop giving skill", () => {
    const route = planRoute([recipe(1, { yellow: 20, grey: 30 }), recipe(2, { source: "vendor", yellow: 90 })], items, prices);
    assert.equal(route.reached, 30);
  });

  it("without prices the reagent count stands in for the cost", () => {
    const route = planRoute([recipe(1, { reagents: [[1, 3]] }), recipe(2, { reagents: [[1, 1]] })], items, {});
    assert.equal(route.priced, false);
    assert.equal(route.steps[0].recipe.id, 2);
    assert.equal(route.steps[0].cost, null);
  });

  it("shopping list buys the cheapest rank and walks the market ladder; stock lowers the bill", () => {
    const route = planRoute([recipe(1, { yellow: 6, grey: 6, reagents: [[1, 2], [3, 1]] })], items, prices, { to: 6 });
    const list = shoppingList(route.steps, items, prices);
    const herb = list.find((entry) => entry.item === 1)!;
    assert.equal(herb.qty, 10);
    assert.deepEqual(herb.buy, { item: 2, rank: 2, vendor: false });
    assert.deepEqual(buyCost(herb, 10, items, prices), { total: 900, short: 0 });
    assert.deepEqual(buyCost(herb, 10 - 4, items, prices), { total: 540, short: 0 });
    const vial = list.find((entry) => entry.item === 3)!;
    assert.equal(vial.buy?.vendor, true);
    assert.deepEqual(buyCost(vial, 5, items, prices), { total: 250, short: 0 });
  });

  it("profit is the sale of every unit after the 5% cut minus the reagents", () => {
    const rows = profitRows([recipe(7, { reagents: [[1, 2]], output: { item: 9, qty: 5, ranks: [9, 10] } })], items, prices);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].cost, 180);
    assert.equal(rows[0].revenue, 5 * 1000 * 0.95);
    assert.equal(rows[0].margin, 4750 - 180);
  });

  it("game commands fit the chat line", () => {
    assert.equal(wayCommand({ map: 2393, x: 47.8, y: 51.6 }, "Pristine Potion"), "/way #2393 47.8 51.6 Pristine Potion");
    const macro = treasureMacro([89117, 89115, 89111, 89114, 89116, 89113, 89118, 89112], { done: "есть", missing: "нет" });
    assert.ok(macro.length <= 255, `${macro.length} characters`);
  });
});

describe("professions builder parsers", () => {
  it("reads HandyNotes knowledge points with coordinates and flag quests", () => {
    const points = parseHandyNotesKnowledge(readFileSync(new URL("handynotes-alchemy.lua", fixtures), "utf8"),
      { SILVERMOONCITY: 2393, ZULAMAN: 2437, ATALAMAN: 2536, HARANDAR: 2413, VOIDSTORM: 2405, SLAYERSRISE: 2444, EVERSONGWOODS: 2395 });
    assert.equal(points.length, 8);
    assert.deepEqual(points[0], { map: 2393, x: 47.8, y: 51.6, quest: 89117, item: 238538 });
  });

  it("reads a Wowhead recipe list with its unquoted keys", () => {
    const list = parseWowheadSpellList(readFileSync(new URL("wowhead-alchemy-list.html", fixtures), "utf8"));
    const serum = list.find((entry: { id: number }) => entry.id === 1230868);
    assert.deepEqual(serum.source, [6]);
    assert.equal(serum.trainingcost, 1250000);
    assert.deepEqual(serum.colors, [0, 25, 42, 60]);
  });
});

describe("recipe sources", () => {
  const sells = `new Listview({template: 'item', id: 'sells', name: WH.TERMS.sells, data:[{"id":258305,"name":"Recipe: [x]","playerConditions":["Requires Renown Rank 5 with the Amani Tribe."],"cost":[[0,[[3256,150],[3316,1500]],[]]]}],\n});`;

  it("reads a vendor's sells tab with costs and renown conditions", () => {
    const [row] = parseListviewTab(sells, "sells") as { id: number; playerConditions: string[]; cost: unknown }[];
    assert.equal(row.id, 258305);
    assert.deepEqual(parseRenown(row.playerConditions.join(" ")), { faction: "Amani Tribe", rank: 5 });
    assert.deepEqual(parseCost(row.cost), { currencies: [[3256, 150], [3316, 1500]] });
    assert.deepEqual(parseCost([[2500000]]), { gold: 2500000 });
    assert.deepEqual(parseRenown("Requires Renown Rank 5 with the Hara'ti and to know Midnight Alchemy"), null);
    assert.deepEqual(parseRenown("Requires Renown Rank 5 with the Hara'ti and to know Midnight Alchemy."), { faction: "Hara'ti", rank: 5 });
  });

  it("reads the discovery station of a recipe tooltip", () => {
    assert.equal(parseDiscovery('<span class="q">Discovery: </span>Camberon\'s Cauldron<br />'), "Camberon's Cauldron");
    assert.equal(parseDiscovery("<b>Flask</b>"), null);
  });

  it("adds where a recipe is learned and moves a discovery with a vendor to vendor", () => {
    const place = { npc: 5, name: { en: "Magovu", ru: "Магову" }, zone: { en: "Zul'Aman", ru: "Зул'Аман" }, map: 2437, x: 45.8, y: 65.8 };
    const facts = {
      places: { 5: place }, currencies: { 3256: { name: { en: "Moxie", ru: "Пыл" }, icon: null } }, costItems: {}, factions: { "Amani Tribe": { en: "Amani Tribe", ru: "Племя Амани" } },
      recipes: { 10: { learnedAt: 10, vendors: [5], cost: { currencies: [[3256, 150]] }, renown: { faction: "Amani Tribe", rank: 5 } } },
    };
    const data = { slug: "x", recipes: [recipe(10, { source: "research" }), recipe(11, {})], items } as unknown as ProfessionData;
    const out = applyRecipeSources(data, facts) as ProfessionData;
    assert.equal(out.recipes[0].source, "vendor");
    assert.deepEqual(out.recipes[0].learn, { skill: 10, vendors: [place], cost: { currencies: [[3256, 150]] }, renown: { faction: { en: "Amani Tribe", ru: "Племя Амани" }, rank: 5 } });
    assert.equal(out.recipes[1].learn, undefined);
    assert.ok(out.currencies?.[3256]);
    assert.deepEqual(applyRecipeSources(out, facts), out);
  });
});

describe("professions data", () => {
  const files = readdirSync(dataDir).filter((file) => file.endsWith(".json") && file !== "index.json");
  const all = files.map((file) => JSON.parse(readFileSync(new URL(file, dataDir), "utf8")) as ProfessionData);

  it("has all thirteen Midnight professions", () => {
    assert.equal(all.length, 13);
    const index = JSON.parse(readFileSync(new URL("index.json", dataDir), "utf8")) as { slug: string }[];
    assert.deepEqual(index.map((p) => p.slug).sort(), all.map((p) => p.slug).sort());
  });

  for (const data of all) {
    it(`${data.slug}: recipes, items, trainer and knowledge are consistent`, () => {
      assert.ok(data.name.en && data.name.ru);
      assert.ok(data.trainer.x > 0 && data.trainer.x < 100 && data.trainer.y > 0 && data.trainer.y < 100);
      for (const r of data.recipes) {
        assert.ok(r.name.en, `recipe ${r.id} name`);
        assert.ok(r.grey >= r.yellow, `recipe ${r.id} range`);
        for (const [id, qty] of r.reagents) {
          assert.ok(qty > 0);
          assert.ok(data.items[id], `${data.slug}: reagent ${id} of ${r.name.en}`);
        }
      }
      for (const t of data.knowledge.treasures) {
        assert.ok(t.points > 0 && t.quest > 0 && data.items[t.item], `treasure ${t.item}`);
        assert.ok(t.x > 0 && t.x < 100 && t.y > 0 && t.y < 100);
      }
      if (data.kind !== "secondary") {
        assert.equal(data.knowledge.treasures.length, 8);
        assert.ok(data.specializations.length >= 3);
        assert.ok(data.knowledge.weekly.some((s) => s.kind === "treatise"));
      }
      for (const item of Object.values(data.items)) assert.ok(item.name.en && item.name.ru);
      for (const r of data.recipes.filter((x) => x.source === "vendor")) assert.ok(r.learn?.vendors?.length, `${data.slug}: vendor of ${r.name.en}`);
    });
  }
});
