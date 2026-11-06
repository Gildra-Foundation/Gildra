import assert from "node:assert/strict";
import { test } from "node:test";
import { clampQuantity, compareTable, formatRatio, groupedOrder } from "../../../lib/wow/auctionMarketCompare.ts";
import { nextCompareSort, readAuctionView, writeAuctionView } from "../../../components/wow/auction/auctionState.ts";

const row = (itemId: number, name: string, minPrice: number, medianPrice: number, quantity: number, ladder?: [number, number][], rank: number | null = null) =>
  ({ itemId, name, rank, minPrice, medianPrice, quantity, ladder });

test("best value per column: lowest prices and cost, most units; equal columns have no mark", () => {
  const rows = compareTable([
    row(1, "Ore", 100, 150, 500, [[100, 50], [150, 450]]),
    row(2, "Herb", 80, 200, 900, [[80, 10], [200, 890]]),
    row(3, "Cloth", 120, 120, 500, [[120, 500]]),
  ], 100);
  const by = (id: number) => rows.find(entry => entry.item.itemId === id)!;
  assert.equal(by(2).best.min, true); assert.equal(by(1).best.min, false);
  assert.equal(by(3).best.median, true);
  assert.equal(by(2).best.quantity, true);
  // 100 units: ore 50×100+50×150 = 12 500; herb 10×80+90×200 = 18 800; cloth 12 000.
  assert.equal(by(3).best.cost, true); assert.equal(by(3).cost?.total, 12_000);
  assert.equal(by(3).ratio, 1);
  assert.ok(Math.abs(by(1).ratio! - 12_500 / 12_000) < 1e-9);
  const same = compareTable([row(1, "A", 5, 5, 5, [[5, 5]]), row(2, "B", 5, 5, 5, [[5, 5]])], 1);
  assert.deepEqual(same.map(entry => entry.best), [{ min: false, median: false, quantity: false, cost: false }, { min: false, median: false, quantity: false, cost: false }]);
});

test("a purchase the market cannot fill is never the cheapest and sorts last by cost", () => {
  const rows = compareTable([row(1, "Rare", 10, 10, 5, [[10, 5]]), row(2, "Common", 50, 50, 1000, [[50, 1000]])], 100, "cost", "asc");
  assert.equal(rows[0].item.itemId, 2); assert.equal(rows[0].best.cost, true);
  assert.equal(rows[1].short, true); assert.equal(rows[1].cost?.bought, 5); assert.equal(rows[1].best.cost, false);
});

test("rows wait for price levels without inventing a cost", () => {
  const [entry] = compareTable([row(1, "Ore", 10, 12, 100)], 20);
  assert.equal(entry.cost, null); assert.equal(entry.ratio, null); assert.equal(entry.short, false);
});

test("ranks of one item are grouped in picking order, lowest rank first", () => {
  const order = groupedOrder([row(5, "Ore", 1, 1, 1, undefined, 2), row(9, "Herb", 1, 1, 1), row(4, "ore", 1, 1, 1, undefined, 1)]);
  assert.deepEqual(order.map(item => item.itemId), [4, 5, 9]);
  const rows = compareTable([row(5, "Ore", 2, 2, 1, undefined, 2), row(9, "Herb", 1, 1, 1), row(4, "Ore", 1, 1, 1, undefined, 1)], 10);
  assert.deepEqual(rows.map(entry => [entry.item.itemId, entry.group.size, entry.group.start, entry.group.end]), [[4, 2, true, false], [5, 2, false, true], [9, 1, true, true]]);
});

test("ratio text: percent up to double, a multiple beyond, nothing for the cheapest", () => {
  assert.equal(formatRatio(1, "en"), null);
  assert.equal(formatRatio(1.38, "en"), "+38%");
  assert.equal(formatRatio(1.38, "ru"), "+38 %");
  assert.equal(formatRatio(3.72, "en"), "×3.7");
  assert.equal(formatRatio(3.72, "ru"), "×3,7");
  assert.equal(formatRatio(491.2, "en"), "×491");
});

test("units to buy and the compare sort live in the address", () => {
  const view = readAuctionView(new URLSearchParams("items=5,6&view=compare&qty=1000&csort=-cost"));
  assert.equal(view.qty, 1000); assert.equal(view.csort, "cost"); assert.equal(view.cdir, "desc");
  assert.equal(writeAuctionView(view).toString(), "items=5%2C6&view=compare&qty=1000&csort=-cost");
  const plain = readAuctionView(new URLSearchParams("items=5&view=compare&qty=abc&csort=bogus"));
  assert.equal(plain.qty, 100); assert.equal(plain.csort, "");
  assert.equal(writeAuctionView(plain).toString(), "items=5&view=compare");
  assert.equal(readAuctionView(new URLSearchParams("qty=9999999")).qty, 1_000_000);
  assert.equal(clampQuantity(0), 1);
  assert.deepEqual(nextCompareSort({ csort: "", cdir: "asc" }, "quantity"), { csort: "quantity", cdir: "desc" });
  assert.deepEqual(nextCompareSort({ csort: "cost", cdir: "asc" }, "cost"), { csort: "cost", cdir: "desc" });
});
