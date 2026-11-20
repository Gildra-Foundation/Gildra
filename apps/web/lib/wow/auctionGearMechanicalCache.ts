import { createHash } from "node:crypto";
import type { OwnedAuctionGearChange } from "./auctionGearEnhancementOptimizer";
import type { GearPlanSimulation } from "./auctionGearTypes";
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
const professionGloveEnchants = new Set([3238, 5447, 5933, 5937, 6205]);

// Each verified rank adds one integer secondary rating based on player level.
// Keep rank IDs distinct when assigning the same two bonuses to worn rings.
const ringStatEnchants = new Set([
  7964, 7965, 7968, 7969, 7994, 7995, 7996, 7997,
  8020, 8021, 8022, 8023, 8024, 8025, 8026, 8027,
]);

const verifiedGemSlots = new Set([
  "head", "neck", "shoulder", "back", "chest", "wrist", "hands", "waist", "legs", "feet", "finger1", "finger2",
]);

type WornRing = { itemId: number; enchantId: number };

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
}, native?: { changes: SimcGearChange[]; engine: string; unenchantedHandsId?: number; wornRings?: readonly [WornRing, WornRing] }) {
  const reuseCandidateInputs = !!native && !request.precision && ignoresItemContext(native.engine);
  // Local replacements carry no Azerite powers. An empty bonus list cannot run
  // a scaling handler, including through automatic enchants in this pinned DBC.
  const gear = native ? native.changes.map(change => ({
    ...change, ...auctionNativeItemOptions(change, native.engine, reuseCandidateInputs && change.bonusIds?.length === 0 &&
      !change.enchantId && !change.gemIds?.length),
    ...(reuseCandidateInputs && change.gemIds?.length && verifiedGemSlots.has(change.slot)
      ? { gemIds: change.gemIds.map(id => equivalentGems.get(id) ?? id) } : {}),
  })) : request.gearChanges ?? [];
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
