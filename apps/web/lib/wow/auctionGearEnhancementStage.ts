import { createHash } from 'node:crypto';
import { auctionEnhancementCatalogInfo, auctionEnhancementRecords, lookupInstalled, resolveExactEnhancements, type EnhancementRecord } from './auctionEnhancementCatalog';
import { optimizeAuctionGearEnhancements, type Enhancement, type EnhancementSlot, type EnhancementResolution, type EnhancementCheckpoint, type PricedEnhancementConfiguration } from './auctionGearEnhancementOptimizer';
import { exactCommodityPrices } from './auctionBrowserData';
import { auctionPlanCost, auctionGearPurchase } from './auctionGearPlanner';
import { customizedAuctionGearOptions } from './auctionGearEnhancedConfiguration';
import { prepareGearLoadout, compareGearSimulationResults } from './gearSimulation';
import type { GearLoadoutItem } from './gearCompatibility';
import type { AuctionGearOption, AuctionGearPurchase, GearPlanSimulation } from './auctionGearTypes';
import type { AuctionGearEncounter } from './auctionGearScenarios';
import { assertFreshMarket } from './auctionMarket';

type Quotes = Awaited<ReturnType<typeof exactCommodityPrices>>;
export type AuctionEnhancementStageState = { checkpoints: Record<string, EnhancementCheckpoint>; quotes?: Quotes; quotedItemIds?: number[] };
export type AuctionEnhancedRecommendation = { label: string; configuration: PricedEnhancementConfiguration;
  simulation: GearPlanSimulation; comparison: ReturnType<typeof compareGearSimulationResults>; optionIds: string[];
  purchases: AuctionGearPurchase[]; consumableNames: Record<string, string>;
  enhancementNames?: { gems: Record<string, string>; enchants: Record<string, string> } };
export type AuctionEnhancementStageResult = { complete: boolean; status: 'pending' | 'ready' | 'unavailable' | 'no_affordable_configuration';
  searchLimited: boolean; reasons: string[]; recommendations: AuctionEnhancedRecommendation[]; catalogRevision: string };
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalized = (record: EnhancementRecord): Enhancement => ({ ...record,
  ...(record.category ? { category: { id: String(record.category.id), limit: record.category.limit } } : { category: undefined }) });

export async function evaluateAuctionEnhancementStage(input: {
  finalists: { label: string; options: AuctionGearOption[] }[]; equipment: Record<string, unknown>; loadout: GearLoadoutItem[];
  specId: number; level: number; region: 'eu' | 'us' | 'kr' | 'tw'; engine: string; profileFingerprint: string;
  encounter: AuctionGearEncounter; budgetCopper: number; objective: 'dps' | 'value'; baseline: GearPlanSimulation;
  simulate: (options: AuctionGearOption[], signal: AbortSignal) => Promise<GearPlanSimulation>;
  signal: AbortSignal; shouldYield: () => boolean; state: AuctionEnhancementStageState;
  onCacheHit?: () => void;
  quote?: typeof exactCommodityPrices;
}): Promise<AuctionEnhancementStageResult> {
  const info = auctionEnhancementCatalogInfo, reasons = new Set<string>();
  const result: AuctionEnhancementStageResult = { complete: true, status: 'unavailable', searchLimited: true,
    reasons: [], recommendations: [], catalogRevision: info.revision };
  const informationalReasons = new Set(['owned_equipment_preserved', 'configuration_limit', 'bare_configuration', 'over_budget']);
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
  if (input.finalists.length > 2) throw new Error('invalid_scenario_limit');
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
      const metadata = variant.resolution?.enhancements;
      if (metadata?.status !== 'verified') { reasons.add('variant_enhancements_unknown'); unsupported = true; break; }
      // Profession facts are absent from the current trusted profile contract.
      if (metadata.requiredProfessionId) { reasons.add('profession_unverified'); unsupported = true; break; }
      const target = { itemId:option.candidate.itemId, inventoryType:option.candidate.inventoryType,
        itemClassId:option.candidate.itemClassId, itemSubclassId:option.candidate.itemSubclassId, itemLevel:variant.itemLevel,
        socketColors:metadata.socketColors, build:info.build, revision:info.simcRevision, engine:input.engine };
      const resolved = resolveExactEnhancements(target,{level:input.level,professions:[]});
      if (!resolved.verified) { reasons.add(resolved.reason); unsupported = true; break; }
      const slot: EnhancementSlot = {slotType:option.candidate.slotType,variantKey:option.variantKey,metadataKey:hash([target,metadata]),owned:false,
        sockets:metadata.socketColors.flatMap((color,index)=>color ? [{key:String(index),type:String(color)}] : [])};
      slots.push(slot);
      resolutions.set(slot.slotType,{verified:true,enchantApplicable:resolved.enchantApplicable,
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
      slots.push(slot);resolutions.set(slotType,{verified:true,enchantApplicable:Boolean(enchant),enchantChoices:[],gemChoices:Object.fromEntries(slot.sockets.map(s=>[s.key,[]]))});
    }
    if(unsupported)continue;
    if(input.shouldYield()){result.complete=false;break;}
    const ids=[...new Set([...resolutions.values()].flatMap(r=>r.verified ? [...r.enchantChoices,...Object.values(r.gemChoices).flat()].map(e=>e.consumableItemId).filter(id=>id>0) : []))].sort((a,b)=>a-b);
    const now=Date.now();
    if(!input.state.quotes || ids.some(id=>!input.state.quotedItemIds?.includes(id)) || !Number.isFinite(Date.parse(input.state.quotes.fetchedAt)) || now-Date.parse(input.state.quotes.fetchedAt)>60_000) {
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
    const args={slots,catalog:{version:info.revision,complete:false,resolve:(slot:EnhancementSlot)=>resolutions.get(slot.slotType)!},character:{},
      prices:{prices:input.state.quotes.prices,sourceUpdatedAt:input.state.quotes.sourceUpdatedAt},itemsCopper:auctionPlanCost(finalist.options),
      budgetCopper:input.budgetCopper,simulationIdentity:identity,objective:input.objective,baselineDps:input.baseline.dps,baseline:input.baseline,
      signal:input.signal,shouldYield:input.shouldYield,checkpoint:previous,simulationCache:previous?.cache,onCacheHit:input.onCacheHit,
      simulate:(config:PricedEnhancementConfiguration,signal:AbortSignal)=>input.simulate(customizedAuctionGearOptions(finalist.options,config),signal)};
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
    for(const candidate of (confirmed ? [confirmed] : optimized.finalists.slice(0,1))) result.recommendations.push({label:finalist.label,...candidate,
      comparison:compareGearSimulationResults(input.baseline,candidate.simulation),optionIds:finalist.options.map(o=>o.id),
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
  // At most two retained equipment finalists. Keep absent state only while a step yielded before it.
  if(result.complete) for(const key of Object.keys(input.state.checkpoints))if(!activeKeys.has(key))delete input.state.checkpoints[key];
  return finish();
}
