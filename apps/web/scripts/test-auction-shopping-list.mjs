import assert from "node:assert/strict";
import { buildAuctionShoppingRows } from "../lib/wow/auctionShoppingList.ts";
import { checkAuctionShoppingRows, remainingShoppingCost } from "../lib/wow/auctionShoppingCheck.ts";

const item = { auctionId: 99, itemId: 123, name: "Synthetic ring", variantKey: "exact-a", quantity: 2, lotCostCopper: 1000 };
const rows = buildAuctionShoppingRows([item, { ...item, slotType: "FINGER_2" }],
  [{ itemId: 456, kind: "gem", quantity: 3, quotedCopper: 400 }], { 456: "Synthetic gem" });
assert.equal(rows.length, 2, "One stack equipping two slots is paid once");
assert.equal(rows[0].quantity, 2);
const offer = { ...item, buyoutCopper: 1000 };
const prices = { 456: { ladder: [[100, 2], [200, 2]] } };
let checked = checkAuctionShoppingRows(rows, [], [offer], prices);
assert.deepEqual(checked.map(row => row.status), ["available", "available"]);
assert.equal(remainingShoppingCost(checked), 1400);
checked = checkAuctionShoppingRows(rows, [rows[0].key], [], prices);
assert.equal(checked[0].status, "purchased");
assert.equal(remainingShoppingCost(checked), 400);
checked = checkAuctionShoppingRows(rows, [], [{ ...offer, buyoutCopper: 1500 }], prices);
assert.equal(checked[0].status, "repriced");
assert.equal(remainingShoppingCost(checked), 1900);
for (const change of [{ variantKey: "other" }, { itemId: 124 }, { quantity: 1 }]) {
  checked = checkAuctionShoppingRows(rows, [], [{ ...offer, ...change }], prices);
  assert.equal(checked[0].status, "changed");
  assert.equal(remainingShoppingCost(checked), null);
}
checked = checkAuctionShoppingRows(rows, [], [{ ...offer, auctionId: 100 }], prices);
assert.equal(checked[0].status, "missing", "A similar replacement auction is never silently selected");
checked = checkAuctionShoppingRows(rows, [], [offer], { 456: { ladder: [[100, 2]] } });
assert.equal(checked[1].status, "missing", "Insufficient commodity depth is not a purchasable quote");
assert.equal(remainingShoppingCost(checked), null);
assert.equal(remainingShoppingCost(checkAuctionShoppingRows(rows, rows.map(row => row.key), [], {})), 0);
assert.notEqual(buildAuctionShoppingRows([{ ...item, variantKey: "other" }])[0].key, rows[0].key);
assert.notEqual(buildAuctionShoppingRows([{ ...item, quantity: 1 }])[0].key, rows[0].key);
assert.equal(remainingShoppingCost([{ currentCopper: Number.MAX_SAFE_INTEGER }, { currentCopper: 1 }]), null);
console.log("Auction shopping exact variants, stacks, partial purchase, price depth and freshness checks passed");
