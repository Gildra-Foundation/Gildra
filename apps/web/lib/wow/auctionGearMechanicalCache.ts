import { createHash } from "node:crypto";
import type { OwnedAuctionGearChange } from "./auctionGearEnhancementOptimizer";
import type { AuctionGearOption, GearPlanSimulation } from "./auctionGearTypes";
import { auctionAppliedStatsKey } from "./auctionGearEffects";
import { auctionNativeItemOptions, ignoresItemContext } from "./gearItemModifiers";
import { auctionMeasurementContract, type SimcGearChange } from "./gearSimulation";

const ttlMs = 15 * 60_000;
const maximum = 4096;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]));
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

// Each verified rank adds one integer secondary rating based on player level.
// Keep rank IDs distinct when assigning the same two bonuses to worn rings.
const ringStatEnchants = new Set([
  7964, 7965, 7968, 7969, 7994, 7995, 7996, 7997,
  8020, 8021, 8022, 8023, 8024, 8025, 8026, 8027,
]);

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
    if (!enchant || !ringStatEnchants.has(enchant)) return;
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
  if (change.enchantId && (!ring || !ringStatEnchants.has(change.enchantId))) return;
  const gem = change.gemIds?.[0] ?? 0;
  if ((change.gemIds?.length ?? 0) > 1 || (gem !== 0 && !directPrismaticGems.has(gem))) return;
  const c = option.candidate, variant = c.variants.find(v => v.key === option.variantKey);
  const resolution = variant?.resolution, meta = resolution?.enhancements;
  if (c.itemId !== change.itemId || c.inventoryType !== (ring ? 11 : 2) || c.itemClassId !== 4 ||
      !variant || !Number.isSafeInteger(variant.itemLevel) || variant.itemLevel < 10 ||
      resolution?.engine !== engine || resolution.nativeNoItemEffects !== true || meta?.status !== "verified" ||
      meta.socketCount !== 1 || meta.socketBonusId !== 0 || meta.requiredProfessionId !== 0 ||
      meta.socketColors?.length !== 3 || meta.socketColors[0] !== 14 || meta.socketColors[1] !== 0 || meta.socketColors[2] !== 0) return;
  return equivalentGems.get(gem) ?? gem;
}

/** Certify one ring, gem and enchant using the same host checks as the
 * independent finalist key. Other enchants keep their original native inputs. */
export function purchasedRingGemEffect(option: AuctionGearOption, engine: string, gemId: number, enchantId: number) {
  const slotType = option.candidate.slotType;
  if (!ignoresItemContext(engine) || (slotType !== "FINGER_1" && slotType !== "FINGER_2") ||
      enchantId !== 0 && !ringStatEnchants.has(enchantId)) return;
  return directJewelryGem({ slot: slotType === "FINGER_1" ? "finger1" : "finger2",
    itemId: option.candidate.itemId, gemIds: [gemId] }, option, engine);
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
  if (!changed || !ids.every(id => id === 0 || ringStatEnchants.has(id))) return;
  // Both effective enchants are additive. If their multiset equals the
  // original, the ordinary unchanged-ring score already covers the request.
  const [a, b] = ids.sort((left, right) => left - right);
  const first = rings[0].enchantId, second = rings[1].enchantId;
  return a === Math.min(first, second) && b === Math.max(first, second) ? [] : [a, b];
}

/** No credentials, localized presentation, prices or character names are retained. */
export function auctionGearMechanicalKey(profileFingerprint: string, request: {
  spec: string; scenario: string; fightLengthSeconds: number; targets: number; gearChanges?: unknown[]; removedSlots?: readonly string[]; ownedChanges?: readonly OwnedAuctionGearChange[]; precision?: "finalist";
}, native?: { changes: SimcGearChange[]; options?: AuctionGearOption[]; engine: string; unenchantedHandsId?: number; wornRings?: readonly [WornRing, WornRing] }) {
  const reuseCandidateInputs = !!native && !request.precision && ignoresItemContext(native.engine);
  // Local replacements carry no Azerite powers. An empty bonus list cannot run
  // a scaling handler, including through automatic enchants in this pinned DBC.
  const gear = native ? native.changes.map((change, i) => {
    const option = native.options?.[i];
    const variant = option?.candidate.variants.find(row => row.key === option.variantKey);
    const resolution = variant?.resolution;
    const proof = resolution?.engine === native.engine ? resolution : undefined;
    // The curve depends on the item bonus program. A prepared change may be
    // reordered or rewritten by jewelry normalization before it reaches here.
    const bonuses = variant?.bonusIds;
    const sameProgram = option?.candidate.itemId === change.itemId && Array.isArray(bonuses) &&
      bonuses.length === change.bonusIds?.length && bonuses.every((id, index) => id === change.bonusIds?.[index]);
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
      option?.candidate.slotType === "CHEST" && sameProgram && proof?.nativeSuffixProgramV1 &&
      option.customization?.enchantId === change.enchantId && !change.gemIds?.length &&
      !request.ownedChanges?.some(edit => edit.slotType === "CHEST") &&
      (change.contextId ?? 0) === (variant?.contextId ?? 0) &&
      JSON.stringify(change.modifiers ?? []) === JSON.stringify(variant?.modifiers ?? [])
      ? auctionAppliedStatsKey([option], native.engine, "enchanted-suffix") : undefined;
    return {
      ...change, ...auctionNativeItemOptions(change, native.engine, reuseCandidateInputs && change.bonusIds?.length === 0 &&
        !change.enchantId && !change.gemIds?.length, tuning, curve),
      ...(chestSuffix ? { bonusIds: [chestSuffix] } : {}),
      ...(reuseCandidateInputs && change.gemIds?.length && verifiedGemSlots.has(change.slot)
        ? { gemIds: change.gemIds.map(id => equivalentGems.get(id) ?? id) } : {}),
    };
  }) : request.gearChanges ?? [];
  // An owned neck edit replaces only the specified prismatic sockets. The
  // fingerprint identifies the worn item and all untouched sockets.
  let ownedChanges = request.ownedChanges;
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
  const changes = gear.map(canonical).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256").update(JSON.stringify(canonical({ profileFingerprint, ...request, ownedChanges, ringEnchants: ringEnchants?.length ? ringEnchants : undefined, gearChanges: changes,
    actionListMode: "native", version: 2, measurementContract: auctionMeasurementContract }))).digest("hex");
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
