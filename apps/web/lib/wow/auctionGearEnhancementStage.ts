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
import { auctionGearSlots } from './auctionGearSelection';
import { assertFreshMarket } from './auctionMarket';
import { validatedAuctionEnhancementMetadata } from './auctionItemVariant';

type Quotes = Awaited<ReturnType<typeof exactCommodityPrices>>;
export type AuctionEnhancementStageState = { checkpoints: Record<string, EnhancementCheckpoint>; quotes?: Quotes; quotedItemIds?: number[] };
export type AuctionEnhancedRecommendation = { label: string; configuration: PricedEnhancementConfiguration;
  simulation: GearPlanSimulation; comparison: ReturnType<typeof compareGearSimulationResults>; optionIds: string[];
  removedSlots?: string[];
  purchases: AuctionGearPurchase[]; consumableNames: Record<string, string>;
  enhancementNames?: { gems: Record<string, string>; enchants: Record<string, string> } };
export type AuctionEnhancementStageResult = { complete: boolean; status: 'pending' | 'ready' | 'unavailable' | 'no_affordable_configuration';
  traversal?: 'exhaustive'; includesOwnedEquipment?: true; equipmentChecked?: number;
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
  specId: number; level: number; region: 'eu' | 'us' | 'kr' | 'tw'; engine: string; profileFingerprint: string;
  encounter: AuctionGearEncounter; budgetCopper: number; objective: 'dps' | 'value'; baseline: GearPlanSimulation;
  selectedSlots?: readonly string[];
  simulate: (options: AuctionGearOption[], signal: AbortSignal, ownedChanges?: readonly OwnedAuctionGearChange[]) => Promise<GearPlanSimulation>;
  signal: AbortSignal; shouldYield: () => boolean; state: AuctionEnhancementStageState;
  onCacheHit?: () => void;
  quote?: typeof exactCommodityPrices;
  includeObjectiveAlternatives?: boolean;
  exhaustive?: boolean;
  includePrecisionContenders?: boolean;
  simulationConcurrency?: 1 | 2;
  additionalSearchReasons?: readonly string[];
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
  const editableSlots = new Set<string>(input.exhaustive ? input.selectedSlots ?? auctionGearSlots : []);
  const activeKeys = new Set<string>();
  const equipmentSets = new Set<string>();
  for (const finalist of input.finalists) {
    const equipmentKey=JSON.stringify(finalist.options.map(o=>o.id).sort());
    if(equipmentSets.has(equipmentKey))continue;
    equipmentSets.add(equipmentKey);
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
      // Profession facts are absent from the current trusted profile contract.
      if (metadata.requiredProfessionId) { reasons.add('profession_unverified'); unsupported = true; break; }
      const target = { itemId:option.candidate.itemId, inventoryType:option.candidate.inventoryType,
        itemClassId:option.candidate.itemClassId, itemSubclassId:option.candidate.itemSubclassId, itemLevel:variant.itemLevel,
        socketColors:metadata.socketColors, build:info.build, revision:info.simcRevision, engine:input.engine };
      const resolved = resolveExactEnhancements(target,{level:input.level,professions:[]});
      if (!resolved.verified) { reasons.add(resolved.reason); unsupported = true; break; }
      const slot: EnhancementSlot = {slotType:option.candidate.slotType,variantKey:option.variantKey,metadataKey:hash(variant.resolution?.metadataVersion===3 ? [target,metadata,3] : [target,metadata]),owned:false,
        sockets:metadata.socketColors.flatMap((color,index)=>color ? [{key:String(index),type:String(color)}] : [])};
      slots.push(slot);
      resolutions.set(slot.slotType,{...resolved,
        enchantChoices:resolved.enchantChoices.map(normalized),gemChoices:Object.fromEntries(Object.entries(resolved.gemChoices).map(([key,choices])=>[key,choices.map(normalized)]))});
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
          build:info.build,revision:info.simcRevision,engine:input.engine};
        const resolved = resolveExactEnhancements(target,{level:input.level,professions:[]});
        if (resolved.verified) {
          slot.ownedItemId = itemId;
          slot.allowOwnedChanges = true;
          slot.sockets = gems.map((_,index)=>({key:String(index),type:String(socketColors[index])}));
          resolution = {...resolved,enchantApplicable:resolved.enchantApplicable || Boolean(enchant),
            enchantChoices:resolved.enchantChoices.map(normalized),
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
    if(input.exhaustive && input.state.quotes) try{assertFreshMarket({sourceUpdatedAt:input.state.quotes.sourceUpdatedAt ?? ''},now);}catch{sourceFresh=false;}
    if(!input.state.quotes || !sourceFresh || ids.some(id=>!input.state.quotedItemIds?.includes(id)) || !Number.isFinite(Date.parse(input.state.quotes.fetchedAt)) || now-Date.parse(input.state.quotes.fetchedAt)>60_000) {
      const requested=[...new Set([...(input.state.quotedItemIds??[]),...ids])].sort((a,b)=>a-b);
      if(requested.length>512){reasons.add('enhancement_catalog_limit');continue;}
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
    const args={slots,catalog:{version:info.revision,complete:false,resolve:(slot:EnhancementSlot)=>resolutions.get(slot.slotType)!},character:{},
      prices:{prices,sourceUpdatedAt:input.state.quotes.sourceUpdatedAt},itemsCopper:auctionPlanCost(finalist.options),
      budgetCopper:input.budgetCopper,simulationIdentity:identity,objective:input.objective,baselineDps:input.baseline.dps,baseline:input.baseline,
      signal:input.signal,shouldYield:input.shouldYield,checkpoint:previous,simulationCache:previous?.cache ?? input.priorSimulations,onCacheHit:input.onCacheHit,
      exhaustive:input.exhaustive,
      simulationConcurrency:input.simulationConcurrency,
      ...(input.exhaustive && input.simulationConcurrency===2 ? {limits:{simulations:2}} : {}),
      onCheckpoint:(checkpoint:EnhancementCheckpoint)=>{input.state.checkpoints[identity]=checkpoint;},
      simulate:(config:PricedEnhancementConfiguration,signal:AbortSignal)=>input.simulate(customizedAuctionGearOptions(finalist.options,config),signal,ownedAuctionGearChanges(config))};
    let optimized;
    try { optimized=await optimizeAuctionGearEnhancements(args); }
    catch(error){if(!(error instanceof Error)||error.message!=='enhancement_checkpoint_changed')throw error;
      optimized=await optimizeAuctionGearEnhancements({...args,checkpoint:undefined});}
    input.signal.throwIfAborted();input.state.checkpoints[identity]=optimized.checkpoint;
    result.complete &&= optimized.complete;
    for(const reason of optimized.reasons) if(reason!=='bare_configuration')reasons.add(reason);
    const confirmed = optimized.finalists.find(candidate => {
      const comparison = compareGearSimulationResults(input.baseline,candidate.simulation);
      return comparison.deltaDps > 0 && comparison.uncertainty.significant;
    });
    const retained = input.exhaustive
      ? [optimized.checkpoint.bestMeasuredDps,optimized.checkpoint.bestValueConfirmed,optimized.checkpoint.bestDpsConfirmed, ...(input.includePrecisionContenders ? [optimized.checkpoint.secondMeasuredDps, optimized.checkpoint.thirdMeasuredDps] : [])].filter((candidate): candidate is NonNullable<typeof confirmed> => Boolean(candidate))
      : input.includeObjectiveAlternatives
      ? [confirmed, optimized.checkpoint.bestValueConfirmed, optimized.checkpoint.bestDpsConfirmed].filter((candidate): candidate is NonNullable<typeof confirmed> => Boolean(candidate))
      : confirmed ? [confirmed] : [];
    const selected = [...new Map((retained.length ? retained : optimized.finalists.slice(0,1)).map(candidate => [candidate.configuration.key, candidate])).values()];
    for(const [index,candidate] of selected.entries()) result.recommendations.push({label:index ? `${finalist.label}:alternative-${index}` : finalist.label,...candidate,
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
  }
  // Keep absent state only while a step yielded before reaching that finalist.
  if(result.complete) for(const key of Object.keys(input.state.checkpoints))if(!activeKeys.has(key))delete input.state.checkpoints[key];
  return finish();
}
