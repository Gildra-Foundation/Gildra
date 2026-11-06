import assert from "node:assert/strict";
import { test } from "node:test";
import { auctionMarketQuery, parseAuctionListings } from "../../../lib/wow/auctionBrowser.ts";
import { auctionCategories, auctionCategory, inAuctionCategory } from "../../../lib/wow/auctionMarketCategories.ts";
import { compactLadder, ladderCost, ladderMedian, reagentRanks, sortSummaries, summarizeAuctions } from "../../../lib/wow/auctionMarketSummary.ts";
import { currentItems, nextSort, readAuctionView, toggleItem, writeAuctionView } from "../../../components/wow/auction/auctionState.ts";

const keys = auctionCategories.map(category => category.key);

test("one row per item: cheapest unit, quantity-weighted median, units listed; bids and pets never set a price", () => {
  const rows = parseAuctionListings({ auctions: [
    { id: 1, item: { id: 10 }, quantity: 5, unit_price: 300 },
    { id: 2, item: { id: 10 }, quantity: 1, unit_price: 100 },
    { id: 3, item: { id: 10 }, quantity: 4, unit_price: 300 },
    { id: 4, item: { id: 10 }, quantity: 90, unit_price: 900 },
    { id: 5, item: { id: 20 }, quantity: 2, unit_price: 50 },
  ] }, "commodities");
  const summary = summarizeAuctions(rows);
  assert.deepEqual(summary.get(10), { itemId: 10, minPrice: 100, medianPrice: 900, quantity: 100, lots: 4, ladder: [[100, 1], [300, 9], [900, 90]] });
  assert.equal(summary.get(20)?.medianPrice, 50);
  const realm = summarizeAuctions(parseAuctionListings({ auctions: [
    { id: 1, item: { id: 7 }, quantity: 3, buyout: 1000 },
    { id: 2, item: { id: 7 }, quantity: 1, bid: 10 },
    { id: 3, item: { id: 82800, pet_species_id: 4 }, quantity: 1, buyout: 5000 },
  ] }, "realm"));
  assert.deepEqual(realm.get(7)?.ladder, [[334, 3]], "a lot price per unit rounds up to whole copper");
  assert.equal(realm.get(7)?.lots, 1); assert.equal(realm.has(82800), false);
});

test("median, the cost of N units and the bounded ladder", () => {
  const ladder = [[100, 10], [200, 10], [300, 10]] as const;
  assert.equal(ladderMedian(ladder), 200);
  assert.deepEqual(ladderCost(ladder, 15), { total: 2000, bought: 15, average: 2000 / 15, highest: 200 });
  assert.deepEqual(ladderCost(ladder, 100), { total: 6000, bought: 30, average: 200, highest: 300 });
  assert.equal(ladderCost(ladder, 0).bought, 0);
  const long = Array.from({ length: 100 }, (_, i) => [i + 1, 1] as const);
  const compact = compactLadder(long, 10);
  assert.equal(compact.length, 10); assert.deepEqual(compact[8], [9, 1]);
  assert.equal(compact.reduce((sum, [, qty]) => sum + qty, 0), 100, "folded steps keep every unit");
});

test("reagent ranks only for same-name neighbours from The War Within on", () => {
  const ranks = reagentRanks([
    { itemId: 237364, name: "Brilliant Silver Ore", classId: 7, subclassId: 7 },
    { itemId: 237365, name: "Brilliant Silver Ore", classId: 7, subclassId: 7 },
    { itemId: 210930, name: "Bismuth", classId: 7, subclassId: 7 },
    { itemId: 190395, name: "Serevite Ore", classId: 7, subclassId: 7 },
    { itemId: 190396, name: "Serevite Ore", classId: 7, subclassId: 7 },
    { itemId: 230000, name: "Far Apart", classId: 7, subclassId: 7 },
    { itemId: 239000, name: "Far Apart", classId: 7, subclassId: 7 },
  ]);
  assert.equal(ranks.get(237364), 1); assert.equal(ranks.get(237365), 2);
  for (const id of [210930, 190395, 190396, 230000, 239000]) assert.equal(ranks.has(id), false, String(id));
});

test("sorting by a column keeps ranks of one reagent together", () => {
  const rows = [
    { itemId: 2, name: "B", minPrice: 5, medianPrice: 9, quantity: 1, rank: 2 },
    { itemId: 1, name: "B", minPrice: 5, medianPrice: 7, quantity: 3, rank: 1 },
    { itemId: 3, name: "A", minPrice: 9, medianPrice: 9, quantity: 2, rank: null },
  ];
  assert.deepEqual(sortSummaries(rows, "min", "asc", "en").map(row => row.itemId), [1, 2, 3]);
  assert.deepEqual(sortSummaries(rows, "quantity", "desc", "en").map(row => row.itemId), [1, 3, 2]);
  assert.deepEqual(sortSummaries(rows, "name", "asc", "en").map(row => row.itemId), [3, 1, 2]);
});

test("market query: exactly one of category, name or items; bounded compare list", () => {
  const q = (s: string) => auctionMarketQuery(new URLSearchParams(s), keys);
  assert.equal(q("category=ore").category, "ore");
  assert.deepEqual(q("items=3,1,2&realm=gordunni").items, [3, 1, 2]);
  assert.equal(q("q=Руда&lang=ru&limit=8").limit, 8);
  for (const s of ["", "category=ore&q=ore", "category=mounts", "items=1,1", "items=1,2,3,4,5,6,7,8,9", "items=0", "q=a", "limit=50&q=ore", "region=cn&category=ore", "realm=../x&category=ore"]) {
    assert.throws(() => q(s), /invalid_query/, s);
  }
});

test("categories map to the game's item classes", () => {
  const gems = auctionCategory("gems")!;
  assert(inAuctionCategory(gems, 3, 6)); assert(inAuctionCategory(gems, 7, 4)); assert(!inAuctionCategory(gems, 7, 7));
  assert.equal(auctionCategory("armor")?.market, "realm"); assert.equal(auctionCategory("ore")?.market, "commodities");
  assert.equal(new Set(keys).size, keys.length);
});

test("view state round-trips through the address and remembers the realm per region", () => {
  const view = readAuctionView(new URLSearchParams("region=us&realm=area-52&cat=herbs&items=5,6&view=compare&sort=min&dir=desc&all=1"));
  assert.equal(view.region, "us"); assert.equal(view.realm, "area-52"); assert.equal(view.category, "herbs");
  assert.deepEqual(view.items, [5, 6]); assert(view.compare); assert.equal(view.sort, "min"); assert.equal(view.dir, "desc"); assert(view.all);
  assert.equal(writeAuctionView(view).toString(), "region=us&realm=area-52&cat=herbs&all=1&sort=min&dir=desc&items=5%2C6&view=compare");
  const fresh = readAuctionView(new URLSearchParams(""), { region: "eu", realm: "gordunni" });
  assert.equal(fresh.category, "ore"); assert.equal(fresh.realm, "gordunni"); assert.equal(writeAuctionView(fresh).toString(), "realm=gordunni");
  assert.equal(readAuctionView(new URLSearchParams("region=us"), { region: "eu", realm: "gordunni" }).realm, "", "another region's realm is not reused");
  const search = readAuctionView(new URLSearchParams("q=ore&item=7&market=realm"));
  assert.equal(search.category, ""); assert.equal(search.item, 7); assert.equal(search.itemMarket, "realm");
  assert.equal(readAuctionView(new URLSearchParams("items=1,x,1,2")).items.join(), "1,2");
  assert.equal(readAuctionView(new URLSearchParams("view=compare")).compare, false, "an empty comparison is the list");
});

test("current expansion filter, sort clicks and the compare limit", () => {
  const rows = [{ level: 23 }, { level: 21 }, { level: 23 }, { level: null }];
  assert.deepEqual(currentItems(rows), { rows: [{ level: 23 }, { level: 23 }], split: true });
  assert.equal(currentItems([{ level: 23 }, { level: null }]).split, false);
  assert.deepEqual(nextSort({ sort: "", dir: "asc" }, "quantity"), { sort: "quantity", dir: "desc" });
  assert.deepEqual(nextSort({ sort: "min", dir: "asc" }, "min"), { sort: "min", dir: "desc" });
  assert.deepEqual(toggleItem([1, 2], 2), [1]);
  assert.deepEqual(toggleItem([1, 2, 3, 4, 5, 6, 7, 8], 9), [1, 2, 3, 4, 5, 6, 7, 8]);
});
