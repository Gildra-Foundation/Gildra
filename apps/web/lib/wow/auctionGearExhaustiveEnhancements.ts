import "server-only";
import { observeAuctionEquipment, type EquipmentLeaders } from "./auctionGearPlanner";
import { createHash } from "node:crypto";
import { createAuctionGearEnhancedLoadoutIterator, enhancedFinalistOptionKey, type AuctionGearEnhancedLoadoutState } from "./auctionGearEnhancedLoadouts";
import { evaluateAuctionEnhancementStage, type AuctionEnhancedRecommendation, type AuctionEnhancementStageResult, type AuctionEnhancementStageState } from "./auctionGearEnhancementStage";
import { compareAuctionEnhancementValue, trackValuePrecision, type ValuePrecisionContenders } from "./auctionGearEnhancementOptimizer";
import { auctionSocketedRingCurve, bareJewelrySuffixIdentity } from "./auctionGearEffects";
import { hasLevel90NeckGemRatings } from "./auctionGearMechanicalCache";
import { auctionEnhancementCatalogInfo } from "./auctionEnhancementCatalog";
import { exactCommodityPrices } from "./auctionBrowserData";
import { assertFreshMarket } from "./auctionMarket";
import { compareGearSimulationResults } from "./gearSimulation";
import type { AuctionGearOption, GearPlanSimulation } from "./auctionGearTypes";
import { auctionMissiveComparison } from "./gearItemModifiers";
import { auctionGearSlots } from "./auctionGearSelection";

type Leader = { recommendation: AuctionEnhancedRecommendation; options: AuctionGearOption[] };
type Receipt = AuctionEnhancedRecommendation;
type PrecisionPass = {
  phase: "peak" | "rank" | "done";
  replayThrough?: string;
  /** Cheapest physical receipt per native input, while the whole market fits. */
  rankReceipts?: Record<string, Receipt>;
  rankedFromReceipts?: number;
  /** Completed gear layouts on a precise pass started before screening finished. */
  checkedEquipment?: number;
  peak?: Receipt; second?: Receipt; preferred?: Receipt; outsideValue?: Receipt; confirmedDps?: Receipt; tiedAlternative?: Receipt;
};
const confirmedGain = (row: Receipt) => row.comparison.deltaDps > 0 && row.comparison.uncertainty.significant;
function rankMeasured(a: Receipt, b: Receipt) {
  return b.simulation.dps - a.simulation.dps || a.configuration.totalCopper! - b.configuration.totalCopper! ||
    a.configuration.key.localeCompare(b.configuration.key);
}
function rankTied(a: Receipt, b: Receipt) {
  return Number(confirmedGain(b)) - Number(confirmedGain(a)) ||
    a.configuration.totalCopper! - b.configuration.totalCopper! || rankMeasured(a, b);
}
// With the global peak fixed, a confirmed value winner is either the cheapest
// tied gain (highest DPS at that cost), or the best confirmed gain outside its
// interval. Neither comparison needs the other receipts in memory.
function observePrecision(pass: PrecisionPass, row: Receipt, ordinal: string, sameClass: (a: Receipt, b: Receipt) => boolean) {
  if (pass.phase === "peak") {
    const previous = pass.peak;
    if (!previous || rankMeasured(row, previous) < 0) {
      if (previous && !sameClass(previous, row)) pass.second = previous;
      pass.peak = row;
      if (previous && (previous.simulation.dps !== row.simulation.dps ||
          previous.simulation.dpsError !== row.simulation.dpsError || !sameClass(previous, row))) {
        // The membership test changed. Only receipts up to this equipment
        // ordinal can have been classified against a different leader.
        pass.replayThrough = ordinal;
        delete pass.preferred;
        delete pass.outsideValue;
        delete pass.tiedAlternative;
      }
    } else if ((!pass.second || rankMeasured(row, pass.second) < 0) && !sameClass(previous, row)) {
      pass.second = row;
    }
  }
  const peak = pass.peak!;
  const confirmed = confirmedGain(row);
  if (confirmed && (!pass.confirmedDps || rankMeasured(row, pass.confirmedDps) < 0)) pass.confirmedDps = row;
  if (!compareGearSimulationResults(peak.simulation, row.simulation).uncertainty.significant) {
    if (!pass.preferred || rankTied(row, pass.preferred) < 0) pass.preferred = row;
    if (!sameClass(peak, row) && (!pass.tiedAlternative || rankTied(row, pass.tiedAlternative) < 0)) pass.tiedAlternative = row;
  } else if (confirmed && (!pass.outsideValue || compareAuctionEnhancementValue(row, pass.outsideValue, row.comparison.baselineDps) < 0)) pass.outsideValue = row;
}
type Ranking = { valuePrecision?: ValuePrecisionContenders<Leader>; measured?: Leader; value?: Leader; dps?: Leader; runnerUp?: Leader; nextMeasured?: Leader };
type OrdinalRange = [first: string, last: string];
type PriceGroup = Ranking & { ordinals: OrdinalRange[]; checked: number; reasons: string[]; unavailable: boolean };
type SavedMeasurements = { ordinal: string; cache: Record<string, GearPlanSimulation> };
type BareEquipmentCoverage = {
  leaders: EquipmentLeaders; singles: Record<string, GearPlanSimulation>; totalAssignments: string;
  layouts: number; observedOrdinal?: string; missing?: true; covered?: true;
};
function bareEquipmentCoverage(baseline: GearPlanSimulation, totalAssignments: string): BareEquipmentCoverage {
  return { leaders: {baseline, best:{optionIds:[], simulation:baseline}, bestConfirmed:null, bestDpsConfirmed:null, bestValueConfirmed:null},
    singles:{}, totalAssignments, layouts:0 };
}
export type AuctionGearExhaustiveEnhancementState = Ranking & {
  version: 1; inputKey: string; cursor: AuctionGearEnhancedLoadoutState;
  bareEquipment?: BareEquipmentCoverage;
  directPrecision?: true;
  currentOptionIds?: string[]; stage: AuctionEnhancementStageState;
  /** Price basis of global ranking, independent of an in-flight stage refresh. */
  quoteSignatures?: Record<string, string>;
  equipmentChecked: number; reasons: string[]; unavailable: boolean;
  /** Missing on older checkpoints and when indexing would exceed the private checkpoint budget. */
  priceGroups?: Record<string, PriceGroup>;
  /** Older cursors retain every original enhancement axis. */
  omitNeutralGloveEnchants?: true;
  omitShoulderIllusions?: true;
  omitWristHearthEnchants?: true;
  omitInertFuryLeech?: true;
  pruneCradleEnchants?: true;
  pruneNeckEnchantRanks?: true;
  pruneRingEnchantRanks?: true;
  pruneArmorEnchantPairs?: true;
  pruneRingScrollPairs?: true;
  pruneBareOwnedRingRatings?: true;
  pruneTiedJewelry?: true;
  pruneOwnedJewelryGems?: true;
  pruneRingNeckPricePairs?: true;
  rangeCount?: number;
  replay?: OrdinalRange[];
  currentOrdinal?: string;
  /** Completed layout cuts by pass. Peak and tie ranking may traverse the same layouts. */
  jewelryTiePruning?: Partial<Record<"screen" | "peak" | "rank", { branches: string; configurations: string }>>;
  armorPricePruning?: Partial<Record<"screen" | "peak" | "rank", { branches: string; configurations: string }>>;
  ringPricePruning?: Partial<Record<"screen" | "peak" | "rank", { branches: string; configurations: string }>>;
  recentMeasurements?: SavedMeasurements[];
  precise?: Record<string, GearPlanSimulation>;
  preciseBaseline?: GearPlanSimulation;
  /** One affordable receipt per independent finalist input. Old checkpoints lack this index. */
  precisionPass?: PrecisionPass;
  finalistReceipts?: Record<string, AuctionEnhancedRecommendation> | "overflow";
};
type StageInput = Parameters<typeof evaluateAuctionEnhancementStage>[0];
type Input = Omit<StageInput, "finalists" | "state"> & {
  options: AuctionGearOption[]; selectedSlots?: string[]; trackBareEquipment?: boolean;
  recheck?: (options: AuctionGearOption[], configuration: AuctionEnhancedRecommendation["configuration"], signal: AbortSignal) => Promise<GearPlanSimulation>;
  finalistKey?: (options: AuctionGearOption[], configuration: AuctionEnhancedRecommendation["configuration"]) => string;
  recheckBaseline?: (signal: AbortSignal) => Promise<GearPlanSimulation>;
  state?: AuctionGearExhaustiveEnhancementState;
  onState: (state: AuctionGearExhaustiveEnhancementState) => void;
  onUpdate?: (result: AuctionEnhancementStageResult) => Promise<void>;
};
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const betterDps = (candidate: Leader, previous?: Leader) => !previous || candidate.recommendation.simulation.dps > previous.recommendation.simulation.dps ||
  candidate.recommendation.simulation.dps === previous.recommendation.simulation.dps &&
  (candidate.recommendation.configuration.totalCopper! < previous.recommendation.configuration.totalCopper! ||
    candidate.recommendation.configuration.totalCopper === previous.recommendation.configuration.totalCopper &&
    candidate.recommendation.configuration.key < previous.recommendation.configuration.key);
type FinalistAliases = { engine: string; byOption: Map<string, string> };
function finalistAliases(options: AuctionGearOption[], engine: string): FinalistAliases {
  const groups = new Map<string, AuctionGearOption[]>();
  for (const option of options) {
    const key = enhancedFinalistOptionKey(option, engine);
    if (key === undefined) continue;
    const group = groups.get(key);
    if (group) group.push(option);
    else groups.set(key, [option]);
  }
  const byOption = new Map<string, string>();
  for (const [key, group] of groups) {
    if (group.some(option => option.variantKey !== group[0].variantKey))
      for (const option of group) byOption.set(option.id, key);
  }
  return { engine, byOption };
}
// Distinct lots can buy identical gear. Their price determines which receipt to
// keep, but a second receipt cannot be an independent simulation finalist.
function sameLoadout(a: Leader, b: Leader, known?: FinalistAliases) {
  if (a.recommendation.configuration.key === b.recommendation.configuration.key) return true;
  const identity = (row: Leader) => {
    const aliases = new Map<string, { raw: string; key: string }>();
    const purchased = row.options.map(option => {
      const slot = option.candidate.slotType;
      const key = known?.engine === row.recommendation.simulation.engine ? known?.byOption.get(option.id) : undefined;
      if (key !== undefined) {
        aliases.set(slot, { raw: option.variantKey, key });
        return [slot, option.candidate.itemId, [key]];
      }
      return [slot, option.candidate.itemId, option.variantKey];
    }).sort();
    const slots = row.recommendation.configuration.slots.map(slot => {
      const alias = aliases.get(slot.slotType);
      return [slot.slotType, alias?.raw === slot.variantKey ? [alias.key] : slot.variantKey, slot.enchantId, slot.gemIds];
    }).sort();
    return JSON.stringify([purchased, slots, row.recommendation.configuration.ownedChanges]);
  };
  return identity(a) === identity(b);
}
function validRecheck(result: GearPlanSimulation, original: GearPlanSimulation) {
  return result && result.engine === original.engine && result.confidence === 95 &&
    Number.isFinite(result.dpsError) && result.dpsError >= 0 && Number.isFinite(result.dps) && result.dps > 0 &&
    Number.isSafeInteger(result.iterations) && result.iterations > original.iterations &&
    (original.iterations !== 100 || result.iterations === 750);
}
function consider(state: Ranking, candidate: Leader, retainPair: boolean, known?: FinalistAliases, valueBaseline?: GearPlanSimulation) {
  const recommendation = candidate.recommendation;
  if (recommendation.configuration.status !== "priced" || recommendation.configuration.totalCopper === null) return;
  if (retainPair && (!state.nextMeasured || betterDps(candidate, state.nextMeasured))) {
    const top = [state.measured, state.runnerUp, state.nextMeasured].filter((leader): leader is Leader => Boolean(leader));
    const duplicate = top.findIndex(leader => sameLoadout(candidate, leader, known));
    if (duplicate < 0 || betterDps(candidate, top[duplicate])) {
      if (duplicate >= 0) top.splice(duplicate, 1);
      top.push(candidate);
      [state.measured, state.runnerUp, state.nextMeasured] = top.sort((a, b) => betterDps(a, b) ? -1 : betterDps(b, a) ? 1 : 0);
    }
  } else if (!retainPair && betterDps(candidate, state.measured)) state.measured = candidate;
  if (recommendation.comparison.deltaDps <= 0 || !recommendation.comparison.uncertainty.significant) return;
  if (valueBaseline) trackValuePrecision(state.valuePrecision ??= {}, candidate, row => row.recommendation, valueBaseline);
  if (betterDps(candidate, state.dps)) state.dps = candidate;
  const score = recommendation.configuration.totalCopper / recommendation.comparison.deltaDps;
  const prior = state.value ? state.value.recommendation.configuration.totalCopper! / state.value.recommendation.comparison.deltaDps : Infinity;
  if (score < prior || score === prior && betterDps(candidate, state.value)) state.value = candidate;
}
function recommendations(state: AuctionGearExhaustiveEnhancementState, objective: Input["objective"]) {
  const candidates = [objective === "value" ? state.value : state.dps, state.measured, state.value, state.dps];
  return [...new Map(candidates.filter((leader): leader is Leader => Boolean(leader)).map(leader => [leader.recommendation.configuration.key, leader.recommendation])).values()];
}
function restamp(state: AuctionGearExhaustiveEnhancementState) {
  const sourceUpdatedAt = state.stage.quotes?.sourceUpdatedAt;
  if (!sourceUpdatedAt) return;
  for (const leader of [state.measured, state.value, state.dps, state.runnerUp, state.nextMeasured, state.valuePrecision?.lower, state.valuePrecision?.upper]) if (leader) {
    leader.recommendation = { ...leader.recommendation, configuration: { ...leader.recommendation.configuration, sourceUpdatedAt } };
  }
}
function staleQuotes(quotes: AuctionEnhancementStageState["quotes"]) {
  if (!quotes) return false;
  try { assertFreshMarket({ sourceUpdatedAt: quotes.sourceUpdatedAt ?? "" }); return false; }
  catch { return true; }
}

// Consecutive compatible assignments share two decimal endpoints. Limit both
// metadata and retained receipts independently of the mixed-radix domain.
const maxFinalistReceipts = 64;
const maxPriceGroups = 32, maxOrdinalRanges = 4096, maxMeasurementSets = 8;
function addOrdinal(group: PriceGroup, ordinal: string) {
  const last = group.ordinals.at(-1);
  if (last && BigInt(last[1]) + 1n === BigInt(ordinal)) { last[1] = ordinal; return 0; }
  group.ordinals.push([ordinal, ordinal]);
  return 1;
}
export async function advanceAuctionGearExhaustiveEnhancements(input: Input): Promise<{ state: AuctionGearExhaustiveEnhancementState; result: AuctionEnhancementStageResult }> {
  input.signal.throwIfAborted();
  const iterator = createAuctionGearEnhancedLoadoutIterator({ options: input.options,
    engine: !input.state || input.state.cursor?.nativeLotGroups ? input.engine : undefined,
    nativeLotGroups: input.state?.cursor?.nativeLotGroups, selectedSlots: input.selectedSlots ?? [...auctionGearSlots],
    loadout: input.loadout, equipment: input.equipment, specId: input.specId, budgetCopper: input.budgetCopper });
  const aliases = input.recheck ? finalistAliases(input.options, input.engine) : undefined;
  const valueBaseline = input.recheck && input.baseline.iterations === 100 ? input.baseline : undefined;
  const omitNeutralGloveEnchants = !input.state || input.state.omitNeutralGloveEnchants === true;
  const omitShoulderIllusions = (!input.state || input.state.omitShoulderIllusions === true) &&
    (!input.selectedSlots || input.selectedSlots.includes("SHOULDER"));
  const omitWristHearthEnchants = (!input.state || input.state.omitWristHearthEnchants === true) &&
    (!input.selectedSlots || input.selectedSlots.includes("WRIST"));
  const pruneCradleEnchants = (!input.state || input.state.pruneCradleEnchants === true) &&
    (!input.selectedSlots || input.selectedSlots.some(slot => slot === "MAIN_HAND" || slot === "OFF_HAND"));
  const pruneNeckEnchantRanks = input.nativePlayerLevel === 90 &&
    (!input.state || input.state.pruneNeckEnchantRanks === true) &&
    (!input.selectedSlots || input.selectedSlots.includes("NECK"));
  const pruneRingScrollPairs = input.nativePlayerLevel === 90 && (!input.state || input.state.pruneRingScrollPairs === true) &&
    (!input.selectedSlots || input.selectedSlots.includes("FINGER_1") && input.selectedSlots.includes("FINGER_2"));
  const pruneBareOwnedRingRatings = input.nativePlayerLevel === 90 && (!input.state || input.state.pruneBareOwnedRingRatings === true) &&
    (!input.selectedSlots || input.selectedSlots.some(slot => slot === "FINGER_1" || slot === "FINGER_2"));
  const pruneArmorEnchantPairs = input.nativePlayerLevel === 90 && (!input.state || input.state.pruneArmorEnchantPairs === true) &&
    (!input.selectedSlots || input.selectedSlots.includes("HEAD") && input.selectedSlots.some(slot => slot === "SHOULDER" || slot === "FEET"));
  const pruneRingEnchantRanks = input.nativePlayerLevel === 90 &&
    (!input.state || input.state.pruneRingEnchantRanks === true) &&
    (!input.selectedSlots || input.selectedSlots.some(slot => slot === "FINGER_1" || slot === "FINGER_2"));
  // The rule version below captures native capabilities separately. A worker
  // upgrade must not change the identity of a restored, unpruned traversal.
  const { furyWithoutLeechHealingV1, ...combatBaseline } = input.baseline;
  const omitInertFuryLeech = input.specId === 72 && furyWithoutLeechHealingV1 === true &&
    (!input.state || input.state.omitInertFuryLeech === true) &&
    (!input.selectedSlots || input.selectedSlots.some(slot => slot === "HEAD" || slot === "SHOULDER"));
  const collectReceipts = Boolean(input.finalistKey && input.recheck && input.recheckBaseline && valueBaseline);
  // In a new joint traversal every affordable input needs independent precision,
  // even when it fits in the 64-receipt index. Its screening score cannot exclude it.
  const directPrecision = collectReceipts && input.trackBareEquipment && (!input.state || input.state.directPrecision === true);
  const pruneTiedJewelry = collectReceipts && input.nativePlayerLevel === 90 && (!input.state || input.state.pruneTiedJewelry === true) &&
    (!input.selectedSlots || input.selectedSlots.filter(slot => ["NECK", "FINGER_1", "FINGER_2"].includes(slot)).length >= 2);
  const pruneOwnedJewelryGems = collectReceipts && input.nativePlayerLevel === 90 &&
    (!input.state || input.state.pruneOwnedJewelryGems === true) &&
    (!input.selectedSlots || input.selectedSlots.some(slot => ["NECK", "FINGER_1", "FINGER_2"].includes(slot)));
  const pruneRingNeckPricePairs = pruneOwnedJewelryGems && (!input.state || input.state.pruneRingNeckPricePairs === true) &&
    (!input.selectedSlots || input.selectedSlots.includes("NECK") && input.selectedSlots.some(s => s === "FINGER_1" || s === "FINGER_2"));
  // Older checkpoints ranked these chests as different finalists. Rebuild the
  // receipt index and the precise tie classification only on affected markets.
  const chestSuffixFinalists = collectReceipts && input.options.some(option => option.candidate.slotType === "CHEST" &&
    option.candidate.variants.some(v => v.key === option.variantKey && v.resolution?.nativeSuffixProgramV1));
  const ringRatings = collectReceipts && input.nativePlayerLevel === 90 &&
    input.options.some(option => option.candidate.slotType === "FINGER_1" || option.candidate.slotType === "FINGER_2");
  const jewelrySuffixFinalists = collectReceipts && input.options.some(option => bareJewelrySuffixIdentity(option, input.engine));
  const neckSuffixFinalists = jewelrySuffixFinalists && input.options.some(option => option.candidate.slotType === "NECK" && bareJewelrySuffixIdentity(option, input.engine));
  const ringCurveFinalists = ringRatings && input.options.some(option => auctionSocketedRingCurve(option, input.engine));
  const neckRatings = collectReceipts && input.nativePlayerLevel === 90 &&
    input.options.some(option => hasLevel90NeckGemRatings(option, input.engine));
  const missiveFinalists = collectReceipts && input.options.some(option => option.candidate.variants.some(variant =>
    variant.key === option.variantKey && auctionMissiveComparison(variant, option.candidate.slotType, input.engine)));
  const byId = new Map(input.options.map(option => [option.id, option]));
  const inputKey = hash(["owned-enhancements-partial-coverage-v1", ...(input.trackBareEquipment ? ["bare-equipment-coverage-v1"] : []), ...(directPrecision ? ["direct-independent-joint-v1"] : []), iterator.inputKey, input.profileFingerprint, input.engine, input.encounter, input.objective, combatBaseline, auctionEnhancementCatalogInfo.revision, ...(collectReceipts ? ["all-finalist-inputs-v1"] : []), ...(chestSuffixFinalists ? ["direct-chest-finalists-v1"] : []), ...(ringRatings ? ["level-90-ring-ratings-v2"] : []), ...(jewelrySuffixFinalists ? ["bare-jewelry-suffix-finalists-v1"] : []), ...(neckSuffixFinalists ? ["direct-neck-suffix-finalists-v1"] : []), ...(ringCurveFinalists ? ["socketed-ring-curve-finalists-v1"] : []), ...(neckRatings ? ["level-90-neck-ratings-v1"] : []), ...(missiveFinalists ? ["missive-finalists-v1"] : []), ...(omitNeutralGloveEnchants ? ["bare-glove-enchants-v1"] : []), ...(omitShoulderIllusions ? ["bare-shoulder-illusions-v1"] : []), ...(omitWristHearthEnchants ? ["bare-wrist-hearth-v1"] : []), ...(pruneCradleEnchants ? ["worldsoul-cradle-v1"] : []), ...(pruneNeckEnchantRanks ? ["priced-neck-enchants-v1"] : []), ...(pruneTiedJewelry ? ["tied-jewelry-receipts-v1"] : []), ...(pruneBareOwnedRingRatings ? ["bare-owned-ring-ratings-v1"] : []), ...(pruneRingScrollPairs ? ["priced-ring-scroll-pairs-v1"] : []), ...(pruneArmorEnchantPairs ? ["priced-armor-pairs-v1"] : []), ...(pruneRingEnchantRanks ? ["priced-ring-enchants-v1"] : []), ...(omitInertFuryLeech ? ["bare-fury-leech-v1"] : []), ...(pruneOwnedJewelryGems ? ["owned-jewelry-gems-v1"] : []), ...(pruneRingNeckPricePairs ? ["ring-neck-price-pairs-v1"] : []), ...(valueBaseline ? ["value-precision-v1"] : []), ...(input.recheck ? [aliases?.byOption.size ? "finalist-precision-v3" : "finalist-precision-v2"] : [])]);
  const initial = (stage: AuctionEnhancementStageState = { checkpoints: {} }): AuctionGearExhaustiveEnhancementState => ({
    version: 1, inputKey, cursor: iterator.initialState(), stage, ...(input.trackBareEquipment ? {bareEquipment:bareEquipmentCoverage(input.baseline,iterator.totalAssignments)} : {}), ...(directPrecision ? {directPrecision:true} : collectReceipts ? { finalistReceipts: {} } : {}), ...(omitNeutralGloveEnchants ? { omitNeutralGloveEnchants: true } : {}), ...(omitShoulderIllusions ? {omitShoulderIllusions:true} : {}), ...(omitWristHearthEnchants ? {omitWristHearthEnchants:true} : {}), ...(pruneCradleEnchants ? {pruneCradleEnchants:true} : {}), ...(pruneNeckEnchantRanks ? {pruneNeckEnchantRanks:true} : {}), ...(pruneTiedJewelry ? {pruneTiedJewelry:true} : {}), ...(pruneBareOwnedRingRatings ? {pruneBareOwnedRingRatings:true} : {}), ...(pruneRingScrollPairs ? {pruneRingScrollPairs:true} : {}), ...(pruneArmorEnchantPairs ? {pruneArmorEnchantPairs:true} : {}), ...(pruneRingEnchantRanks ? {pruneRingEnchantRanks:true} : {}), ...(omitInertFuryLeech ? {omitInertFuryLeech:true} : {}), ...(pruneOwnedJewelryGems ? {pruneOwnedJewelryGems:true} : {}), ...(pruneRingNeckPricePairs ? {pruneRingNeckPricePairs:true} : {}), equipmentChecked: 0, reasons: [], unavailable: false, priceGroups: {}, rangeCount: 0,
  });
  let state = input.state?.version === 1 && input.state.inputKey === inputKey ? input.state : initial();
  // Validate even an exhausted restored cursor without advancing it. Completed
  // state must satisfy the same mixed-radix ordinal proof as an active cursor.
  await iterator.nextBatch(state.cursor, { maxAssignments: 1, maxResults: 1, signal: input.signal, shouldYield: () => true });
  if (!Number.isSafeInteger(state.equipmentChecked) || state.equipmentChecked < 0 ||
      !Array.isArray(state.reasons) || !state.stage || typeof state.stage.checkpoints !== "object" ||
      state.currentOptionIds !== undefined && (!Array.isArray(state.currentOptionIds) || state.currentOptionIds.length > 16 ||
        new Set(state.currentOptionIds).size !== state.currentOptionIds.length)) throw new Error("invalid_enhancement_checkpoint");
  input.onState(state);
  let acceptedQuotes: AuctionEnhancementStageState["quotes"], acceptedIds: number[] | undefined;
  const acceptQuotes = () => {
    const quotes = state.stage.quotes;
    if (!quotes || quotes === acceptedQuotes && state.stage.quotedItemIds === acceptedIds) return false;
    // The stage replaces both objects when fetching. Recheck their contents on
    // each new runner turn, including recovery from interrupted updates.
    acceptedQuotes = quotes;
    acceptedIds = state.stage.quotedItemIds;
    const signatures = Object.fromEntries((state.stage.quotedItemIds ?? []).map(id => [String(id), hash(quotes.prices[String(id)] ?? null)]));
    const changed = new Set(Object.entries(state.quoteSignatures ?? {}).filter(([id, signature]) => signatures[id] !== signature).map(([id]) => id));
    if (changed.size) {
      if (!state.priceGroups || collectReceipts) {
        // Old checkpoints and oversized indices still prove a complete result
        // by replay. Preserve price-independent native facts across this reset.
        const { stage, precise, recentMeasurements, precisionPass, preciseBaseline } = state;
        state = { ...initial({ checkpoints: {}, quotes, quotedItemIds: stage.quotedItemIds }), precise,
          ...(precisionPass ? { finalistReceipts: "overflow", preciseBaseline } : { recentMeasurements }) };
        state.quoteSignatures = signatures;
        input.onState(state);
        return true;
      }
      for (const key of ["measured", "value", "dps", "runnerUp", "nextMeasured", "valuePrecision"] as const) delete state[key];
      state.equipmentChecked = 0;
      state.reasons = [];
      state.unavailable = false;
      for (const [key, group] of Object.entries(state.priceGroups)) {
        if (key.split(",").some(id => changed.has(id))) {
          (state.replay ??= []).push(...group.ordinals);
          delete state.priceGroups[key];
          state.rangeCount = (state.rangeCount ?? 0) - group.ordinals.length;
        } else {
          for (const leader of [group.measured, group.value, group.dps, group.runnerUp, group.nextMeasured, group.valuePrecision?.lower, group.valuePrecision?.upper])
            if (leader) consider(state, leader, Boolean(input.recheck), aliases, valueBaseline);
          state.equipmentChecked += group.checked;
          state.reasons = [...new Set([...state.reasons, ...group.reasons])];
          state.unavailable ||= group.unavailable;
        }
      }
    }
    state.quoteSignatures = signatures;
    return false;
  };
  // A quote fetch can mutate stage state before a later abort. Compare against
  // the persisted ranking basis, not just this invocation's local old value.
  acceptQuotes();
  restamp(state);
  const needsBaseline = () => Boolean(input.recheckBaseline && input.baseline.iterations === 100 &&
    state.measured && !state.preciseBaseline);
  if (state.preciseBaseline && !validRecheck(state.preciseBaseline, input.baseline)) throw new Error("invalid_enhancement_checkpoint");
  const contenders = (): Leader[] => {
    if (!input.recheck || state.replay?.length || !state.cursor.exhausted || state.currentOptionIds !== undefined || !state.measured) return [];
    if (state.finalistReceipts && state.finalistReceipts !== "overflow") {
      return Object.values(state.finalistReceipts).map(recommendation => {
        const options = recommendation.optionIds.map(id => byId.get(id));
        if (!options.every((option): option is AuctionGearOption => Boolean(option))) throw new Error("invalid_enhancement_checkpoint");
        return { options, recommendation };
      });
    }
    const leaders = new Map<string, Leader>();
    const add = (leader: Leader) => leaders.set(leader.recommendation.configuration.key, leader);
    const a = state.measured.recommendation, b = state.runnerUp?.recommendation;
    if (state.runnerUp && b && !compareGearSimulationResults(a.simulation, b.simulation).uncertainty.significant) {
      add(state.measured);
      add(state.runnerUp);
      const refinedA = state.precise?.[a.configuration.key], refinedB = state.precise?.[b.configuration.key];
      if (refinedA && refinedB && state.nextMeasured) {
        const leading = refinedA.dps >= refinedB.dps ? refinedA : refinedB;
        const next = state.nextMeasured.recommendation.simulation;
        if (next.dps >= leading.dps || !compareGearSimulationResults(leading, next).uncertainty.significant) add(state.nextMeasured);
      }
    }
    // A cheap value winner can be far below the DPS finalists. Its published
    // gain and price-per-DPS still need the same native finalist precision.
    for (const leader of [state.measured, state.dps, state.value, state.valuePrecision?.lower, state.valuePrecision?.upper]) {
      if (leader && leader.recommendation.simulation.iterations === 100) add(leader);
    }
    return [...leaders.values()];
  };
  const finish = (): { state: AuctionGearExhaustiveEnhancementState; result: AuctionEnhancementStageResult } => {
    if (state.bareEquipment && (!state.precisionPass || state.precisionPass.phase === "peak") &&
        state.cursor.exhausted && state.currentOptionIds === undefined && !state.replay?.length) state.bareEquipment.covered = true;
    if (state.precisionPass || state.directPrecision || state.finalistReceipts === "overflow") {
      const pass = state.precisionPass;
      const complete = pass?.phase === "done";
      const peak = pass?.peak, preferred = pass?.preferred;
      const verified = preferred && confirmedGain(preferred) ? preferred : undefined;
      const value = [pass?.outsideValue, verified].filter((row): row is Receipt => Boolean(row))
        .sort((a, b) => compareAuctionEnhancementValue(a, b, state.preciseBaseline!.dps))[0];
      const dps = preferred && confirmedGain(preferred) ? preferred : pass?.confirmedDps ?? preferred;
      const verifiedObjectives = complete && dps ? { dps: dps.configuration.key, value: (value ?? dps).configuration.key } : undefined;
      const choices = [input.objective === "value" ? value ?? dps : dps, preferred, value, peak];
      if (complete) choices.push(pass?.confirmedDps, pass?.second, pass?.tiedAlternative);
      const unique = new Map(choices.filter((row): row is Receipt => Boolean(row)).map(row => [row.configuration.key, row]));
      // Publish an independently measured purchase as soon as it is useful.
      // Only completion can certify a winner or its statistical tie group.
      const measured = [...unique.values()];
      const rows = complete || measured.some(row => row.optionIds.length || row.configuration.ownedChanges?.length)
        ? measured : recommendations(state, input.objective);
      const sourceUpdatedAt = state.stage.quotes?.sourceUpdatedAt;
      if (sourceUpdatedAt) assertFreshMarket({sourceUpdatedAt});
      const published = rows.map((row, index) => ({ ...row, label: index ? `exhaustive:alternative-${index}` : "exhaustive",
        configuration: { ...row.configuration, sourceUpdatedAt: sourceUpdatedAt ?? row.configuration.sourceUpdatedAt } }));
      const recheck = complete && preferred && peak && pass?.second ? {
        keys: [...unique.keys()], leaderKey: peak.configuration.key, preferredKey: preferred.configuration.key,
        significant: !pass.tiedAlternative, marginDps: compareGearSimulationResults(peak.simulation, pass.second.simulation).uncertainty.marginDps,
        indistinguishableKeys: published.filter(row => !compareGearSimulationResults(peak.simulation, row.simulation).uncertainty.significant).map(row => row.configuration.key),
      } : undefined;
      return { state, result: { traversal: "exhaustive", includesOwnedEquipment: true, complete, equipmentChecked: state.equipmentChecked,
        status: !complete ? "pending" : rows.length ? "ready" : state.unavailable ? "unavailable" : "no_affordable_configuration",
        verifiedValueKey: complete ? value?.configuration.key : undefined, verifiedObjectives, finalistRecheck: recheck,
        searchLimited: true, reasons: [...state.reasons], recommendations: published, catalogRevision: auctionEnhancementCatalogInfo.revision } };
    }
    const group = contenders();
    const refined = group.flatMap(leader => {
      const simulation = state.precise?.[leader.recommendation.configuration.key];
      if (!simulation) return [];
      if (!validRecheck(simulation, leader.recommendation.simulation)) throw new Error("invalid_enhancement_checkpoint");
      return [{ ...leader.recommendation, simulation }];
    });
    const complete = !state.replay?.length && state.cursor.exhausted && state.currentOptionIds === undefined && group.length === refined.length && !needsBaseline();
    const allInputs = Boolean(state.finalistReceipts);
    let all = recommendations(state, input.objective);
    let verifiedValueKey: string | undefined;
    let verifiedObjectives: AuctionEnhancementStageResult["verifiedObjectives"];
    let finalistRecheck: AuctionEnhancementStageResult["finalistRecheck"];
    if (complete && refined.length) {
      const baselineIndex = group.findIndex(leader => !leader.options.length && !leader.recommendation.configuration.ownedChanges?.length);
      const baseline = state.preciseBaseline ?? refined[baselineIndex]?.simulation ?? input.baseline;
      const confirmed = confirmedGain;
      const candidates = new Map((allInputs ? [] : all).map(row => [row.configuration.key, baseline === input.baseline ? row :
        { ...row, comparison: compareGearSimulationResults(baseline, row.simulation) }]));
      for (const row of refined) {
        row.comparison = compareGearSimulationResults(baseline, row.simulation);
        candidates.set(row.configuration.key, row);
      }
      const byDps = [...refined].sort(rankMeasured);
      const leading = byDps[0];
      // Compare every member directly to the highest refined mean. Overlapping
      // intervals against an intermediate candidate cannot create a chain of ties.
      const comparisons = byDps.slice(1).map(row => ({ row, ...compareGearSimulationResults(leading.simulation, row.simulation).uncertainty }));
      const tied = [leading, ...comparisons.filter(row => !row.significant).map(entry => entry.row)];
      const preferred = [...tied].sort(rankTied)[0];
      if (comparisons.length) finalistRecheck = { keys: refined.map(row => row.configuration.key), leaderKey: leading.configuration.key,
        indistinguishableKeys: tied.map(row => row.configuration.key), preferredKey: preferred.configuration.key,
        significant: tied.length === 1, marginDps: comparisons[0].marginDps };
      const dearerTies = new Set(tied.filter(row => row.configuration.totalCopper! > preferred.configuration.totalCopper!)
        .map(row => row.configuration.key));
      all = [...candidates.values()].sort((a, b) => {
        const confirmation = Number(confirmed(b)) - Number(confirmed(a));
        if (confirmation) return confirmation;
        const premium = Number(dearerTies.has(a.configuration.key)) - Number(dearerTies.has(b.configuration.key));
        if (premium) return premium;
        if (input.objective === "value" && confirmed(a) && confirmed(b)) {
          return compareAuctionEnhancementValue(a, b, baseline.dps);
        }
        const preference = Number(b === preferred) - Number(a === preferred);
        return preference || b.simulation.dps - a.simulation.dps || a.configuration.totalCopper! - b.configuration.totalCopper!;
      });
      if (valueBaseline && baseline.iterations === 750) {
        const byValue = refined.filter(row => confirmed(row) && !dearerTies.has(row.configuration.key)).sort((a, b) => compareAuctionEnhancementValue(a, b, baseline.dps));
        verifiedValueKey = byValue[0]?.configuration.key;
      }
      if (allInputs) {
        // Keep the public report bounded even after measuring the whole market.
        const dps = confirmed(preferred) ? preferred : byDps.find(confirmed) ?? preferred;
        verifiedObjectives = { dps: dps.configuration.key, value: verifiedValueKey ?? dps.configuration.key };
        const visible = new Set([dps.configuration.key, all[0]?.configuration.key, leading.configuration.key, preferred.configuration.key,
          byDps[1]?.configuration.key, tied[1]?.configuration.key, verifiedValueKey]);
        all = all.filter(row => visible.has(row.configuration.key));
        if (finalistRecheck) {
          finalistRecheck.keys = finalistRecheck.keys.filter(key => visible.has(key));
          finalistRecheck.indistinguishableKeys = finalistRecheck.indistinguishableKeys?.filter(key => visible.has(key));
        }
        // Receipts may span several refreshes with byte-identical price ladders.
        const sourceUpdatedAt = state.stage.quotes?.sourceUpdatedAt;
        if (sourceUpdatedAt) all = all.map(row => ({ ...row, configuration: { ...row.configuration, sourceUpdatedAt } }));
      }
    }
    const fresh = all.filter(row => {
      try { assertFreshMarket({ sourceUpdatedAt: row.configuration.sourceUpdatedAt ?? "" }); return true; }
      catch { return false; }
    });
    if (fresh.length < all.length) throw new Error("market_stale");
    // Local stage labels describe the slice where a candidate was first retained.
    // Public labels follow objective order after every loadout and precision comparison.
    const ranked = fresh.map((row, index) => ({ ...row, label: index ? `exhaustive:alternative-${index}` : "exhaustive" }));
    const reasons = [...state.reasons];
    return { state, result: { traversal: "exhaustive", includesOwnedEquipment:true, equipmentChecked: state.equipmentChecked, complete,
      status: !complete ? "pending" : fresh.length ? "ready" : state.unavailable ? "unavailable" : "no_affordable_configuration",
      ...(verifiedObjectives ? { verifiedObjectives } : {}), ...(verifiedValueKey ? { verifiedValueKey } : {}), ...(finalistRecheck ? { finalistRecheck } : {}), searchLimited: true, reasons, recommendations: ranked, catalogRevision: auctionEnhancementCatalogInfo.revision } };
  };
  // An exhausted cursor may be reopened when authoritative prices change. A
  // timestamp refresh alone does not invalidate expensive native measurements.
  if (state.stage.quotes && state.stage.quotedItemIds?.length &&
      (staleQuotes(state.stage.quotes) || !Number.isFinite(Date.parse(state.stage.quotes.fetchedAt)) || Date.now() - Date.parse(state.stage.quotes.fetchedAt) > 60_000)) {
    state.stage.quotes = await (input.quote ?? exactCommodityPrices)(input.region, state.stage.quotedItemIds, { refresh: true, signal: input.signal });
    input.signal.throwIfAborted();
    if (!acceptQuotes()) restamp(state);
    input.onState(state);
    if (staleQuotes(state.stage.quotes)) throw new Error("market_stale");
  }
  const identity = (row: Receipt) => input.finalistKey!(row.optionIds.map(id => byId.get(id)!), row.configuration);
  const sameClass = (a: Receipt, b: Receipt) => identity(a) === identity(b);
  const completePrecision = async () => {
    state.precisionPass!.phase = "done";
    delete state.precisionPass!.rankReceipts;
    input.onState(state);
    const update = finish();
    await input.onUpdate?.(update.result);
    input.signal.throwIfAborted();
    return update;
  };
  let lastUpdate: ReturnType<typeof finish> | undefined;
  // Reserve native lanes for each slice. A capable worker can coalesce
  // multiple prepared configurations on a lane within the same turn deadline.
  const sliceBudget = input.simulationConcurrency === 2 ? 2 : 1;
  for (let turns = 0; turns < 8; turns += sliceBudget) {
    // Entering another slice may change the cursor or prices without producing
    // an update. Only reuse a snapshot when no later slice has touched state.
    lastUpdate = undefined;
    // Once the receipt index overflows, only the full independent traversal
    // can establish the winners. Further screening cannot remove a single
    // precise fight. Restart from ordinal zero, including the partial layout.
    if ((state.directPrecision || state.finalistReceipts === "overflow") && !state.precisionPass) {
      if (input.shouldYield()) break;
      const baseline = state.preciseBaseline ?? await input.recheckBaseline!(input.signal);
      input.signal.throwIfAborted();
      if (!validRecheck(baseline, input.baseline)) throw new Error("invalid_simulation_result");
      state.preciseBaseline = baseline;
      state.precisionPass = { phase: "peak", checkedEquipment: 0, ...(state.directPrecision ? {rankReceipts:{}} : {}) };
      if (state.bareEquipment) state.bareEquipment = bareEquipmentCoverage(baseline, iterator.totalAssignments);
      state.cursor = iterator.initialState();
      delete state.currentOptionIds;
      delete state.currentOrdinal;
      delete state.replay;
      delete state.recentMeasurements;
      delete state.priceGroups;
      state.stage.checkpoints = {};
      input.onState(state);
    }
    if (state.precisionPass?.phase === "done") break;
    if (state.precisionPass?.phase === "rank" && state.currentOptionIds === undefined &&
        (state.cursor.exhausted || BigInt(state.cursor.visited) > BigInt(state.precisionPass.replayThrough!))) {
      return completePrecision();
    }
    if (state.currentOptionIds === undefined && state.replay?.length) {
      if (input.shouldYield()) break;
      const range = state.replay.at(-1)!;
      if (!Array.isArray(range) || range.length !== 2 || range.some(value => typeof value !== "string" ||
          value.length > state.cursor.visited.length || !/^(0|[1-9]\d*)$/.test(value)) ||
          BigInt(range[0]) > BigInt(range[1]) || BigInt(range[1]) >= BigInt(state.cursor.visited))
        throw new Error("invalid_enhancement_checkpoint");
      state.currentOrdinal = range[0];
      state.currentOptionIds = await iterator.optionIdsAt(state.currentOrdinal, input.signal);
      if (range[0] === range[1]) state.replay.pop();
      else range[0] = (BigInt(range[0]) + 1n).toString();
      state.stage.checkpoints = {};
      input.onState(state);
    } else if (state.currentOptionIds === undefined && !state.cursor.exhausted) {
      const batch = await iterator.nextBatch(state.cursor, { maxAssignments: 128, maxResults: 1, signal: input.signal, shouldYield: input.shouldYield });
      state.cursor = batch.state;
      const current = batch.loadouts[0];
      if (current) {
        state.currentOptionIds = current.options.map(option => option.id);
        state.currentOrdinal = (BigInt(batch.state.visited) - 1n).toString();
        state.stage.checkpoints = {};
      }
      input.onState(state);
    }
    if (state.currentOptionIds === undefined) {
      if (input.shouldYield()) break;
      if (state.precisionPass && state.cursor.exhausted && !state.replay?.length) {
        if (state.bareEquipment) state.bareEquipment.covered = true;
        if (state.precisionPass.replayThrough === undefined) {
          return completePrecision();
        }
        state.precisionPass.phase = "rank";
        if (state.precisionPass.rankReceipts) {
          // With the peak fixed, all receipts for one native input have the same
          // gain, uncertainty and tie membership. Its cheapest receipt wins
          // every price tie and every confirmed gain-per-gold comparison.
          const rows = Object.values(state.precisionPass.rankReceipts);
          for (const row of rows) observePrecision(state.precisionPass, row, "0", sameClass);
          state.precisionPass.rankedFromReceipts = rows.length;
          return completePrecision();
        }
        state.cursor = iterator.initialState();
        state.stage.checkpoints = {};
        // Both traversals use the same independent baseline and precision.
        // Keep the recent native results that are inside the replay range.
        const through = BigInt(state.precisionPass.replayThrough);
        state.recentMeasurements = state.recentMeasurements?.filter(row => BigInt(row.ordinal) <= through);
        delete state.priceGroups;
        input.onState(state);
        continue;
      }
      const jobs: (() => Promise<void>)[] = [];
      const recheckBaseline = input.recheckBaseline, recheck = input.recheck;
      const measureBaseline = state.cursor.exhausted && !state.replay?.length && needsBaseline() && recheckBaseline;
      if (measureBaseline) jobs.push(async () => {
        const result = await measureBaseline(input.signal);
        input.signal.throwIfAborted();
        if (!validRecheck(result, input.baseline)) throw new Error("invalid_simulation_result");
        state.preciseBaseline = result;
        input.onState(state);
      });
      // Submit ready finalists together. The native transport groups compatible
      // rows and schedules at most two processes, just as it does for screening.
      const finalistCapacity = sliceBudget === 2 ? 2 * Math.max(1, Math.min(25, input.simulationBatchSize ?? 0)) : 1;
      for (const leader of contenders()) {
        if (!recheck || jobs.length >= finalistCapacity) break;
        const row = leader.recommendation, key = row.configuration.key;
        const original = !leader.options.length && !row.configuration.ownedChanges?.length;
        if (state.precise?.[key] || (original && measureBaseline)) continue;
        jobs.push(async () => {
          const simulation = original && state.preciseBaseline ? state.preciseBaseline :
            await recheck(leader.options, row.configuration, input.signal);
          input.signal.throwIfAborted();
          if (simulation.engine !== row.simulation.engine) throw new Error("simulation_version_changed");
          if (!validRecheck(simulation, row.simulation)) throw new Error("invalid_simulation_result");
          const precise = state.precise ??= {};
          precise[key] = simulation;
          if (Object.keys(precise).length > 16) {
            const active = new Set(contenders().map(other => other.recommendation.configuration.key));
            const oldest = Object.keys(precise).find(k => !active.has(k));
            if (oldest) delete precise[oldest];
          }
          input.onState(state);
        });
      }
      if (!jobs.length) break;
      // A successful sibling stays resumable even when another native call fails.
      const results = await Promise.allSettled(jobs.map(run => run()));
      const failed = results.find(result => result.status === "rejected");
      if (failed) throw failed.reason;
      lastUpdate = finish();
      await input.onUpdate?.(lastUpdate.result);
      input.signal.throwIfAborted();
      if (lastUpdate.result.complete || input.shouldYield()) return lastUpdate;
      continue;
    }
    const selected = state.currentOptionIds.map(id => byId.get(id));
    if (!selected.every((option): option is AuctionGearOption => Boolean(option))) throw new Error("invalid_enhancement_checkpoint");
    let dependencies: number[] = [];
    const pass = state.precisionPass, preciseBaseline = state.preciseBaseline, receipts = state.finalistReceipts;
    const newScreenKeys = new Set<string>();

    const result = await evaluateAuctionEnhancementStage({ ...input, exhaustive: true, omitNeutralGloveEnchants, omitShoulderIllusions, omitWristHearthEnchants, omitInertFuryLeech, pruneCradleEnchants, pruneNeckEnchantRanks, pruneRingEnchantRanks, pruneArmorEnchantPairs, pruneRingScrollPairs, pruneBareOwnedRingRatings, pruneOwnedJewelryGems, pruneRingNeckPricePairs, pruneEquivalentRingGems: collectReceipts, includeObjectiveAlternatives: true, includePrecisionContenders: Boolean(input.recheck),
      preciseReceiptKey: pass && pruneTiedJewelry ? config => input.finalistKey!(selected, config) : undefined,
      finalists: [{ label: "exhaustive", options: selected }], state: state.stage,
      shouldYield: () => input.shouldYield() || (!pass && state.finalistReceipts === "overflow"),
      // At most this many new comparisons can fit before screening must stop.
      // Duplicate receipts may need a later slice with the same remaining capacity.
      remainingScreenComparisons: !pass && receipts && receipts !== "overflow"
        ? () => maxFinalistReceipts + 1 - Object.keys(receipts).length : undefined,
      onPricedScreenWitness: !pass && receipts && receipts !== "overflow" ? configuration => {
        const key = input.finalistKey!(selected, configuration);
        if (!Object.hasOwn(receipts, key)) newScreenKeys.add(key);
        if (newScreenKeys.size + Object.keys(receipts).length > maxFinalistReceipts) state.finalistReceipts = "overflow";
      } : undefined,
      ...(pass && preciseBaseline ? {
        baseline: preciseBaseline, includePrecisionContenders: false,
        simulateConfiguration: async (options: AuctionGearOption[], configuration: Receipt["configuration"], signal: AbortSignal) => {
          if (!options.length && !configuration.ownedChanges?.length) return preciseBaseline;
          const result = await input.recheck!(options, configuration, signal);
          if (!validRecheck(result, input.baseline)) throw new Error("invalid_simulation_result");
          return result;
        },
      } : {}),
      onMeasured: pass || state.bareEquipment || state.finalistReceipts && state.finalistReceipts !== "overflow" ? (configuration, describe) => {
        let row: Receipt | undefined;
        const measured = () => row ??= describe();
        const bare = state.bareEquipment;
        if (bare && (!pass || pass.phase === "peak") && configuration.status === "priced" && configuration.totalCopper === configuration.itemsCopper &&
            !configuration.consumables.length && !configuration.ownedChanges?.length) {
          const { simulation } = measured();
          if (simulation.iterations !== bare.leaders.baseline.iterations || simulation.engine !== bare.leaders.baseline.engine)
            throw new Error("invalid_simulation_result");
          observeAuctionEquipment(bare.leaders, selected, simulation, best => best.optionIds.map(id => byId.get(id)!), input.objective);
          if (selected.length === 1) for (const option of iterator.equivalentSingles(selected[0].id)) bare.singles[option.id] = simulation;
          bare.observedOrdinal = state.currentOrdinal;
        }
        if (pass) {
          const receipt = measured();
          observePrecision(pass, receipt, state.currentOrdinal!, sameClass);
          if (pass.phase === "peak" && pass.rankReceipts) {
            const key = input.finalistKey!(selected, configuration);
            const prior = pass.rankReceipts[key];
            if (prior && (prior.simulation.dps !== receipt.simulation.dps || prior.simulation.dpsError !== receipt.simulation.dpsError) ||
                !prior && Object.keys(pass.rankReceipts).length >= maxFinalistReceipts) {
              delete pass.rankReceipts;
            } else if (!prior || rankMeasured(receipt, prior) < 0) pass.rankReceipts[key] = receipt;
          }
          return;
        }
        const receipts = state.finalistReceipts;
        if (!receipts || receipts === "overflow") return;
        const key = input.finalistKey!(selected, configuration);
        const previous = receipts[key]?.configuration;
        if (previous && (previous.totalCopper! < configuration.totalCopper! ||
            previous.totalCopper === configuration.totalCopper && previous.key <= configuration.key)) return;
        if (!previous && Object.keys(receipts).length >= maxFinalistReceipts) {
          state.finalistReceipts = "overflow";
          return;
        }
        receipts[key] = measured();
      } : undefined,
      onPriceDependencies: itemIds => { dependencies = itemIds; },
      priorSimulations: state.recentMeasurements?.find(entry => entry.ordinal === state.currentOrdinal)?.cache });
    input.signal.throwIfAborted();
    if (result.reasons.includes("market_unverified") || staleQuotes(state.stage.quotes)) {
      // A missing fresh market is not a visited equipment set. Keep this exact
      // assignment/checkpoint for an explicit retry, without automatic spinning.
      input.onState(state);
      throw new Error("market_stale");
    }
    // The stage used the refreshed prices. Revoke older dependent results before publication.
    if (acceptQuotes()) break;
    restamp(state);
    const candidates = result.recommendations.map(recommendation => ({ recommendation, options: selected }));
    if (!pass) for (const candidate of candidates) consider(state, candidate, Boolean(input.recheck), aliases, valueBaseline);
    state.reasons = [...new Set([...state.reasons, ...result.reasons])];
    if (result.complete) {
      const ordinal = state.currentOrdinal;
      if (state.bareEquipment && (!pass || pass.phase === "peak")) {
        // The empty purchase is the measured baseline. Other layouts must
        // have produced their own unmodified, priced receipt on this pass.
        if (selected.length && state.bareEquipment.observedOrdinal !== ordinal) state.bareEquipment.missing = true;
        state.bareEquipment.layouts++;
        delete state.bareEquipment.observedOrdinal;
      }
      if (state.priceGroups && ordinal !== undefined) {
        const key = dependencies.join(",");
        const group = state.priceGroups[key] ??= { ordinals: [], checked: 0, reasons: [], unavailable: false };
        state.rangeCount = (state.rangeCount ?? 0) + addOrdinal(group, ordinal);
        group.checked++;
        group.unavailable ||= result.status === "unavailable";
        group.reasons = [...new Set([...group.reasons, ...result.reasons])];
        for (const candidate of candidates) consider(group, candidate, Boolean(input.recheck), aliases, valueBaseline);
        if (Object.keys(state.priceGroups).length > maxPriceGroups || state.rangeCount + (state.replay?.length ?? 0) > maxOrdinalRanges) {
          delete state.priceGroups;
          delete state.rangeCount;
        }
      }
      const layout = Object.values(state.stage.checkpoints)[0];
      for (const key of ["ringPricePruning", "armorPricePruning", "jewelryTiePruning"] as const) {
        const pruned = layout?.[key];
        if (!pruned || pass?.phase === "done") continue;
        const phase = pass?.phase ?? "screen";
        const totals = state[key] ??= {};
        const counts = totals[phase] ??= { branches: "0", configurations: "0" };
        counts.branches = (BigInt(counts.branches) + BigInt(pruned.branches)).toString();
        counts.configurations = (BigInt(counts.configurations) + BigInt(pruned.configurations)).toString();
      }
      const cache = layout?.cache;
      if (ordinal !== undefined && cache && Object.keys(cache).length) {
        const recent = (state.recentMeasurements ?? []).filter(row => row.ordinal !== ordinal);
        recent.push({ ordinal, cache });
        if (recent.length > maxMeasurementSets) {
          // A large reprice can start before every warm set. Keep measurements
          // for queued assignments until their turn to consume them.
          const obsolete = recent.findIndex(row => !state.replay?.some(([start, end]) =>
            BigInt(start) <= BigInt(row.ordinal) && BigInt(row.ordinal) <= BigInt(end)));
          recent.splice(obsolete < 0 ? 0 : obsolete, 1);
        }
        state.recentMeasurements = recent;
      }
      if (!pass) state.equipmentChecked++;
      else if (pass.phase === "peak" && pass.checkedEquipment !== undefined)
        state.equipmentChecked = Math.max(state.equipmentChecked, ++pass.checkedEquipment);
      state.unavailable ||= result.status === "unavailable";
      state.currentOptionIds = undefined;
      state.currentOrdinal = undefined;
      state.stage.checkpoints = {};
    }
    input.onState(state);
    const update = finish();
    await input.onUpdate?.(update.result);
    input.signal.throwIfAborted();
    lastUpdate = update;
    if (update.result.complete || input.shouldYield()) return update;
  }
  // Revalidate freshness after the durable callback, but preserve the identity
  // of its exact snapshot so the runner need not save/publish it a second time.
  const final = finish();
  return lastUpdate ?? final;
}
