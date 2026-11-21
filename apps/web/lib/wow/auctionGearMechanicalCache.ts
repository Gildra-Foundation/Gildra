import { createHash } from "node:crypto";
import type { OwnedAuctionGearChange } from "./auctionGearEnhancementOptimizer";
import type { AuctionGearOption, GearPlanSimulation } from "./auctionGearTypes";
import { combinedRingRatings90, isDirectRingEnchant, purchasedRingScrollRating90, ringGemRepresentative90 } from "./auctionRingRatings";
import { midnightGemRating90, ownedMidnightGemScore } from "./auctionMidnightGemRatings";
import { auctionAppliedStatsKey, auctionSocketedRingCurve, bareJewelrySuffixIdentity, bareWeaponCurveIdentity, bareArmorConstantCurveIdentity, armorMissiveInputs, indestructibleItemIdentity } from "./auctionGearEffects";
import { auctionMissiveComparison, auctionNativeItemOptions, ignoresItemContext } from "./gearItemModifiers";
import { auctionMeasurementContract, type SimcGearChange } from "./gearSimulation";

const ttlMs = 15 * 60_000;
const maximum = 4096;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]));
}

// Within each rank all three enchants give the same stamina. The native
// observation bits, in order, denote speed, leech and avoidance.
const bootEnchantRanks = [[8018, 7992, 7962], [8019, 7993, 7963]];
export function equivalentBootEnchants(original: number | undefined, unread: unknown, engine: string) {
  if (!original || !ignoresItemContext(engine) || typeof unread !== "number" ||
      !Number.isInteger(unread) || unread < 1 || unread > 7) return [];
  const rank = bootEnchantRanks.find(ids => ids.includes(original));
  if (!rank || !(unread & (1 << rank.indexOf(original)))) return [];
  return rank.filter((id, index) => id !== original && (unread & (1 << index)));
}

// Unknown enchants and observed ratings retain their physical identity.
const armorEnchants = new Map<number, { slot: string; axis: number; group: number }>();
for (const [rank, ids] of bootEnchantRanks.entries())
  ids.forEach((id, index) => armorEnchants.set(id, {slot: "FEET", axis: 1 << index, group: -1 - rank}));
for (const [slot, families] of [
  ["HEAD", [[7988, 7989], [7958, 7959], [8014, 8015]]],
  ["SHOULDER", [[7970, 7971, 7972, 7973], [8028, 8029, 8030, 8031], [7998, 7999, 8000, 8001]]],
] as const) {
  families.forEach((ids, index) => ids.forEach(id => armorEnchants.set(id, {slot, axis: 1 << index, group: -1})));
}

export function projectUnreadArmor(edits: readonly OwnedAuctionGearChange[], unread: number,
  bareHosts?: ReadonlyMap<string, number>, purchases?: readonly AuctionGearOption[]) {
  let projected: OwnedAuctionGearChange[] | undefined;
  for (const [index, edit] of edits.entries()) {
    const effect = edit.enchantId && armorEnchants.get(edit.enchantId);
    if (!effect || effect.slot !== edit.slotType || !(effect.axis & unread)) {
      projected?.push(edit);
      continue;
    }
    projected ??= edits.slice(0, index);
    // These head and shoulder enchants have only the unread rating. The
    // original bare item contributes zero to it. Boots also change stamina.
    const bare = effect.slot !== "FEET" && bareHosts?.get(edit.slotType) === edit.itemId &&
      !purchases?.some(option => option.candidate.slotType === edit.slotType);
    if (!bare || edit.gems.length) projected.push({ ...edit, enchantId: bare ? undefined : effect.group });
  }
  return projected;
}

// Pinned SimC gems with identical ordered direct stats at every level
// from 1 to 90, socket color, description ID and item-level requirements.
// These IDs have no spell, profession, relic, punchcard or gem-name proc.
// Verify the pairs with tests/auction/item-effects/verify-gem-pairs.py.
// Keep other ranks distinct: matching at level 90 alone is insufficient.
const equivalentGems = new Map<number, number>([
  [22460, 22459], [153710, 130215], [153711, 130216], [153712, 130217],
  [153713, 130218], [154126, 130219], [154127, 130220], [154128, 130221],
  [168639, 151580], [168641, 151583],
]);

// Permanent glove enchants on the pinned engine. Gatherer has no native
// driver. The crafting, gathering and surveying spells have no combat stat,
// usable proc or custom initializer. Their purchase identities remain distinct.
const professionGloveEnchants = new Set([844, 845, 865, 906, 909, 2603, 3238, 4732, 5444, 5445, 5446, 5447, 5932, 5933, 5934, 5935, 5937, 6205]);

export function neutralProfessionGloveEnchant(id: number, engine: string) {
  return ignoresItemContext(engine) && professionGloveEnchants.has(id);
}

// These permanent shoulder enchants install a dummy aura with no native proc,
// combat stat or registered effect. Their visual spell cannot change a fight.
const shoulderIllusions = new Set([
  6671, 6673, 6674, 6679, 6680, 6681, 6682, 6683, 6684, 6685, 6686, 6687, 6688, 6689, 6690,
  6819, 6820, 6821, 6907, 6908, 6909, 7425, 7426, 7427, 7428, 7429, 7430, 7431, 7432, 7433,
  7434, 7435, 7436, 8042, 8043, 8044, 8045, 8046, 8047, 8649, 8650, 8651,
]);

export function neutralShoulderIllusion(id: number, engine: string) {
  return ignoresItemContext(engine) && shoulderIllusions.has(id);
}

// Both hearthstone enchants have equip spells only. The pinned engine creates
// no stat, buff, action or proc for their drivers (see verify-wrist-enchants.py).
export function neutralWristHearthEnchant(id: number, engine: string) {
  return (id === 5970 || id === 6222) && ignoresItemContext(engine);
}

// Both Worldsoul Cradle ranks install only a linked healing-barrier aura.
// The pinned engine gives their drivers no proc flags or custom handler.
// Aegis has a damaging explosion and is outside this rule.
export function isWorldsoulCradle(id: number) {
  return id === 8006 || id === 8007;
}

// Pure leech rating on a bare helm or shoulder. The caller must have an
// attestation from the unchanged native Fury actor that healing is disabled.
export function pureArmorLeechEnchant(slot: string, inventory: number, id: number) {
  if (slot === "HEAD" && inventory === 1) return id === 7958 || id === 7959;
  return slot === "SHOULDER" && inventory === 3 && (id === 8028 || id === 8029 || id === 8030 || id === 8031);
}

const verifiedGemSlots = new Set([
  "head", "neck", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs", "feet", "finger1", "finger2",
]);

const directPrismaticGems = new Set([...equivalentGems.keys(), ...equivalentGems.values()]);

type WornRing = { itemId: number; enchantId: number };

/** Explicit direct enchants on two rings contribute integer ratings based on
 * the player's level. Each host, its gems and its purchase remain in place.
 * Only the score key uses the sorted enchant IDs. */
function purchasedRingEnchantChanges(changes: SimcGearChange[], options: AuctionGearOption[], engine: string, purchased: readonly number[],
  owned: readonly OwnedAuctionGearChange[] | undefined, wornRings: readonly [WornRing, WornRing] | undefined) {
  const edits = [owned?.findIndex(c => c.slotType === "FINGER_1") ?? -1, owned?.findIndex(c => c.slotType === "FINGER_2") ?? -1];
  const enchants: number[] = [];
  for (const [slot, index] of purchased.entries()) {
    const edit = edits[slot] >= 0 ? owned?.[edits[slot]] : undefined;
    const enchant = index >= 0 ? changes[index].enchantId : edit?.enchantId;
    if (!enchant || !isDirectRingEnchant(enchant)) return;
    if (index >= 0) {
      if (edit) return;
      const option = options[index], candidate = option.candidate;
      const variant = candidate.variants.find(row => row.key === option.variantKey);
      if (candidate.inventoryType !== 11 || candidate.itemClassId !== 4 || !variant ||
          !Number.isSafeInteger(variant.itemLevel) || variant.itemLevel < 120 ||
          variant.resolution?.engine !== engine || variant.resolution.nativeNoItemEffects !== true ||
          variant.resolution.enhancements?.status !== "verified") return;
    } else if (!edit || wornRings?.[slot].itemId !== edit.itemId) {
      return;
    }
    enchants.push(enchant);
  }
  if (enchants[0] <= enchants[1]) return;
  const scoreChanges = changes.slice();
  const scoreOwned = owned?.slice();
  for (const [slot, index] of purchased.entries()) {
    const enchantId = enchants[1 - slot];
    if (index >= 0) scoreChanges[index] = { ...changes[index], enchantId };
    else if (scoreOwned) scoreOwned[edits[slot]] = { ...scoreOwned[edits[slot]], enchantId };
  }
  return { changes: scoreChanges, ownedChanges: scoreOwned };
}

// A purchased item is a complete local replacement in SimC. An omitted gem
// starts with an empty socket even when the previously worn item had a gem.
function directJewelryGem(change: Pick<SimcGearChange, "slot" | "itemId" | "enchantId" | "gemIds">, option: AuctionGearOption, engine: string) {
  const ring = change.slot === "finger1" || change.slot === "finger2";
  if (!ring && change.slot !== "neck") return;
  if (change.enchantId && (!ring || !isDirectRingEnchant(change.enchantId))) return;
  const gem = change.gemIds?.[0] ?? 0;
  if ((change.gemIds?.length ?? 0) > 1 || (gem !== 0 && !directPrismaticGems.has(gem))) return;
  if (!plainPrismaticHost(change, option, engine, 10)) return;
  return equivalentGems.get(gem) ?? gem;
}

const jewelrySlots: Readonly<Record<string, string | undefined>> = { finger1: "FINGER_1", finger2: "FINGER_2", neck: "NECK" };

function plainPrismaticHost(change: Pick<SimcGearChange, "slot" | "itemId">, option: AuctionGearOption, engine: string, minimumLevel: number) {
  const c = option.candidate, variant = c.variants.find(v => v.key === option.variantKey);
  const slot = jewelrySlots[change.slot];
  const ring = slot === "FINGER_1" || slot === "FINGER_2";
  const resolution = variant?.resolution, meta = resolution?.enhancements;
  if (!slot || c.slotType !== slot || c.itemId !== change.itemId || c.inventoryType !== (ring ? 11 : 2) || c.itemClassId !== 4 ||
      !variant || !Number.isSafeInteger(variant.itemLevel) || variant.itemLevel < minimumLevel ||
      resolution?.engine !== engine || resolution.nativeNoItemEffects !== true || meta?.status !== "verified" ||
      meta.socketCount !== 1 || meta.socketBonusId !== 0 || meta.requiredProfessionId !== 0 ||
      meta.socketColors?.length !== 3 || meta.socketColors[0] !== 14 || meta.socketColors[1] !== 0 || meta.socketColors[2] !== 0) return false;
  return true;
}

export function hasLevel90NeckGemRatings(option: AuctionGearOption, engine: string) {
  return option.candidate.slotType === "NECK" && ignoresItemContext(engine) &&
    plainPrismaticHost({slot: "neck", itemId: option.candidate.itemId}, option, engine, 120);
}

export function hasLevel90RingRatings(option: AuctionGearOption, engine: string, playerLevel?: number) {
  const { slotType, itemId } = option.candidate;
  return playerLevel === 90 && ignoresItemContext(engine) && (slotType === "FINGER_1" || slotType === "FINGER_2") &&
    plainPrismaticHost({ slot: slotType === "FINGER_1" ? "finger1" : "finger2", itemId }, option, engine, 120);
}

/** Gem substitution must pass the same host and enchant gates as the score key. */
export function purchasedJewelryGemEffect(option: AuctionGearOption, engine: string, gemId: number, enchantId: number, nativePlayerLevel?: number) {
  const slotType = option.candidate.slotType;
  if (slotType === "NECK") {
    return nativePlayerLevel === 90 && enchantId === 0 && hasLevel90NeckGemRatings(option, engine)
      ? ringGemRepresentative90(gemId) : undefined;
  }
  if (!ignoresItemContext(engine) || (slotType !== "FINGER_1" && slotType !== "FINGER_2") ||
      enchantId !== 0 && !isDirectRingEnchant(enchantId)) return;
  const host = { slot: slotType === "FINGER_1" ? "finger1" : "finger2", itemId: option.candidate.itemId };
  if (nativePlayerLevel === 90 && plainPrismaticHost(host, option, engine, 120)) {
    const representative = ringGemRepresentative90(gemId);
    if (representative !== undefined) return representative;
  }
  return directJewelryGem({ ...host, gemIds: [gemId] }, option, engine);
}

/** The verified gems contribute player-level integer stats. Every eligible
 * socket has the same color and no bonus. Moving gems preserves the global
 * counts and all other effects. The purchase and native request keep the original order. */
export function purchasedJewelryScoreChanges(changes: SimcGearChange[], options: AuctionGearOption[], engine: string,
  owned: readonly OwnedAuctionGearChange[] | undefined, wornRings: readonly [WornRing, WornRing] | undefined, precision?: "finalist") {
  if (!ignoresItemContext(engine) || (!precision && changes.length < 2 && !owned?.length)) return;
  const first = changes.findIndex(c => c.slot === "finger1"), second = changes.findIndex(c => c.slot === "finger2");
  if (first < 0 && second < 0) return;
  const enchants = !precision ? purchasedRingEnchantChanges(changes, options, engine, [first, second], owned, wornRings) : undefined;
  if (!changes.some(c => c.gemIds?.length)) return enchants;
  const hosts: { index: number; gem: number }[] = [];
  // Fixed host order also covers calls submitting the same purchases in a
  // different order. An unverified host keeps its original customization.
  for (const index of [first, second, changes.findIndex(c => c.slot === "neck")]) {
    if (index < 0 || owned?.some(c => c.slotType === options[index].candidate.slotType)) continue;
    // At finalist precision share only the tested ordinary purchased rings.
    // Keep the independent 750-iteration key and every enchant in its slot.
    if (precision && changes[index].slot === "neck") continue;
    const gem = directJewelryGem(changes[index], options[index], engine);
    if (gem !== undefined) hosts.push({ index, gem });
  }
  if (!precision && hosts.length < 2) return enchants;
  const sorted = hosts.map(host => host.gem).sort((a, b) => a - b);
  let scoreChanges = enchants?.changes;
  for (const [i, { index, gem }] of hosts.entries()) {
    // Match the ordinary worker encoding of an empty purchased socket.
    const original = precision ? changes[index].gemIds?.[0] ?? 0 : gem;
    if (sorted[i] === original && (original || !changes[index].gemIds?.length)) continue;
    scoreChanges ??= changes.slice();
    scoreChanges[index] = { ...scoreChanges[index], gemIds: sorted[i] ? [sorted[i]] : undefined };
  }
  if (scoreChanges) return { changes: scoreChanges, ownedChanges: enchants?.ownedChanges ?? owned };
}

function effectiveRingEnchants(edits: readonly OwnedAuctionGearChange[], rings: readonly [WornRing, WornRing]) {
  const ids = rings.map(ring => ring.enchantId);
  let changed = false;
  for (const edit of edits) {
    if (edit.slotType !== "FINGER_1" && edit.slotType !== "FINGER_2") continue;
    const index = edit.slotType === "FINGER_1" ? 0 : 1;
    if (edit.itemId !== rings[index].itemId) return;
    if (edit.enchantId) {
      ids[index] = edit.enchantId;
      changed = true;
    }
  }
  if (!changed || !ids.every(id => id === 0 || isDirectRingEnchant(id))) return;
  // Both effective enchants are additive. If their multiset equals the
  // original, the ordinary unchanged-ring score already covers the request.
  const [a, b] = ids.sort((left, right) => left - right);
  const first = rings[0].enchantId, second = rings[1].enchantId;
  return a === Math.min(first, second) && b === Math.max(first, second) ? [] : [a, b];
}

/** Explicit replacements remove the same installed data. A positively
 * identified bare ring enchant also contributes zero for score reuse. */
function explicitOwnedJewelry(owned: readonly OwnedAuctionGearChange[], hosts: ReadonlyMap<string, number>,
  purchased: readonly SimcGearChange[], removed: readonly string[] | undefined, bareRings?: ReadonlySet<string>, physicalFinalist = false) {
  if (new Set(owned.map(edit => edit.slotType)).size !== owned.length) return;
  const ratings = [0, 0, 0, 0];
  const slots: string[] = [], descriptions: number[] = [];
  const edits = owned.map(edit => {
    const ring = edit.slotType === "FINGER_1" || edit.slotType === "FINGER_2";
    const knownEnchant = ring ? Boolean(edit.enchantId) || edit.enchantId === undefined && bareRings?.has(edit.slotType)
      : edit.enchantId === undefined;
    if (!knownEnchant || (!ring && edit.slotType !== "NECK") || !hosts.has(edit.slotType) || hosts.get(edit.slotType) !== edit.itemId ||
        removed?.some(slot => slot === edit.slotType || jewelrySlots[slot] === edit.slotType) || purchased.some(c => jewelrySlots[c.slot] === edit.slotType) ||
        edit.gems.length !== 1 || edit.gems[0].index !== 0 || !edit.gems[0].itemId) return edit;
    const id = edit.gems[0].itemId;
    const midnight = physicalFinalist ? midnightGemRating90(id) : undefined;
    const contribution = combinedRingRatings90(edit.enchantId ?? 0, midnight ? 0 : id);
    if (!contribution) return edit;
    for (const [index, amount] of contribution.entries()) ratings[index] += amount + (midnight?.ratings[index] ?? 0);
    slots.push(edit.slotType);
    if (midnight) descriptions.push(midnight.descriptionId);
    // Zeroes are placeholders only in the hash. Keep the physical hosts,
    // socket position and every unrelated edit in the comparison.
    return { ...edit, enchantId: ring ? 0 : undefined, gems: [{ ...edit.gems[0], itemId: 0 }] };
  });
  // Legacy gems have no description. Midnight observers count colors across
  // sockets. Include the normalized hosts so a retained or empty socket can
  // never substitute for an explicitly replaced gem on another item.
  return slots.length ? { edits, ratings, gemColors: descriptions.length
    ? { slots: slots.sort(), descriptions: descriptions.sort((a, b) => a - b) } : undefined } : undefined;
}

// These permanent neck enchants only add a rating computed from the player.
// The final score key still contains the exact enchant ID and actual slot.
const directNeckEnchants = new Set([5285, 5292, 5293, 5295, 5317, 5318, 5319, 5321, 5890, 5895, 5896, 5897, 5898]);

// Gift and Mark install exactly the same rating in each pair. Their enchant
// spells contribute zero, so SimC uses the same capped player scaling table.
const equalNeckEnchantRanks = new Map([[5898, 5317], [5897, 5318], [5895, 5319], [5896, 5321]]);
export function directNeckEnchantGroup(id: number) {
  return directNeckEnchants.has(id) ? equalNeckEnchantRanks.get(id) ?? id : undefined;
}

// Each pinned enchant has one integer STAT operation. It contributes spell
// power to the player after the two purchased weapons are equipped.
const directWeaponSpellPower90 = new Map<number, number>([
  [2504, 14], [2505, 14], [2669, 14], [3830, 7], [3834, 9], [3846, 7], [3854, 12], [3855, 10],
]);

export function weaponScrollPower90(id: number) {
  return id === 0 ? 0 : directWeaponSpellPower90.get(id);
}

export function isPlainScrollWeapon90(option: AuctionGearOption, variant: AuctionGearOption["candidate"]["variants"][number],
  engine: string, playerLevel?: number) {
  const item = option.candidate, proof = variant.resolution, sockets = proof?.enhancements;
  return playerLevel === 90 && ignoresItemContext(engine) && proof?.engine === engine &&
    proof.metadataVersion === 3 && proof.nativeNoItemEffects === true && !!proof.weapon && !proof.effects?.length &&
    item.itemClassId === 2 && (item.slotType === "MAIN_HAND" || item.slotType === "OFF_HAND") &&
    !!item.constraints && !item.constraints.setId && !item.constraints.setName &&
    Number.isSafeInteger(variant.itemLevel) && variant.itemLevel >= 10 && variant.itemLevel <= 120 &&
    sockets?.status === "verified" && sockets.socketCount === 0 && sockets.socketBonusId === 0 &&
    sockets.requiredProfessionId === 0 && sockets.socketColors?.length === 3 && sockets.socketColors.every(color => color === 0);
}

/** No credentials, localized presentation, prices or character names are retained. */
export function auctionGearMechanicalKey(profileFingerprint: string, request: {
  spec: string; scenario: string; fightLengthSeconds: number; targets: number; gearChanges?: unknown[]; removedSlots?: readonly string[]; ownedChanges?: readonly OwnedAuctionGearChange[]; precision?: "finalist";
}, native?: { changes: SimcGearChange[]; options?: AuctionGearOption[]; engine: string; playerLevel?: number; unenchantedHandsId?: number; wornRings?: readonly [WornRing, WornRing]; wornPrismatic?: ReadonlyMap<string, number>; barePrismaticRings?: ReadonlySet<string>; physicalFinalist?: boolean }) {
  const reuseCandidateInputs = !!native && !request.precision && ignoresItemContext(native.engine);
  // Local replacements carry no Azerite powers. An empty bonus list cannot run
  // a scaling handler, including through automatic enchants in this pinned DBC.
  const certifiedJewelry: { index: number; slot: string; ratings: number[] }[] = [];
  const weaponScrolls: { index: number; power: number }[] = [];
  let purchasedScrollTotal = 0;
  const gear = native?.changes.map((change, i) => {
    const option = native.options?.[i];
    const variant = option?.candidate.variants.find(row => row.key === option.variantKey);
    const resolution = variant?.resolution;
    const proof = resolution?.engine === native.engine ? resolution : undefined;
    // The curve depends on the item bonus program. A prepared change may be
    // reordered or rewritten by jewelry normalization before it reaches here.
    const bonuses = variant?.bonusIds;
    const sameProgram = option?.candidate.itemId === change.itemId && Array.isArray(bonuses) &&
      bonuses.length === change.bonusIds?.length && bonuses.every((id, index) => id === change.bonusIds?.[index]);
    const sameVariant = sameProgram && (change.contextId ?? 0) === (variant?.contextId ?? 0) &&
      JSON.stringify(change.modifiers ?? []) === JSON.stringify(variant?.modifiers ?? []);
    const armorConstantCurve = sameVariant && option && !change.enchantId && !change.gemIds?.length &&
      change.slot === option.candidate.slotType.toLowerCase() &&
      !request.ownedChanges?.some(edit => edit.slotType === option.candidate.slotType)
      ? bareArmorConstantCurveIdentity(option, native.engine, reuseCandidateInputs || native.physicalFinalist === true) : undefined;
    const weaponCurve = sameVariant && option && !change.enchantId && !change.gemIds?.length &&
      ((change.slot === "main_hand" && option.candidate.slotType === "MAIN_HAND") ||
       (change.slot === "off_hand" && option.candidate.slotType === "OFF_HAND")) &&
      !request.ownedChanges?.some(edit => edit.slotType === option.candidate.slotType)
      ? bareWeaponCurveIdentity(option, native.engine) : undefined;
    const curve = reuseCandidateInputs && sameProgram ? proof?.nativeDropCurveV1 : undefined;
    // A finalist can reuse a previous 750-iteration fight only within its
    // own precision key. Both native tuning handlers consume the same cap.
    // Preserve the drop level, gem order, enchant and every other input.
    const sockets = proof?.enhancements;
    const finalistCap = request.precision === "finalist" && sameProgram && bonuses.length > 0 &&
      proof?.metadataVersion === 3 && sockets?.status === "verified" && sockets.socketColors?.length === 3 &&
      sockets.socketColors.every(color => color === 0 || color === 14);
    const tuning = reuseCandidateInputs || finalistCap ? proof?.nativeContentTuningV1 : undefined;
    // For a certified socketless chest the suffix's rounded ratings and
    // the direct enchant fully determine their contribution to this fight.
    // Replace only the bonus list in the comparison key. Every other slot,
    // enchant, modifier, owned edit and the physical purchase stays intact.
    const chestSuffix = request.precision === "finalist" && change.slot === "chest" && change.enchantId &&
      option?.candidate.slotType === "CHEST" && sameVariant && proof?.nativeSuffixProgramV1 &&
      option.customization?.enchantId === change.enchantId && !change.gemIds?.length &&
      !request.ownedChanges?.some(edit => edit.slotType === "CHEST")
      ? auctionAppliedStatsKey([option], native.engine, "enchanted-suffix") : undefined;
    // A local purchase replaces the entire jewelry piece. These prismatic gems have
    // no observable name family, description tag, proc or socket bonus. Only
    // the final integer contribution changes combat. Keep the real receipt.
    const ratings = native.playerLevel === 90 && ignoresItemContext(native.engine) && sameVariant && option &&
      (change.slot !== "neck" || !change.enchantId) && (change.gemIds?.length ?? 0) <= 1 &&
      !request.ownedChanges?.some(edit => edit.slotType === option.candidate.slotType) &&
      plainPrismaticHost(change, option, native.engine, 120)
      ? combinedRingRatings90(change.enchantId ?? 0, change.gemIds?.[0] ?? 0) : undefined;
    // A direct scroll adds a player-level rating once on its final host.
    // A second replacement in the same slot can overwrite the first enchant.
    // Keep the real order and receipt for checkpoint ranking and purchases.
    const scroll = native.physicalFinalist && request.precision === "finalist" && native.playerLevel === 90 &&
      ignoresItemContext(native.engine) && sameVariant && variant && option &&
      (change.slot === "finger1" || change.slot === "finger2") && jewelrySlots[change.slot] === option.candidate.slotType &&
      option.candidate.inventoryType === 11 && option.candidate.itemClassId === 4 && option.candidate.itemSubclassId === 0 &&
      proof?.nativeNoItemEffects === true && proof.metadataVersion === 3 && sockets?.status === "verified" &&
      !proof.effects?.length && !proof.weapon && Number.isSafeInteger(variant.itemLevel) &&
      !request.ownedChanges?.some(edit => edit.slotType === option.candidate.slotType) &&
      !request.removedSlots?.includes(option.candidate.slotType) &&
      change.enchantId && option.customization?.enchantId === change.enchantId &&
      !native.changes.some((other, index) => index !== i && other.slot === change.slot)
      ? purchasedRingScrollRating90(change.enchantId, variant.itemLevel, !change.gemIds?.length && !option.customization.gemIds?.length &&
        sockets.socketBonusId === 0 && sockets.requiredProfessionId === 0 && sockets.socketColors?.length === 3 &&
        sockets.socketColors[1] === 0 && sockets.socketColors[2] === 0 &&
        ((sockets.socketCount === 0 && sockets.socketColors[0] === 0) || (sockets.socketCount === 1 && sockets.socketColors[0] === 14))) : undefined;
    if (native.physicalFinalist && request.precision === "finalist" && sameVariant && option && variant &&
        (change.slot === "main_hand" || change.slot === "off_hand") && option.candidate.slotType.toLowerCase() === change.slot &&
        isPlainScrollWeapon90(option, variant, native.engine, native.playerLevel) &&
        !change.gemIds?.length && !option.customization?.gemIds?.length &&
        (change.enchantId ?? 0) === (option.customization?.enchantId ?? 0) &&
        !request.removedSlots?.includes(option.candidate.slotType) && !request.ownedChanges?.some(edit => edit.slotType === option.candidate.slotType) &&
        !native.changes.some((other, j) => i !== j && other.slot === change.slot)) {
      const power = weaponScrollPower90(change.enchantId ?? 0);
      if (power !== undefined) weaponScrolls.push({ index: i, power });
    }
    if (scroll !== undefined) purchasedScrollTotal += scroll;
    const directNeck = change.slot === "neck" && change.enchantId && directNeckEnchants.has(change.enchantId) &&
      option?.customization?.enchantId === change.enchantId && !option.customization.gemIds?.length;
    // A verified direct scroll adds a player rating independently of the
    // two ratings written by the suffix. Keep its contribution in the key.
    const directScroll = directNeck || (scroll !== undefined && !option?.customization?.gemIds?.length);
    const suffix = sameVariant && variant && option && jewelrySlots[change.slot] === option.candidate.slotType &&
      (!change.enchantId || directScroll) && !change.gemIds?.length && !request.ownedChanges?.some(edit => edit.slotType === option.candidate.slotType)
      ? bareJewelrySuffixIdentity(directScroll ? { ...option, customization: undefined } : option, native.engine) : undefined;
    // These prismatic gems and direct enchants cannot read the original
    // scaling bonus ID. Retain their existing rating key and the real receipt.
    const ringCurve = ratings && option ? auctionSocketedRingCurve(option, native.engine) : undefined;
    if (ratings) certifiedJewelry.push({ index: i, slot: change.slot, ratings });
    const durability = (reuseCandidateInputs || native.physicalFinalist) && sameVariant && option && !change.gemIds?.length &&
      change.slot === option.candidate.slotType.toLowerCase() ? indestructibleItemIdentity(option, native.engine) : undefined;
    const armorMissive = (reuseCandidateInputs || native.physicalFinalist) && sameVariant && option &&
      change.slot === option.candidate.slotType.toLowerCase() ? armorMissiveInputs(option, native.engine) : undefined;
    const missive = armorMissive?.missive ?? auctionMissiveComparison(change, change.slot, native.engine);
    const source = missive ? { ...change, ...missive } : change;
    return {
      ...source, ...auctionNativeItemOptions(source, native.engine, reuseCandidateInputs && change.bonusIds?.length === 0 &&
        !change.enchantId && !change.gemIds?.length, tuning, ringCurve ? proof?.nativeDropCurveV1 : curve),
      ...(durability ? { bonusIds: [], durability } : {}),
      ...(armorMissive ? { armorMissiveStats: armorMissive.stats, armorMissiveLevel: armorMissive.level } : {}),
      ...(weaponCurve ? { contextId: undefined, modifiers: undefined, contentTuningCap: undefined, bonusIds: [], weaponCurve } : {}),
      ...(armorConstantCurve ? { contextId: undefined, modifiers: undefined, contentTuningCap: undefined, armorConstantCurve,
        ...(armorConstantCurve[0] === "bare-armor-resolved-curve-v1" ? { bonusIds: [] } : {}) } : {}),
      ...(ringCurve ? { bonusIds: [13668], ringCurve } : {}),
      ...(suffix ? { bonusIds: [], bareSuffix: suffix } : {}),
      ...(scroll !== undefined ? { enchantId: undefined } : {}),
      ...(chestSuffix ? { bonusIds: [chestSuffix] } : {}),
      ...(reuseCandidateInputs && change.gemIds?.length && verifiedGemSlots.has(change.slot)
        ? { gemIds: change.gemIds.map(id => equivalentGems.get(id) ?? id) } : {}),
      ...(ratings && (change.enchantId || change.gemIds?.some(Boolean)) ? { gemIds: undefined, enchantId: undefined, ringRatings90: ratings } : {}),
    };
  });
  const worn = request.precision === "finalist" && native?.playerLevel === 90 && native.wornPrismatic?.size &&
    ignoresItemContext(native.engine) && request.ownedChanges?.length
    ? { edits: request.ownedChanges, hosts: native.wornPrismatic } : undefined;
  const directJewelry = worn && native
    ? explicitOwnedJewelry(worn.edits, worn.hosts, native.changes, request.removedSlots, native.barePrismaticRings, native.physicalFinalist) : undefined;
  // When all three socket edits and both effective ring enchants are direct,
  // their integer ratings add across hosts. A separate three-gem proof also
  // covers fixed proc enchants; it must keep both physical enchant IDs.
  const midnight = worn && native?.physicalFinalist && directJewelry?.gemColors?.slots.length !== 3
    ? ownedMidnightGemScore(worn.edits, worn.hosts, native.changes, request.removedSlots, native.barePrismaticRings) : undefined;
  const jewelry = midnight ? undefined : directJewelry;
  // Assign the total to one stable field. Keep the original purchased-only
  // key when there are no qualifying worn edits so saved scores still match.
  if (gear && (jewelry || certifiedJewelry.length >= 2)) {
    const slots = certifiedJewelry.map(piece => piece.slot);
    if (new Set(slots).size === slots.length) {
      const firstSlot = jewelry ? undefined : slots.sort()[0];
      const sum = jewelry?.ratings ?? [0, 0, 0, 0];
      for (const { ratings } of certifiedJewelry) {
        for (const [axis, amount] of ratings.entries()) sum[axis] += amount;
      }
      if (sum.some(Boolean)) {
        for (const { index, slot } of certifiedJewelry) {
          gear[index] = { ...gear[index], gemIds: undefined, enchantId: undefined,
            ringRatings90: slot === firstSlot ? sum : [0, 0, 0, 0] };
        }
      }
    }
  }
  // An owned neck edit replaces only the specified prismatic sockets. The
  // fingerprint identifies the worn item and all untouched sockets.
  let ownedChanges = midnight?.edits ?? jewelry?.edits ?? request.ownedChanges;
  let ringEnchants: number[] | undefined;
  if (reuseCandidateInputs && ownedChanges?.length) {
    if (native.wornRings && !native.changes.some(item => item.slot === "finger1" || item.slot === "finger2"))
      ringEnchants = effectiveRingEnchants(ownedChanges, native.wornRings);
    const edits = ownedChanges.flatMap(change => {
      if (ringEnchants && (change.slotType === "FINGER_1" || change.slotType === "FINGER_2"))
        return change.gems.length ? [{ ...change, enchantId: undefined }] : [];
      if (change.slotType === "NECK") return [{ ...change, gems: change.gems.map(gem =>
        ({ ...gem, itemId: equivalentGems.get(gem.itemId) ?? gem.itemId })) }];
      if (change.slotType !== "HANDS" || !change.enchantId || !professionGloveEnchants.has(change.enchantId)) return [change];
      // Replacing an installed combat enchant removes its benefit. Only a
      // positively identified bare original can share the unchanged-hand key.
      if (native.unenchantedHandsId === change.itemId && !native.changes.some(item => item.slot === "hands"))
        return change.gems.length ? [{ ...change, enchantId: undefined }] : [];
      return [{ ...change, enchantId: 3238 }];
    });
    ownedChanges = edits.length ? edits : undefined;
  }
  // Replace only the two scroll IDs in a physical measurement. Preserve both
  // full weapon inputs and keep the individual scrolls in the ranking key.
  const purchasedWeaponSpellPower90 = weaponScrolls.length === 2
    ? (weaponScrolls[0].power + weaponScrolls[1].power) || undefined : undefined;
  const normalizedGear = purchasedWeaponSpellPower90 && native ? gear?.map((row, index) =>
    weaponScrolls.some(scroll => scroll.index === index) ? { ...native.changes[index], enchantId: undefined, gemIds: undefined } : row) : gear;
  const changes = (normalizedGear ?? request.gearChanges ?? []).map(canonical)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256").update(JSON.stringify(canonical({ profileFingerprint, ...request, ownedChanges, purchasedWeaponSpellPower90, purchasedScrollTotal90: purchasedScrollTotal || undefined, explicitJewelryRatings90: jewelry?.ratings, ringEnchants: ringEnchants?.length ? ringEnchants : undefined, gearChanges: changes,
    ownedMidnightGems90: midnight?.signature, mixedJewelryGemColors90: jewelry?.gemColors, actionListMode: "native", version: 2, measurementContract: auctionMeasurementContract }))).digest("hex");
}

export function createAuctionGearMechanicalCache(now = Date.now, capacity = maximum, lifetime = ttlMs) {
  const entries = new Map<string, { expiresAt: number; simulation: GearPlanSimulation }>();
  return {
    get(key: string, verifiedEngine: string) {
      if (!verifiedEngine.startsWith("SimulationCraft")) return undefined;
      const id = `${verifiedEngine}:${key}`, entry = entries.get(id);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) { entries.delete(id); return undefined; }
      entries.delete(id); entries.set(id, entry);
      return { ...entry.simulation };
    },
    set(key: string, simulation: GearPlanSimulation) {
      if (typeof simulation.engine !== "string" || !simulation.engine.startsWith("SimulationCraft") || !Number.isFinite(simulation.dps) || simulation.dps < 0 ||
          !Number.isFinite(simulation.dpsError) || simulation.dpsError < 0 || simulation.confidence !== 95 ||
          !Number.isSafeInteger(simulation.iterations) || simulation.iterations <= 0) return;
      const id = `${simulation.engine}:${key}`;
      entries.delete(id); entries.set(id, { expiresAt: now() + lifetime, simulation: { ...simulation } });
      while (entries.size > capacity) entries.delete(entries.keys().next().value!);
    },
    clear() { entries.clear(); },
  };
}
export const auctionGearMechanicalCache = createAuctionGearMechanicalCache();
