import { MARKET_MAX_AGE_MS } from "./auctionMarket";

type PublicMarket = { updatedAt: string };
export function auctionGearMarketExpiry(market: PublicMarket) {
  return Date.parse(market.updatedAt) + MARKET_MAX_AGE_MS;
}
/** Mirrors the server's snapshot age/future-time bounds; never refreshes prices. */
export function auctionGearPricesAreFresh(market: PublicMarket, now = Date.now()) {
  const updated = Date.parse(market.updatedAt);
  return Number.isFinite(updated) && updated <= now + 5 * 60_000 && now <= updated + MARKET_MAX_AGE_MS;
}
