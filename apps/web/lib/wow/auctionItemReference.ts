import "server-only";
import type { AuctionOffer } from "./auctionMarket";
import type { ResolvedAuctionVariant } from "./auctionItemVariant";
import { supportedAuctionModifiers } from "./gearItemModifiers";
export type AuctionItemReference = {
  offer: AuctionOffer;
  itemLevel: number;
  requiredLevel: number;
  stats: Array<{
    type: string;
    value: number;
  }>;
  weapon?: { minDamage: number; maxDamage: number; dps: number; speedSeconds: number };
  effects: string[];
  effectsVerified: boolean;
};
export const AUCTION_ITEM_REFERENCE_TTL_MS = 15 * 60_000;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" ? v as Record<string, unknown> : {};
export function parseAuctionItemReference(raw: unknown, itemId: number): AuctionItemReference | null {
  const item = object(raw),
    preview = object(item.preview_item);
  const itemLevel = object(preview.level).value;
  const requiredLevel = object(object(preview.requirements).level).value ?? item.required_level;
  const bonuses = preview.bonus_list ?? [];
  const contextId = preview.context ?? 0;
  if (item.id !== itemId || object(preview.item).id !== itemId || !Number.isInteger(itemLevel) || Number(itemLevel) < 1 || Number(itemLevel) > 1000 || !Number.isInteger(requiredLevel) || Number(requiredLevel) < 0 || Number(requiredLevel) > 90 || !Number.isInteger(contextId) || Number(contextId) < 0 || Number(contextId) > 10000 || !Array.isArray(bonuses) || bonuses.length > 20 || bonuses.some(v => !Number.isSafeInteger(v) || Number(v) < 1 || Number(v) > 1000000) || new Set(bonuses).size !== bonuses.length) return null;
  const modifiers = preview.modifiers ?? [];
  if (!Array.isArray(modifiers) || !supportedAuctionModifiers(modifiers)) return null;
  const craft = preview.modified_crafting_stat ?? [];
  if (!Array.isArray(craft) || craft.length > 2) return null;
  const normalized = modifiers.map(v => ({
    type: Number(v.type),
    value: Number(v.value)
  }));
  for (let i = 0; i < craft.length; i++) if (!normalized.some(m => m.type === 29 + i)) normalized.push({
    type: 29 + i,
    value: Number(object(craft[i]).id)
  });
  if (!supportedAuctionModifiers(normalized)) return null;
  if (preview.stats !== undefined && !Array.isArray(preview.stats)) return null;
  const stats = (preview.stats as unknown[] ?? []).map(v => ({
    type: String(object(object(v).type).type ?? ""),
    value: Number(object(v).value)
  }));
  if (stats.some(v => !v.type || !Number.isFinite(v.value) || v.value < 0)) return null;
  let weapon: AuctionItemReference["weapon"];
  if (preview.weapon !== undefined) {
    const rawWeapon = object(preview.weapon), damage = object(rawWeapon.damage);
    const minimum = damage.min_value, maximum = damage.max_value;
    const speed = object(rawWeapon.attack_speed).value, dps = object(rawWeapon.dps).value;
    if ([minimum, maximum, speed, dps].some(value => typeof value !== "number" || !Number.isFinite(value)) ||
        Number(minimum) < 0 || Number(maximum) < Number(minimum) || Number(dps) < 0 || Number(speed) <= 0) return null;
    weapon = { minDamage: Number(minimum), maxDamage: Number(maximum), dps: Number(dps), speedSeconds: Number(speed) / 1000 };
  }
  const spells = preview.spells;
  const effectsVerified = Array.isArray(spells) && spells.length <= 128 && spells.every(value => {
    const description = object(value).description;
    return typeof description === "string" && description.trim().length > 0;
  });
  const effects = effectsVerified ? (spells as unknown[]).map(value => String(object(value).description)) : [];
  return {
    offer: {
      auctionId: 0,
      itemId,
      buyoutCopper: 0,
      quantity: 1,
      contextId: Number(contextId),
      bonusIds: bonuses as number[],
      modifiers: normalized
    },
    itemLevel: Number(itemLevel),
    requiredLevel: Number(requiredLevel),
    stats,
    ...(weapon ? { weapon } : {}),
    effects,
    effectsVerified
  };
}
const statKeys: Record<string, string[]> = {
  STRENGTH: ["strength", "stragi", "strint", "stragiint"],
  AGILITY: ["agility", "stragi", "agiint", "stragiint"],
  INTELLECT: ["intellect", "strint", "agiint", "stragiint"],
  STAMINA: ["stamina"],
  CRIT_RATING: ["crit_rating"],
  HASTE_RATING: ["haste_rating"],
  MASTERY_RATING: ["mastery_rating"],
  VERSATILITY: ["versatility_rating"]
};
export function nativeMatchesItemReference(reference: AuctionItemReference | undefined, native: ResolvedAuctionVariant | undefined) {
  if (!reference || !native || native.error || native.itemId !== reference.offer.itemId || native.itemLevel !== reference.itemLevel || native.requiredLevel !== reference.requiredLevel) return false;
  if (reference.weapon && native.weapon) {
    // Permit sub-unit rounding in published weapon values while rejecting
    // differences in damage or speed; localized display names are irrelevant.
    const close = (a: number, b: number, precision: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= precision;
    if (!close(reference.weapon.minDamage, native.weapon.minDamage, 0.51) ||
        !close(reference.weapon.maxDamage, native.weapon.maxDamage, 0.51) ||
        !close(reference.weapon.dps, native.weapon.dps, 0.11) ||
        !close(reference.weapon.speedSeconds, native.weapon.speedSeconds, 0.001)) return false;
  }
  return reference.stats.every(stat => !statKeys[stat.type] || statKeys[stat.type].some(key => native.stats[key] === stat.value));
}
const references = new Map<string, {
  value: AuctionItemReference | null;
  expires: number;
}>();
export async function getAuctionItemReferences(ids: number[], region: string, token: string, signal: AbortSignal, locale = "en_GB") {
  if (!["eu", "us", "kr", "tw"].includes(region) || ids.length > 256 || !["en_GB", "en_US", "ru_RU"].includes(locale)) throw new Error("invalid_item_reference_request");
  const apiLocale = locale === "ru_RU" && region === "eu" ? "ru_RU" : region === "us" ? "en_US" : "en_GB";
  const result = new Map<number, AuctionItemReference>();
  for (let offset = 0; offset < ids.length; offset += 4) await Promise.all(ids.slice(offset, offset + 4).map(async itemId => {
    signal.throwIfAborted();
    const key = `${region}:${itemId}:${apiLocale}`,
      cached = references.get(key);
    if (cached && cached.expires > Date.now()) {
      if (cached.value) result.set(itemId, cached.value);
      return;
    }
    const response = await fetch(`https://${region}.api.blizzard.com/data/wow/item/${itemId}?namespace=static-${region}&locale=${apiLocale}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
    });
    let value: AuctionItemReference | null = null;
    if (response.status !== 404) {
      if (!response.ok) throw new Error("item_reference_unavailable");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("item_reference_unavailable");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const {
          value: chunk,
          done
        } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > 512 * 1024) {
          await reader.cancel();
          throw new Error("item_reference_unavailable");
        }
        chunks.push(chunk);
      }
      value = parseAuctionItemReference(JSON.parse(Buffer.concat(chunks).toString("utf8")), itemId);
    }
    references.set(key, {
      value,
      expires: Date.now() + AUCTION_ITEM_REFERENCE_TTL_MS
    });
    while (references.size > 512) references.delete(references.keys().next().value!);
    if (value) result.set(itemId, value);
  }));
  return result;
}
