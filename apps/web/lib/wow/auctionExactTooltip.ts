import "server-only";
import type { AuctionListing } from "./auctionBrowser";
import type { AuctionItemDetails } from "./auctionItemDetails";
import { auctionVariantKey } from "./auctionItemVariant";
import { resolveAuctionVariants } from "./auctionVariantResolver";
import type { AuctionOffer } from "./auctionMarket";
import type { GearPlannerWeapon } from "./gearPlannerPresentation";

export type ExactAuctionTooltip = {
  name: string; itemLevel: number; requiredLevel: number; quality: number;
  stats: Record<string, number>; weapon?: GearPlannerWeapon;
  lines: string[] | null; wowheadUrl: string; resolution?: "native" | "native+wowhead" | "wowhead-bonuses";
};
const slots: Record<string, string> = { HEAD: "head", NECK: "neck", SHOULDER: "shoulder", CHEST: "chest", ROBE: "chest", WAIST: "waist", LEGS: "legs", FEET: "feet", WRIST: "wrist", HAND: "hands", FINGER: "finger1", TRINKET: "trinket1", CLOAK: "back", WEAPON: "main_hand", TWOHWEAPON: "main_hand", MAIN_HAND: "main_hand", OFF_HAND: "off_hand", SHIELD: "off_hand", HOLDABLE: "off_hand", RANGED: "main_hand", RANGEDRIGHT: "main_hand", THROWN: "main_hand" };
const statCodes: Record<string, number> = { agility: 3, strength: 4, intellect: 5, stamina: 7, crit_rating: 32, haste_rating: 36, versatility_rating: 40, mastery_rating: 49, speed_rating: 61, leech_rating: 62, avoidance_rating: 63 };
function decode(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
    const code = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : entity.startsWith("#") ? Number(entity.slice(1)) : NaN;
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : named[entity.toLowerCase()] ?? whole;
  });
}
function tooltipTextLines(html: string) {
  const safe = html.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<div\b[^>]*class=["']whtt-sellprice["'][^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>|<(?:table|tr)\b[^>]*>|<\/(?:table|tr|td|th|div|p)>/gi, "\n").replace(/<[^>]*>/g, "");
  return decode(safe).split(/\n+/).map(line => line.replace(/[\t ]+/g, " ").trim()).filter(Boolean).slice(0, 70).map(line => line.slice(0, 2000));
}
async function gameTooltip(itemId: number, params: URLSearchParams): Promise<{ tooltip: string; quality: number } | null> {
  try {
    const response = await fetch(`https://nether.wowhead.com/tooltip/item/${itemId}?${params}`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4000) });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const reader = response.body?.getReader(); if (!reader) return null;
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 256_000) { await reader.cancel(); return null; } chunks.push(value); }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof payload.tooltip === "string" && payload.tooltip.length < 128_000 && Number.isInteger(payload.quality) ? payload : null;
  } catch { return null; }
}
/** Foreign HTML is converted to bounded text, never mounted or executed. */
export function wowheadTooltipLines(html: string, native: Pick<ExactAuctionTooltip, "itemLevel" | "requiredLevel" | "stats" | "weapon">): string[] | null {
  if (html.length > 128_000 || Number(html.match(/<!--ilvl-->(\d+)/)?.[1]) !== native.itemLevel) return null;
  const requirement = html.match(/<!--rlvl-->(\d+)/);
  if (native.requiredLevel > 0 && (!requirement || Number(requirement[1]) !== native.requiredLevel)) return null;
  const expectedCodes = new Set(Object.entries(native.stats).filter(([, value]) => value > 0).map(([key]) => statCodes[key]));
  if ([...html.matchAll(/<!--(?:stat|rtg)(\d+)-->/g)].some(m => !expectedCodes.has(Number(m[1])))) return null;
  for (const [key, value] of Object.entries(native.stats)) {
    if (value <= 0) continue;
    if (key === "armor") { const armor = html.match(/<!--amr-->([\d.,\s]+)/); if (!armor || Number(armor[1].replace(/[\s,]/g, "")) !== Math.round(value)) return null; continue; }
    if (key === "bonus_armor") return null;
    const code = statCodes[key];
    // Hybrid primaries or an unfamiliar stat need native rendering, not guessed labels.
    if (!code) return null;
    const found = html.match(new RegExp(`<!--(?:stat|rtg)${code}-->\\+?([\\d.,\\s]+)`));
    if (!found || Number(found[1].replace(/[\s,]/g, "")) !== Math.round(value)) return null;
  }
  if (native.weapon) {
    const damage = html.match(/<!--dmg-->[^\d<]*(\d+)\s*[-–]\s*(\d+)/);
    if (!damage || Number(damage[1]) !== Math.round(native.weapon.minDamage) || Number(damage[2]) !== Math.round(native.weapon.maxDamage)) return null;
    const speed = html.match(/<!--spd-->([\d.,]+)/);
    if (!speed || Math.abs(Number(speed[1].replace(",", ".")) - native.weapon.speedSeconds) > .001) return null;
  }
  return tooltipTextLines(html);
}
export async function resolveExactAuctionTooltip(row: AuctionListing, item: AuctionItemDetails, lang: "ru" | "en"): Promise<ExactAuctionTooltip> {
  const slot = slots[item.inventoryType ?? ""];
  if (!slot || row.petSpeciesId || item.qualityId === 7) throw new Error("item_variant_unavailable");
  const params = new URLSearchParams({ dataEnv: "1", locale: lang === "ru" ? "7" : "0" });
  if (row.bonusIds.length) params.set("bonus", row.bonusIds.join(":"));
  const reference = new URL(`https://www.wowhead.com/${lang === "ru" ? "ru/" : ""}item=${row.itemId}`);
  // Bonus-only lots map directly to Wowhead's documented bonus contract. There
  // is no guessed character/item level and no ignored scaling/crafting input.
  if (row.context === 0 && row.modifiers.every(m => m.type >= 38 && m.type <= 51)) {
    const payload = await gameTooltip(row.itemId, params);
    if (!payload) throw new Error("item_variant_unavailable");
    const html = payload.tooltip, itemLevel = Number(html.match(/<!--ilvl-->(\d+)/)?.[1]);
    if (!Number.isInteger(itemLevel) || itemLevel < 1 || itemLevel > 1000) throw new Error("item_variant_unavailable");
    const stats: Record<string, number> = {};
    for (const [key, code] of Object.entries(statCodes)) {
      const value = html.match(new RegExp(`<!--(?:stat|rtg)${code}-->\\+?([\\d.,\\s]+)`));
      if (value) stats[key] = Number(value[1].replace(/[\s,]/g, ""));
    }
    const armor = html.match(/<!--amr-->([\d.,\s]+)/); if (armor) stats.armor = Number(armor[1].replace(/[\s,]/g, ""));
    const damage = html.match(/<!--dmg-->[^\d<]*(\d+)\s*[-–]\s*(\d+)/), speed = Number(html.match(/<!--spd-->([\d.,]+)/)?.[1]?.replace(",", "."));
    const weapon = damage && speed > 0 ? { minDamage: Number(damage[1]), maxDamage: Number(damage[2]), speedSeconds: speed, dps: (Number(damage[1]) + Number(damage[2])) / 2 / speed } : undefined;
    if (item.itemClassId === 2 && !weapon) throw new Error("item_variant_unavailable");
    const lines = tooltipTextLines(html);
    if (row.bonusIds.length) reference.searchParams.set("bonus", row.bonusIds.join(":"));
    return { name: lines[0] ?? item.name ?? `ID ${row.itemId}`, itemLevel, requiredLevel: Number(html.match(/<!--rlvl-->(\d+)/)?.[1] ?? 0), quality: payload.quality, stats, ...(weapon ? { weapon } : {}), lines: lines.slice(1), wowheadUrl: reference.href, resolution: "wowhead-bonuses" };
  }
  const offer: AuctionOffer = { auctionId: row.id, itemId: row.itemId, quantity: row.quantity, buyoutCopper: row.buyout ?? 0, contextId: row.context, bonusIds: row.bonusIds, modifiers: row.modifiers };
  const key = auctionVariantKey(offer);
  const ranged = item.itemClassId === 2 && [2, 3, 18].includes(item.itemSubclassId ?? -1);
  const result = await resolveAuctionVariants({ offers: [{ offer, slot }], spec: ranged ? "beast-mastery-hunter" : "fury-warrior", characterLevel: 90, signal: AbortSignal.timeout(8000) });
  const native = result.variants.get(key);
  if (!native || native.error || native.key !== key || native.itemId !== row.itemId || !Number.isInteger(native.itemLevel) || native.itemLevel <= 0 || native.itemLevel > 1000 || !Number.isInteger(native.requiredLevel) || native.requiredLevel < 0 || native.requiredLevel > 90 || !Number.isInteger(native.quality) || native.quality < 0 || native.quality > 7 || Object.values(native.stats).some(v => !Number.isFinite(v) || v < 0)) throw new Error("item_variant_unavailable");
  // A missing weapon block is not proof of zero damage. Some old content
  // tuning curves cannot be resolved reliably by the current native data.
  if (item.itemClassId === 2 && !native.weapon) throw new Error("item_variant_unavailable");
  params.set("ilvl", String(native.itemLevel));
  const dropLevel = row.modifiers.find(m => m.type === 9)?.value;
  if (dropLevel) params.set("lvl", String(dropLevel));
  const crafted = row.modifiers.filter(m => m.type === 29 || m.type === 30).sort((a, b) => a.type - b.type).map(m => m.value);
  if (crafted.length) params.set("crafted-stats", crafted.join(":"));
  for (const [name, value] of params) if (!["dataEnv", "locale"].includes(name)) reference.searchParams.set(name, value);
  const exact: ExactAuctionTooltip = { name: item.name ?? `ID ${row.itemId}`, itemLevel: native.itemLevel, requiredLevel: native.requiredLevel, quality: native.quality, stats: native.stats, ...(native.weapon ? { weapon: native.weapon } : {}), lines: null, wowheadUrl: reference.href, resolution: "native" };
  const payload = await gameTooltip(row.itemId, params);
  const lines = payload ? wowheadTooltipLines(payload.tooltip, exact) : null;
  if (lines?.length) { exact.name = lines[0]; exact.lines = lines.slice(1); exact.resolution = "native+wowhead"; }
  return exact;
}
