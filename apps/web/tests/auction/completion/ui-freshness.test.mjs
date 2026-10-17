import assert from "node:assert/strict";
import { assertFreshMarket, MARKET_MAX_AGE_MS } from "../../../lib/wow/auctionMarket.ts";
import { auctionGearMarketExpiry, auctionGearPricesAreFresh } from "../../../lib/wow/auctionGearFreshness.ts";

const now = Date.parse("2026-10-17T12:00:00.000Z");
const offsets = [0, -1, -MARKET_MAX_AGE_MS + 1, -MARKET_MAX_AGE_MS, -MARKET_MAX_AGE_MS - 1, 300000, 300001];
for (const offset of offsets) {
  const updatedAt = new Date(now + offset).toISOString();
  let serverFresh = true;
  try { assertFreshMarket({ sourceUpdatedAt: updatedAt }, now); } catch { serverFresh = false; }
  assert.equal(auctionGearPricesAreFresh({ updatedAt }, now), serverFresh, `Client/server age disagreement at ${offset} ms`);
  assert.equal(auctionGearMarketExpiry({ updatedAt }), now + offset + MARKET_MAX_AGE_MS);
}
assert.equal(auctionGearPricesAreFresh({ updatedAt: "unverified" }, now), false);
assert.equal(auctionGearPricesAreFresh({ updatedAt: "" }, now), false);
console.log("Auction UI freshness: exact server age/future bounds, expiry instant and unverifiable timestamps passed (offline).");
