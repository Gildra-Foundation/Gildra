import { supportedAuctionModifiers } from "./gearItemModifiers";
import type { GearCandidate, GearCandidateVariant } from "./gearCandidates";
export const MARKET_MAX_AGE_MS = 2 * 60 * 60_000;
export type AuctionOffer = {
  auctionId: number;
  itemId: number;
  buyoutCopper: number;
  quantity: number;
  contextId: number;
  bonusIds: number[];
  modifiers: Array<{
    type: number;
    value: number;
  }>;
};
export type AuctionSnapshot = {
  id: string;
  region: string;
  connectedRealmId: number;
  sourceUpdatedAt: string;
  fetchedAt: string;
  offers: AuctionOffer[];
};
export function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
export function goldToCopper(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,8}(?:[.,]\d{1,4})?$/.test(value)) throw new Error("invalid_budget");
  const [gold, fraction = ""] = value.replace(",", ".").split(".");
  const result = Number(gold) * 10000 + Number(fraction.padEnd(4, "0"));
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("invalid_budget");
  return result;
}
export function assertFreshMarket(snapshot: Pick<AuctionSnapshot, "sourceUpdatedAt">, now = Date.now()) {
  const updated = Date.parse(snapshot.sourceUpdatedAt);
  if (!Number.isFinite(updated) || updated > now + 5 * 60_000) throw new Error("market_timestamp_unverified");
  if (now - updated > MARKET_MAX_AGE_MS) throw new Error("market_stale");
}
export function parseAuctionOffers(payload: unknown): AuctionOffer[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as {
    auctions?: unknown;
  }).auctions)) throw new Error("invalid_market_response");
  const output: AuctionOffer[] = [],
    ids = new Set<number>();
  for (const raw of (payload as {
    auctions: unknown[];
  }).auctions) {
    if (!raw || typeof raw !== "object") throw new Error("invalid_market_response");
    const row = raw as Record<string, unknown>,
      item = row.item as Record<string, unknown> | undefined;
    if (!item || !positiveInteger(item.id) || !positiveInteger(row.id) || !positiveInteger(row.quantity)) throw new Error("invalid_market_response");
    // Bid-only auctions and battle pets are not immediately purchasable gear.
    if (item.pet_species_id || row.buyout === undefined) continue;
    if (!positiveInteger(row.buyout) || ids.has(row.id)) throw new Error("invalid_market_response");
    const bonusIds = item.bonus_lists ?? [];
    const modifiers = item.modifiers ?? [];
    if (!Array.isArray(bonusIds) || bonusIds.some(id => !positiveInteger(id) || id > 1_000_000) || new Set(bonusIds).size !== bonusIds.length || !Array.isArray(modifiers)) throw new Error("invalid_market_response");
    const normalized = modifiers.map((entry: unknown) => {
      if (!entry || typeof entry !== "object") throw new Error("invalid_market_response");
      const m = entry as {
        type?: unknown;
        value?: unknown;
      };
      if (!positiveInteger(m.type) || !Number.isSafeInteger(m.value) || Number(m.value) < 0) throw new Error("invalid_market_response");
      return {
        type: m.type,
        value: Number(m.value)
      };
    });
    const contextId = item.context ?? 0;
    if (!Number.isSafeInteger(contextId) || Number(contextId) < 0) throw new Error("invalid_market_response");
    ids.add(row.id);
    output.push({
      auctionId: row.id,
      itemId: item.id,
      buyoutCopper: row.buyout,
      quantity: row.quantity,
      contextId: Number(contextId),
      bonusIds: [...bonusIds].sort((a, b) => a - b),
      modifiers: normalized
    });
  }
  return output;
}
const modifierKey = (entries: Array<{
  type: number;
  value: number;
}>) => JSON.stringify([...entries].sort((a, b) => a.type - b.type || a.value - b.value));
export function matchAuctionVariant(offer: AuctionOffer, candidate: GearCandidate): GearCandidateVariant | undefined {
  if (offer.itemId !== candidate.itemId) return undefined;
  // Crafted/stat modifiers require a dedicated SimC serializer; do not drop them.
  if (!supportedAuctionModifiers(offer.modifiers)) return undefined;
  const bonus = [...offer.bonusIds].sort((a, b) => a - b).join(",");
  const matches = candidate.variants.filter(variant => variant.contextId === offer.contextId && [...variant.bonusIds].sort((a, b) => a - b).join(",") === bonus && modifierKey(variant.modifiers ?? []) === modifierKey(offer.modifiers));
  if (matches.length !== 1) return undefined;
  return matches[0];
}
