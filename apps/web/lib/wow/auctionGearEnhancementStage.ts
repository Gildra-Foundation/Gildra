import { professionEligibility, type CharacterProfessions } from "./characterProfessions";
import { createHash } from 'node:crypto';
import { auctionEnhancementCatalogInfo, auctionEnhancementRecords, lookupInstalled, resolveExactEnhancements, type EnhancementRecord } from './auctionEnhancementCatalog';
import { optimizeAuctionGearEnhancements, type Enhancement, type EnhancementSlot, type EnhancementResolution, type EnhancementCheckpoint, type PricedEnhancementConfiguration, type OwnedAuctionGearChange } from './auctionGearEnhancementOptimizer';
import { exactCommodityPrices } from './auctionBrowserData';
import { auctionPlanCost, auctionGearPurchase } from './auctionGearPlanner';
import { customizedAuctionGearOptions, ownedAuctionGearChanges } from './auctionGearEnhancedConfiguration';
import { prepareGearLoadout, compareGearSimulationResults } from './gearSimulation';
import type { GearLoadoutItem } from './gearCompatibility';
import type { AuctionGearOption, AuctionGearPurchase, GearPlanSimulation } from './auctionGearTypes';
import type { AuctionGearEncounter } from './auctionGearScenarios';
import { isPlainScrollWeapon90, directNeckEnchantGroup, isWorldsoulCradle, neutralProfessionGloveEnchant, neutralShoulderIllusion, neutralWristHearthEnchant, pureArmorLeechEnchant, purchasedJewelryGemEffect, hasLevel90RingRatings } from './auctionGearMechanicalCache';
import { ignoresItemContext } from './gearItemModifiers';
import { isDirectRingEnchant, ringEnchantRepresentative90, ringGemRepresentative90 } from './auctionRingRatings';
import { auctionGearSlots } from './auctionGearSelection';
import { assertFreshMarket } from './auctionMarket';
import { validatedAuctionEnhancementMetadata } from './auctionItemVariant';

// In each group, every scroll installs the same integer stat at player level 90.
// Each hand retains its physical weapon. Catalog eligibility and both hands’
// demand are checked before a more expensive scroll is removed.
const weaponScrollGroups90 = [[2563, 2668], [2568, 2666], [2667, 3828], [3830, 3846], [2504, 2505, 2669]] as const;
const weaponScrollRepresentatives90 = new Map<number, number>(
  weaponScrollGroups90.flatMap(group => group.map(id => [id, group[0]] as const))
);

type Quotes = Awaited<ReturnType<typeof exactCommodityPrices>>;
export type AuctionEnhancementStageState = { checkpoints: Record<string, EnhancementCheckpoint>; quotes?: Quotes; quotedItemIds?: number[] };
export type AuctionEnhancedRecommendation = { label: string; configuration: PricedEnhancementConfiguration;
  simulation: GearPlanSimulation; comparison: ReturnType<typeof compareGearSimulationResults>; optionIds: string[];
  removedSlots?: string[];
  purchases: AuctionGearPurchase[]; consumableNames: Record<string, string>;
  enhancementNames?: { gems: Record<string, string>; enchants: Record<string, string> } };
export type AuctionEnhancementStageResult = { complete: boolean; status: 'pending' | 'ready' | 'unavailable' | 'no_affordable_configuration';
  traversal?: 'exhaustive' | 'preview'; includesOwnedEquipment?: true; equipmentChecked?: number;
  verifiedValueKey?: string;
  verifiedObjectives?: { dps: string; value: string };
  finalistRecheck?: { keys: string[]; significant: boolean; marginDps: number;
    leaderKey?: string; indistinguishableKeys?: string[]; preferredKey?: string; competingKey?: string };
  searchLimited: boolean; reasons: string[]; recommendations: AuctionEnhancedRecommendation[]; catalogRevision: string };
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalized = (record: EnhancementRecord): Enhancement => ({ ...record,
  ...(record.category ? { category: { id: String(record.category.id), limit: record.category.limit } } : { category: undefined }) });

/** Keep scenario work within its existing three-candidate bound while retaining
 * both actually measured objectives. Extra equipment proposals are not extra
 * encounter simulations for every variant. */
export function auctionEnhancementScenarioFinalists(recommendations: AuctionEnhancedRecommendation[], objective: 'dps' | 'value') {
  const confirmed = recommendations.filter(row => row.comparison.deltaDps > 0 && row.comparison.uncertainty.significant);
  const rank = (mode: 'dps' | 'value') => (a: AuctionEnhancedRecommendation, b: AuctionEnhancedRecommendation) => {
    if (mode === 'value' && a.comparison.deltaDps > 0 && b.comparison.deltaDps > 0) {
      const difference = a.configuration.totalCopper! / a.comparison.deltaDps - b.configuration.totalCopper! / b.comparison.deltaDps;
      if (difference) return difference;
    }
    return b.comparison.deltaDps - a.comparison.deltaDps || a.configuration.totalCopper! - b.configuration.totalCopper! || a.configuration.key.localeCompare(b.configuration.key);
  };
  const requested = [...recommendations].sort(rank(objective))[0];
  const value = [...confirmed].sort(rank('value'))[0], dps = [...confirmed].sort(rank('dps'))[0];
  return [...new Map([requested, value, dps].filter((row): row is AuctionEnhancedRecommendation => Boolean(row)).map(row => [row.configuration.key, row])).values()];
}

export async function evaluateAuctionEnhancementStage(input: {
  finalists: { label: string; options: AuctionGearOption[] }[]; equipment: Record<string, unknown>; loadout: GearLoadoutItem[];
  specId: number; level: number; faction?: string; professions?: CharacterProfessions; region: 'eu' | 'us' | 'kr' | 'tw'; engine: string; profileFingerprint: string;
  encounter: AuctionGearEncounter; budgetCopper: number; objective: 'dps' | 'value'; baseline: GearPlanSimulation;
  selectedSlots?: readonly string[];
  simulate: (options: AuctionGearOption[], signal: AbortSignal, ownedChanges?: readonly OwnedAuctionGearChange[]) => Promise<GearPlanSimulation>;
  signal: AbortSignal; shouldYield: () => boolean; state: AuctionEnhancementStageState;
  onCacheHit?: () => void;
  quote?: typeof exactCommodityPrices;
  includeObjectiveAlternatives?: boolean;
  exhaustive?: boolean;
  omitNeutralGloveEnchants?: boolean;
  omitShoulderIllusions?: boolean;
  omitWristHearthEnchants?: boolean;
  omitInertFuryLeech?: boolean;
  pruneCradleEnchants?: boolean;
  pruneWeaponEnchantRanks?: boolean;
  pruneNeckEnchantRanks?: boolean;
  pruneRingEnchantRanks?: boolean;
  pruneArmorEnchantPairs?: boolean;
  pruneRingScrollPairs?: boolean;
  pruneBareOwnedRingRatings?: boolean;
  preciseReceiptKey?: (configuration: PricedEnhancementConfiguration) => string;
  pruneEquivalentRingGems?: boolean;
  pruneOwnedJewelryGems?: boolean;
  useMidnightGemPrices?: () => boolean;
  pruneMixedMidnightPrices?: boolean;
  pruneTiedMidnightGems?: boolean;
  twoGemWitnesses?: boolean;
  pruneWeaponGemPrices?: boolean;
  pruneRingNeckPricePairs?: boolean;
  nativePlayerLevel?: number;
  preview?: boolean;
  includePrecisionContenders?: boolean;
  simulationConcurrency?: 1 | 2;
  simulationBatchSize?: number;
  remainingScreenComparisons?: () => number;
  onPricedScreenWitness?: (configuration: PricedEnhancementConfiguration) => void;
  simulationOwnedBatch?: boolean;
  additionalSearchReasons?: readonly string[];
  simulateConfiguration?: (options: AuctionGearOption[], configuration: PricedEnhancementConfiguration, signal: AbortSignal) => Promise<GearPlanSimulation>;
  onMeasured?: (configuration: PricedEnhancementConfiguration, describe: () => AuctionEnhancedRecommendation) => void;
  onPriceDependencies?: (itemIds: number[]) => void;
  priorSimulations?: EnhancementCheckpoint["cache"];
}): Promise<AuctionEnhancementStageResult> {
  if(input.exhaustive!==undefined && typeof input.exhaustive!=='boolean')throw new Error('invalid_enhancement_input');
  const info = auctionEnhancementCatalogInfo, reasons = new Set<string>(input.additionalSearchReasons);
  const result: AuctionEnhancementStageResult = { complete: true, status: 'unavailable', searchLimited: true,
    reasons: [], recommendations: [], catalogRevision: info.revision, ...(input.exhaustive?{traversal:'exhaustive',includesOwnedEquipment:true}:{}) };
  if(input.exhaustive)reasons.add('enhancement_catalog_subset');
  const informationalReasons = new Set(['owned_equipment_preserved', 'configuration_limit', 'bare_configuration', 'over_budget', 'socket_candidate_subset', 'socket_candidate_limit', 'enhancement_catalog_subset']);
  const finish = () => {
    result.recommendations = result.recommendations.filter(recommendation => {
      try { assertFreshMarket({sourceUpdatedAt:recommendation.configuration.sourceUpdatedAt ?? ''}); return true; }
      catch { reasons.add('market_unverified'); return false; }
    });
    result.reasons = [...reasons]; result.status = !result.complete ? 'pending'
    : result.recommendations.length ? 'ready' : [...reasons].some(reason => !informationalReasons.has(reason))
      ? 'unavailable' : 'no_affordable_configuration'; return result; };
  input.signal.throwIfAborted();
  if (!input.engine.includes(info.simcRevision.slice(0, 7))) { reasons.add('engine_build_mismatch'); return finish(); }
  // At most three retained equipment objectives and two socket proposals.
  if (input.finalists.length > 5) throw new Error('invalid_enhancement_candidate_limit');
  const editableSlots = new Set<string>((input.exhaustive || input.preview) ? input.selectedSlots ?? auctionGearSlots : []);
  const activeKeys = new Set<string>();
  const equipmentSets = new Set<string>();
  for (const finalist of input.finalists) {
    const equipmentKey=JSON.stringify(finalist.options.map(o=>o.id).sort());
    if(equipmentSets.has(equipmentKey))continue;
    equipmentSets.add(equipmentKey);
    const inertFuryLeech = input.exhaustive && input.omitInertFuryLeech && input.specId === 72 && ignoresItemContext(input.engine);
    const cradleSlots = new Set<string>();
    const eligibleWeapon = (slot: string, itemClass: number) => input.exhaustive && input.pruneCradleEnchants &&
      ignoresItemContext(input.engine) && itemClass === 2 && (slot === 'MAIN_HAND' || slot === 'OFF_HAND');
    const purchasedWeaponRanks = new Set<string>();
    const bareRingSlots = new Set<string>();
    const certifiedRing = (slot: string, inventory: number, itemClass: number) => input.exhaustive &&
      (input.pruneRingScrollPairs || input.pruneBareOwnedRingRatings) && input.nativePlayerLevel === 90 && ignoresItemContext(input.engine) &&
      (slot === "FINGER_1" || slot === "FINGER_2") && inventory === 11 && itemClass === 4;
    const scrollWeapons = new Set<string>();
    const bareArmorSlots90 = new Set<string>();
    const certifiedArmor = (slot: string, inventory: number, itemClass: number) => input.exhaustive &&
      input.pruneArmorEnchantPairs && input.nativePlayerLevel === 90 && ignoresItemContext(input.engine) && itemClass === 4 &&
      (slot === "HEAD" && inventory === 1 || slot === "SHOULDER" && inventory === 3 || slot === "FEET" && inventory === 8);
    const ownedGemSlots = new Set<string>(), midnightHosts = new Set<string>();
    let bareOwnedNeck = false;
    const slots: EnhancementSlot[] = [], resolutions = new Map<string, EnhancementResolution>();
    const replaced = new Set(finalist.options.map(o => o.candidate.slotType));
    const removed = new Set(prepareGearLoadout({selections:finalist.options,equipment:input.equipment,loadout:input.loadout,specId:input.specId}).removedSlots);
    let unsupported = false;
    for (const option of finalist.options) {
      const variant = option.candidate.variants.find(v => v.key === option.variantKey)!;
      let metadata;
      try { metadata = variant.resolution ? validatedAuctionEnhancementMetadata(variant.resolution) : undefined; }
      catch { metadata = undefined; }
      if (metadata?.status !== 'verified') { reasons.add('variant_enhancements_unknown'); unsupported = true; break; }
      if (metadata.requiredProfessionId) {
        const eligible = professionEligibility(input.professions, metadata.requiredProfessionId, metadata.requiredProfessionRank);
        if (eligible !== 'eligible') {
          reasons.add(eligible === 'unknown' ? 'profession_unverified' : 'profession_restricted');
          unsupported = true;
          break;
        }
      }
      const target = { itemId:option.candidate.itemId, inventoryType:option.candidate.inventoryType,
        itemClassId:option.candidate.itemClassId, itemSubclassId:option.candidate.itemSubclassId, itemLevel:variant.itemLevel,
        ...(variant.resolution?.effectsVerified === true && Array.isArray(variant.resolution.effects) && variant.resolution.effects.length === 0
          ? {hasOnUseEffect:false} : {}),
        socketColors:metadata.socketColors, build:info.build, revision:info.simcRevision, engine:input.engine };
      const resolved = resolveExactEnhancements(target,{level:input.level,faction:input.faction,professions:input.professions});
      if (!resolved.verified) { reasons.add(resolved.reason); unsupported = true; break; }
      const slot: EnhancementSlot = {slotType:option.candidate.slotType,variantKey:option.variantKey,metadataKey:hash(variant.resolution?.metadataVersion===3 ? [target,metadata,3] : [target,metadata]),owned:false,
        sockets:metadata.socketColors.flatMap((color,index)=>color ? [{key:String(index),type:String(color)}] : [])};
      slots.push(slot);
      if (!option.customization && certifiedRing(slot.slotType, target.inventoryType, target.itemClassId))
        bareRingSlots.add(slot.slotType);
      if (!option.customization && certifiedArmor(slot.slotType, target.inventoryType, target.itemClassId))
        bareArmorSlots90.add(slot.slotType);
      const bareShoulder = input.exhaustive && input.omitShoulderIllusions && slot.slotType === 'SHOULDER' &&
        target.inventoryType === 3 && !option.customization;
      const bareWrist = input.exhaustive && input.omitWristHearthEnchants && slot.slotType === 'WRIST' &&
        target.inventoryType === 9 && !option.customization;
      if (input.exhaustive && input.pruneWeaponEnchantRanks && input.nativePlayerLevel === 90 &&
          ignoresItemContext(input.engine) && variant.resolution?.engine === input.engine &&
          variant.resolution.metadataVersion === 3 && !option.customization && target.itemClassId === 2 &&
          (slot.slotType === 'MAIN_HAND' || slot.slotType === 'OFF_HAND') &&
          Number.isSafeInteger(target.itemLevel) && target.itemLevel >= 10 && target.itemLevel <= 120)
        purchasedWeaponRanks.add(slot.slotType);
      if (input.pruneWeaponGemPrices && !option.customization && isPlainScrollWeapon90(option, variant, input.engine, input.nativePlayerLevel))
        scrollWeapons.add(slot.slotType);
      const bareWeapon = !option.customization && eligibleWeapon(slot.slotType, target.itemClassId);
      resolutions.set(slot.slotType,{...resolved,
        enchantChoices:resolved.enchantChoices.filter(e =>
          !(bareWeapon && isWorldsoulCradle(e.simulationId)) &&
          !(bareShoulder && neutralShoulderIllusion(e.simulationId, input.engine)) &&
          !(bareWrist && neutralWristHearthEnchant(e.simulationId, input.engine)) &&
          !(inertFuryLeech && !option.customization && pureArmorLeechEnchant(slot.slotType, target.inventoryType, e.simulationId))).map(normalized),gemChoices:Object.fromEntries(Object.entries(resolved.gemChoices).map(([key,choices])=>[key,choices.map(normalized)]))});
    }
    if (unsupported) continue;
    // Retained equipment is not bought again, but its enhancements consume uniqueness limits.
    for (const raw of rows(input.equipment.equipped_items)) {
      const item=obj(raw), slotType=String(obj(item.slot).type ?? '');
      if (!slotType || replaced.has(slotType) || removed.has(slotType)) continue;
      const gems: (Enhancement|null)[]=[];
      for(const socket of rows(item.sockets)) {
        const id=Number(obj(obj(socket).item).id ?? 0);
        if(!id){gems.push(null);continue;}
        const found=lookupInstalled('gem',id);
        if(!found.verified){reasons.add(found.reason);unsupported=true;break;}
        gems.push(normalized(found.enhancement));
      }
      if(unsupported)break;
      const permanent=rows(item.enchantments).filter(e=>Number(obj(obj(e).enchantment_slot).id ?? 0)===0);
      if(permanent.length>1){reasons.add('installed_enhancement_unknown');unsupported=true;break;}
      let enchant: Enhancement|undefined;
      if(permanent.length){const found=lookupInstalled('enchant',Number(obj(permanent[0]).enchantment_id));
        if(!found.verified){reasons.add(found.reason);unsupported=true;break;} enchant=normalized(found.enhancement);}
      const slot:EnhancementSlot={slotType,variantKey:`owned:${hash(item)}`,metadataKey:input.profileFingerprint,owned:true,
        sockets:gems.map((_,index)=>({key:String(index),type:'retained'})),installed:{gems,...(enchant?{enchant}:{})}};
      let resolution: EnhancementResolution = {verified:true,enchantApplicable:Boolean(enchant),enchantChoices:[],
        gemChoices:Object.fromEntries(slot.sockets.map(s=>[s.key,[]]))};
      if (editableSlots.has(slotType)) {
        const itemId = Number(obj(item.item).id);
        const equipped = input.loadout.find(row => row.slotType === slotType && row.itemId === itemId);
        const socketColors: number[] = rows(item.sockets).map(socket => obj(obj(socket).socket_type).type === 'PRISMATIC' ? 14 : -1);
        while (socketColors.length < 3) socketColors.push(0);
        const target = {itemId, inventoryType:equipped?.inventoryType ?? -1, itemClassId:Number(obj(item.item_class).id),
          itemSubclassId:equipped?.itemSubclassId ?? -1, itemLevel:Number(obj(item.level).value), socketColors,
          ...(Array.isArray(item.spells) && item.spells.length === 0 ? {hasOnUseEffect:false} : {}),
          build:info.build,revision:info.simcRevision,engine:input.engine};
        const resolved = resolveExactEnhancements(target,{level:input.level,faction:input.faction,professions:input.professions});
        if (resolved.verified) {
          // Leaving an originally bare glove unchanged has the same native effect
          // and costs zero. Every purchasable scroll costs strictly positive copper.
          const unenchanted = item.enchantments === undefined || Array.isArray(item.enchantments) && !item.enchantments.length;
          if (unenchanted && obj(item.inventory_type).type === "FINGER" && certifiedRing(slotType, target.inventoryType, target.itemClassId))
            bareRingSlots.add(slotType);
          if (unenchanted && obj(item.inventory_type).type === slotType && certifiedArmor(slotType, target.inventoryType, target.itemClassId))
            bareArmorSlots90.add(slotType);
          const weapon = eligibleWeapon(slotType, target.itemClassId);
          // A paid overwrite may remove a working enchant, so it cannot be
          // substituted with free retention unless the original is also inert.
          const freeCradle = weapon && (unenchanted || rows(item.enchantments).length === 1 &&
            !!enchant && isWorldsoulCradle(enchant.simulationId));
          if (weapon && !freeCradle) cradleSlots.add(slotType);
          const bareGloves = unenchanted && input.exhaustive && input.omitNeutralGloveEnchants &&
            slotType === 'HANDS' && obj(item.inventory_type).type === 'HAND';
          const bareShoulder = unenchanted && input.exhaustive && input.omitShoulderIllusions &&
            slotType === 'SHOULDER' && obj(item.inventory_type).type === 'SHOULDER' && target.inventoryType === 3;
          const bareLeechHost = inertFuryLeech && unenchanted && obj(item.inventory_type).type === slotType;
          const bareWrist = unenchanted && input.exhaustive && input.omitWristHearthEnchants &&
            slotType === 'WRIST' && obj(item.inventory_type).type === 'WRIST' && target.inventoryType === 9;
          // Both paid edits replace this exact socket with a bare gem ID. They
          // preserve every other socket, item bonus and installed enhancement.
          const neck = slotType === 'NECK' && target.inventoryType === 2 && obj(item.inventory_type).type === 'NECK';
          const ring = (slotType === 'FINGER_1' || slotType === 'FINGER_2') && target.inventoryType === 11 && obj(item.inventory_type).type === 'FINGER';
          if (input.pruneOwnedJewelryGems && input.nativePlayerLevel === 90 && ignoresItemContext(input.engine) &&
              (neck || ring) && target.itemClassId === 4 && target.itemLevel >= 120 && gems.length === 1 && socketColors[0] === 14)
            ownedGemSlots.add(slotType);
          if (neck && unenchanted && ownedGemSlots.has(slotType)) bareOwnedNeck = true;
          if (input.useMidnightGemPrices && ownedGemSlots.has(slotType) && obj(item.item_class).id === 4 &&
              Number.isSafeInteger(obj(item.item).id) && itemId > 0 && Number.isSafeInteger(obj(item.level).value) &&
              Array.isArray(item.sockets) && item.sockets.length === 1 && (!neck || unenchanted))
            midnightHosts.add(slotType);
          slot.ownedItemId = itemId;
          slot.allowOwnedChanges = true;
          slot.sockets = gems.map((_,index)=>({key:String(index),type:String(socketColors[index])}));
          resolution = {...resolved,enchantApplicable:resolved.enchantApplicable || Boolean(enchant),
            enchantChoices:resolved.enchantChoices.filter(e =>
              !(freeCradle && isWorldsoulCradle(e.simulationId)) &&
              !(bareGloves && neutralProfessionGloveEnchant(e.simulationId, input.engine)) &&
              !(bareShoulder && neutralShoulderIllusion(e.simulationId, input.engine)) &&
              !(bareWrist && neutralWristHearthEnchant(e.simulationId, input.engine)) &&
              !(bareLeechHost && pureArmorLeechEnchant(slotType, target.inventoryType, e.simulationId))).map(normalized),
            gemChoices:Object.fromEntries(Object.entries(resolved.gemChoices).map(([key,choices])=>[key,choices.map(normalized)]))};
        } else {
          // Preserve unknown instances and their installed unique limits while
          // allowing independently verified slots to contribute upgrades.
          resolution = {...resolution,coverageGaps:[resolved.reason]};
        }
      }
      slots.push(slot);resolutions.set(slotType,resolution);
    }
    if(unsupported)continue;
    if(input.shouldYield()){result.complete=false;break;}
    const ids=[...new Set([...resolutions.values()].flatMap(r=>r.verified ? [...r.enchantChoices,...Object.values(r.gemChoices).flat()].map(e=>e.consumableItemId).filter(id=>id>0) : []))].sort((a,b)=>a-b);
    input.onPriceDependencies?.(ids);
    const now=Date.now();
    let sourceFresh=true;
    if((input.exhaustive || input.preview) && input.state.quotes) try{assertFreshMarket({sourceUpdatedAt:input.state.quotes.sourceUpdatedAt ?? ''},now);}catch{sourceFresh=false;}
    if(!input.state.quotes || !sourceFresh || ids.some(id=>!input.state.quotedItemIds?.includes(id)) || !Number.isFinite(Date.parse(input.state.quotes.fetchedAt)) || now-Date.parse(input.state.quotes.fetchedAt)>60_000) {
      const requested=[...new Set([...(input.state.quotedItemIds??[]),...ids])].sort((a,b)=>a-b);
      input.state.quotes=requested.length ? await (input.quote??exactCommodityPrices)(input.region,requested,{refresh:true,signal:input.signal})
        : {prices:{},sourceUpdatedAt:new Date(now).toISOString(),fetchedAt:new Date(now).toISOString()};
      input.state.quotedItemIds=requested;
    }
    input.signal.throwIfAborted();
    const identity=hash([input.profileFingerprint,input.engine,input.encounter,finalist.options.map(o=>[o.id,o.variantKey])]);
    activeKeys.add(identity);
    const previous=input.state.checkpoints[identity];
    // Only the prices eligible for these exact slots enter the exhaustive cursor.
    const prices = input.exhaustive ? Object.fromEntries(ids.filter(id=>Object.hasOwn(input.state.quotes!.prices,id))
      .map(id=>[id,input.state.quotes!.prices[id]])) : input.state.quotes.prices;
    const batchSize = finalist.options.length || input.simulationOwnedBatch ? input.simulationBatchSize ?? 0 : 0;
    const describe = (candidate: {configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation}, label = finalist.label): AuctionEnhancedRecommendation => ({label,...candidate,
      comparison:compareGearSimulationResults(input.baseline,candidate.simulation),optionIds:finalist.options.map(o=>o.id),
      removedSlots:[...removed],
      purchases:finalist.options.map(auctionGearPurchase),
      enhancementNames: {
        gems:Object.fromEntries(auctionEnhancementRecords.filter(r=>r.kind==='gem' && r.name && candidate.configuration.slots.some(s=>s.gemIds.includes(r.simulationId))).map(r=>[String(r.simulationId),r.name!])),
        enchants:Object.fromEntries(auctionEnhancementRecords.filter(r=>r.kind==='enchant' && r.name && candidate.configuration.slots.some(s=>s.enchantId===r.simulationId)).map(r=>[String(r.simulationId),r.name!])),
      },
      consumableNames:Object.fromEntries(candidate.configuration.consumables.flatMap(c=>{
        const record=auctionEnhancementRecords.find(r=>r.consumableItemId===c.itemId);
        return record?.name ? [[String(c.itemId),record.name]] : [];
      }))});
    const ratingRingSlots = new Set(finalist.options
      .filter(option => input.pruneEquivalentRingGems && hasLevel90RingRatings(option, input.engine, input.nativePlayerLevel))
      .map(option => option.candidate.slotType));
    for (const slot of ownedGemSlots) if (slot === 'FINGER_1' || slot === 'FINGER_2') ratingRingSlots.add(slot);
    const pricedJewelry = input.exhaustive && input.nativePlayerLevel === 90 && ignoresItemContext(input.engine);
    const pricedNeck = pricedJewelry && input.pruneNeckEnchantRanks && slots.some(slot => slot.slotType === "NECK");
    const pricedRings = pricedJewelry && input.pruneRingEnchantRanks &&
      slots.some(slot => slot.slotType === "FINGER_1" || slot.slotType === "FINGER_2");
    const args={slots,catalog:{version:info.revision,complete:false,resolve:(slot:EnhancementSlot)=>resolutions.get(slot.slotType)!},
      character:input.professions ? {professions:Object.fromEntries(Object.entries(input.professions.ranks).map(([id, rank]) => [id, rank ?? 0]))} : {},
      prices:{prices,sourceUpdatedAt:input.state.quotes.sourceUpdatedAt},itemsCopper:auctionPlanCost(finalist.options),
      budgetCopper:input.budgetCopper,simulationIdentity:identity,objective:input.objective,baselineDps:input.baseline.dps,baseline:input.baseline,
      signal:input.signal,shouldYield:input.shouldYield,checkpoint:previous,simulationCache:previous?.cache ?? input.priorSimulations,onCacheHit:input.onCacheHit,
      exhaustive:input.exhaustive, valuePrecision: input.exhaustive && input.includePrecisionContenders && input.baseline.iterations === 100,
      simulationConcurrency:input.simulationConcurrency,
      simulationBatchSize:batchSize, simulationOwnedBatch:input.simulationOwnedBatch,
      remainingScreenComparisons:input.remainingScreenComparisons, onPricedScreenWitness:input.onPricedScreenWitness,
      ...(input.exhaustive && input.simulationConcurrency===2 ? {limits:{simulations:2 * Math.max(1, batchSize)}} : {}),
      preciseReceiptKey: input.preciseReceiptKey,
      pruneWeaponGemPrices: scrollWeapons.size === 2 && !removed.has("MAIN_HAND") && !removed.has("OFF_HAND"),
      pruneTiedMidnightGems: input.pruneTiedMidnightGems, twoGemWitnesses: input.twoGemWitnesses,
      pruneMixedMidnightPrices: input.pruneMixedMidnightPrices && bareRingSlots.size === 2,
      useMidnightGemPrices: midnightHosts.size === 3 ? input.useMidnightGemPrices : undefined,
      // With two bought rings the finalist normalizer can move gems between
      // their physical hosts. Keep that case on its existing joint price proof.
      ringNeckPricePairs: input.pruneRingNeckPricePairs && bareOwnedNeck &&
        !(replaced.has("FINGER_1") && replaced.has("FINGER_2")),
      bareRingScrolls90: input.pruneRingScrollPairs && bareRingSlots.size === 2,
      bareOwnedRingRatings: input.pruneBareOwnedRingRatings ? bareRingSlots : undefined, bareArmorSlots90, ratingRingSlots, ratingOwnedNeck: ownedGemSlots.has("NECK"),
      purchasedEnchantEffect: purchasedWeaponRanks.size || cradleSlots.size || pricedNeck || pricedRings ? (slot: string, id: number) => {
        if (pricedRings && (slot === "FINGER_1" || slot === "FINGER_2")) return ringEnchantRepresentative90(id);
        if (pricedNeck && slot === "NECK") return directNeckEnchantGroup(id);
        if (purchasedWeaponRanks.has(slot)) return weaponScrollRepresentatives90.get(id);
        return cradleSlots.has(slot) && isWorldsoulCradle(id) ? 8006 : undefined;
      } : undefined,
      ownedGemEffect: ownedGemSlots.size ? (slot: string, id: number, enchantId: number) =>
        ownedGemSlots.has(slot) && (!enchantId || slot !== 'NECK' && isDirectRingEnchant(enchantId))
          ? ringGemRepresentative90(id) : undefined : undefined,
      purchasedGemEffect: input.pruneEquivalentRingGems ? (slot: string, id: number, enchantId: number) => {
        const host = finalist.options.find(option => option.candidate.slotType === slot);
        return host && purchasedJewelryGemEffect(host, input.engine, id, enchantId, input.nativePlayerLevel);
      } : undefined,
      onMeasured: input.onMeasured && ((configuration: PricedEnhancementConfiguration, simulation: GearPlanSimulation) =>
        input.onMeasured!(configuration, () => describe({ configuration, simulation }))),
      onCheckpoint:(checkpoint:EnhancementCheckpoint)=>{input.state.checkpoints[identity]=checkpoint;},
      simulate:(config:PricedEnhancementConfiguration,signal:AbortSignal)=>input.simulateConfiguration ? input.simulateConfiguration(finalist.options,config,signal) : input.simulate(customizedAuctionGearOptions(finalist.options,config),signal,ownedAuctionGearChanges(config))};
    let optimized;
    try { optimized=await optimizeAuctionGearEnhancements(args); }
    catch(error){if(!(error instanceof Error)||error.message!=='enhancement_checkpoint_changed')throw error;
      optimized=await optimizeAuctionGearEnhancements({...args,checkpoint:undefined});}
    input.state.checkpoints[identity]=optimized.checkpoint;input.signal.throwIfAborted();
    result.complete &&= optimized.complete;
    for(const reason of optimized.reasons) if(reason!=='bare_configuration')reasons.add(reason);
    const confirmed = optimized.finalists.find(candidate => {
      const comparison = compareGearSimulationResults(input.baseline,candidate.simulation);
      return comparison.deltaDps > 0 && comparison.uncertainty.significant;
    });
    const retained = input.exhaustive
      ? [optimized.checkpoint.bestMeasuredDps,optimized.checkpoint.bestValueConfirmed,optimized.checkpoint.bestDpsConfirmed, ...(input.includePrecisionContenders ? [optimized.checkpoint.secondMeasuredDps, optimized.checkpoint.thirdMeasuredDps, optimized.checkpoint.valuePrecision?.lower, optimized.checkpoint.valuePrecision?.upper] : [])].filter((candidate): candidate is NonNullable<typeof confirmed> => Boolean(candidate))
      : input.includeObjectiveAlternatives
      ? [confirmed, optimized.checkpoint.bestValueConfirmed, optimized.checkpoint.bestDpsConfirmed].filter((candidate): candidate is NonNullable<typeof confirmed> => Boolean(candidate))
      : confirmed ? [confirmed] : [];
    const selected = [...new Map((retained.length ? retained : optimized.finalists.slice(0,1)).map(candidate => [candidate.configuration.key, candidate])).values()];
    for (const [index, candidate] of selected.entries())
      result.recommendations.push(describe(candidate, index ? `${finalist.label}:alternative-${index}` : finalist.label));
  }
  // Keep absent state only while a step yielded before reaching that finalist.
  if(result.complete) for(const key of Object.keys(input.state.checkpoints))if(!activeKeys.has(key))delete input.state.checkpoints[key];
  return finish();
}
