import { createHash } from "node:crypto";
import { compareGearSimulationResults } from "./gearSimulation";
import { assertFreshMarket } from "./auctionMarket";
import { exactCommodityQuote, type ExactCommodityPrices } from "./auctionGearCost";
import type { GearPlanSimulation } from "./auctionGearTypes";

export type Enhancement = { key: string; kind: "gem" | "enchant"; consumableItemId: number; simulationId: number;
  uniqueEquipped?: boolean; profession?: { id: number; rank: number }; category?: { id: string; limit: number } };
export type EnhancementCharacter = { professions?: Record<string, number> };
export type EnhancementSlot = { slotType: string; variantKey: string; metadataKey: string; owned: boolean;
  sockets: readonly { key: string; type: string }[];
  installed?: { enchant?: Enhancement; gems: readonly (Enhancement | null)[] };
  /** Owned equipment is preserved unless this explicit opt-in is set. */
  allowOwnedChanges?: boolean };
export type EnhancementResolution = { verified: false; reason: string } | { verified: true;
  enchantApplicable: boolean; enchantChoices: readonly Enhancement[]; gemChoices: Record<string, readonly Enhancement[]> };
export type EnhancementCatalog = { version: string; complete: boolean;
  resolve: (slot: EnhancementSlot, character: EnhancementCharacter) => EnhancementResolution };
export type PricedEnhancementConfiguration = { key: string; slots: { slotType: string; variantKey: string; enchantId: number; gemIds: number[] }[];
  consumables: { itemId: number; kind: "gem" | "enchant"; quantity: number; quotedCopper: number | null; levels: { unitCopper: number; quantity: number }[]; missingQuantity: number }[];
  itemsCopper: number; totalCopper: number | null; fullyEnhanced: boolean;
  status: "priced" | "price_unknown" | "market_unverified" | "over_budget";
  sourceUpdatedAt: string | null };
export type EnhancementCheckpoint = { version: 1; inputKey: string; nextConfiguration: number;
  /** Authoritative decimal cursor for exhaustive traversal; JSON preserves every digit. */
  exactNextConfiguration?: string;
  cache: Record<string, GearPlanSimulation>; totalSimulations?: number; traversalSteps?: number; seedSelections?: number[][]; nextSeed?: number; reasons?: string[];
  confirmed?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  bestValueConfirmed?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  bestDpsConfirmed?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  bestMeasuredDps?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  finalists?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation }[] };
export type EnhancementOptimizerInput = { slots: readonly EnhancementSlot[]; catalog: EnhancementCatalog; character: EnhancementCharacter;
  prices: { prices: ExactCommodityPrices; sourceUpdatedAt: string | null }; itemsCopper: number; budgetCopper: number;
  simulationIdentity: string; signal: AbortSignal;
  simulationCache?: Record<string, GearPlanSimulation>;
  /** Enumerate every supported priced configuration, including partial and bare. */
  exhaustive?: boolean;
  objective?: "dps" | "value"; baselineDps?: number; baseline?: GearPlanSimulation;
  simulate: (configuration: PricedEnhancementConfiguration, signal: AbortSignal) => Promise<GearPlanSimulation>;
  shouldYield?: () => boolean; onCacheHit?: () => void; checkpoint?: EnhancementCheckpoint;
  /** Runtime worker capacity; never part of the durable traversal identity. */
  simulationConcurrency?: 1 | 2;
  /** Preserve validated completed siblings on an interrupted pair; cursor stays put. */
  onCheckpoint?: (checkpoint: EnhancementCheckpoint) => void;
  limits?: { configurations?: number; simulations?: number; finalists?: number }; now?: number };
export type EnhancementOptimizerResult = { checkpoint: EnhancementCheckpoint; complete: boolean; searchLimited: boolean; catalogComplete: boolean;
  visited: number; simulations: number; reasons: string[];
  configurations: PricedEnhancementConfiguration[];
  finalists: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation }[] };

const canonical = (value: unknown): unknown => {
  // Repeated catalog records occur in both resolutions and axes. Reuse their
  // canonical form only during this synchronous hash, never across a retry or
  // quote/profile mutation. The resulting JSON and checkpoint keys stay exact.
  const objects = new WeakMap<object, unknown>(), orders = new Map<string, string[]>();
  const visit = (current: unknown): unknown => {
    if (!current || typeof current !== "object") return current;
    const previous = objects.get(current);
    if (previous !== undefined) return previous;
    if (Array.isArray(current)) {
      const result = current.map(visit); objects.set(current, result); return result;
    }
    const keys = Object.keys(current), shape = JSON.stringify(keys);
    let ordered = orders.get(shape);
    if (!ordered) { ordered = keys.sort((a,b)=>a.localeCompare(b)); orders.set(shape, ordered); }
    const result: Record<string, unknown> = Object.create(null);
    objects.set(current, result);
    for (const key of ordered) result[key] = visit((current as Record<string, unknown>)[key]);
    return result;
  };
  return visit(value);
};
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const positive = (value: number) => Number.isSafeInteger(value) && value > 0;

type Choice = { slot: number; socket: number | null; enhancement: Enhancement | null; retained: boolean };
function measurement(value: GearPlanSimulation) {
  if (!Number.isFinite(value.dps) || value.dps <= 0 || !Number.isFinite(value.dpsError) || value.dpsError < 0 ||
      value.confidence !== 95 || !positive(value.iterations) || !value.engine.startsWith("SimulationCraft")) throw new Error("invalid_simulation_result");
  return { dps:value.dps, dpsError:value.dpsError, confidence:value.confidence, iterations:value.iterations, engine:value.engine };
}
function validateEnhancement(e: Enhancement, kind: Enhancement["kind"], retained = false) {
  if (e.kind !== kind || !e.key || (!positive(e.consumableItemId) && !(retained && e.consumableItemId === 0)) || !positive(e.simulationId) ||
      (e.uniqueEquipped !== undefined && typeof e.uniqueEquipped !== "boolean") ||
      (e.profession && (!positive(e.profession.id) || !positive(e.profession.rank))) ||
      (e.category && (!e.category.id || !positive(e.category.limit)))) throw new Error("invalid_enhancement_catalog");
}

/** Exact configuration evaluation, no additive stat/DPS approximation. Run once per equipment finalist.
 * Checkpoint is invalidated by market/rules/character changes; simulation cache identity includes exact installed configuration.
 */
export async function optimizeAuctionGearEnhancements(input: EnhancementOptimizerInput): Promise<EnhancementOptimizerResult> {
  const { catalog, character, signal } = input;
  const exact = input.exhaustive === true;
  const parallel = exact && input.simulationConcurrency === 2;
  signal.throwIfAborted();
  const baseline = input.baseline ? measurement(input.baseline) : undefined;
  const baselineDps = baseline?.dps ?? input.baselineDps;
  const bounds = { configurations: input.limits?.configurations ?? 128, simulations: input.limits?.simulations ?? 1, finalists: input.limits?.finalists ?? 3 };
  if (!positive(bounds.configurations) || bounds.configurations > 1024 || !positive(bounds.simulations) || bounds.simulations > 12 ||
      !positive(bounds.finalists) || bounds.finalists > 3 || !Number.isSafeInteger(input.itemsCopper) || input.itemsCopper < 0 ||
      !Number.isSafeInteger(input.budgetCopper) || input.budgetCopper < 0 || !input.simulationIdentity || !catalog.version ||
      (input.objective !== undefined && !["dps", "value"].includes(input.objective)) ||
      (input.exhaustive !== undefined && typeof input.exhaustive !== "boolean") ||
      (input.simulationConcurrency !== undefined && input.simulationConcurrency !== 1 && input.simulationConcurrency !== 2) ||
      (input.objective === "value" && (!Number.isFinite(baselineDps) || baselineDps! <= 0)) ||
      input.slots.length > 20) throw new Error("invalid_enhancement_input");
  const slots = [...input.slots].sort((a,b) => a.slotType.localeCompare(b.slotType));
  if (new Set(slots.map(s => s.slotType)).size !== slots.length) throw new Error("duplicate_equipment_slot");
  const axes: Choice[][] = [], resolutions: EnhancementResolution[] = [], reasons = new Set<string>();
  for (const [slotIndex, slot] of slots.entries()) {
    if (!slot.variantKey || !slot.metadataKey || slot.sockets.length > 8 || new Set(slot.sockets.map(s=>s.key)).size !== slot.sockets.length ||
        (slot.installed && slot.installed.gems.length !== slot.sockets.length) || (!slot.owned && slot.installed)) throw new Error("invalid_enhancement_slot");
    const resolved = catalog.resolve(slot, character); resolutions.push(resolved);
    if (!resolved.verified) { reasons.add(resolved.reason); continue; }
    if (!resolved.enchantApplicable && slot.installed?.enchant) throw new Error("invalid_installed_enchant");
    const addAxis = (socket: number | null, options: readonly Enhancement[], installed: Enhancement | null) => {
      const kind = socket === null ? "enchant" : "gem";
      if (!exact && options.length > 100) throw new Error("enhancement_catalog_limit");
      if (installed) validateEnhancement(installed, kind, true);
      const choices: Choice[] = [{slot:slotIndex,socket,enhancement:installed,retained:Boolean(installed)}];
      if (!slot.owned || slot.allowOwnedChanges) for (const e of [...options].sort((a,b)=>a.key.localeCompare(b.key))) {
        validateEnhancement(e, kind);
        if (e.profession && (character.professions?.[String(e.profession.id)] ?? -1) < e.profession.rank) continue;
        if (choices.some(c => c.enhancement?.simulationId === e.simulationId && (c.retained || c.enhancement.consumableItemId === e.consumableItemId))) continue;
        choices.push({slot:slotIndex,socket,enhancement:e,retained:false});
      }
      const priceRank = (choice: Choice) => {
        if (!choice.enhancement) return Infinity;
        if (choice.retained) return 0;
        const price = input.prices.prices[choice.enhancement.consumableItemId];
        const cost = price ? exactCommodityQuote(price.ladder,1).totalCopper : null;
        if (cost === null) reasons.add("price_unknown_or_insufficient_quantity");
        return cost ?? Infinity;
      };
      const ranked = new Map(choices.map(choice=>[choice,priceRank(choice)]));
      choices.sort((a,b)=>Number(a.enhancement === null)-Number(b.enhancement === null) || ranked.get(a)!-ranked.get(b)!);
      axes.push(choices);
    };
    if (resolved.enchantApplicable) addAxis(null, resolved.enchantChoices, slot.installed?.enchant ?? null);
    for (const [index, socket] of slot.sockets.entries()) {
      if (!Object.hasOwn(resolved.gemChoices, socket.key)) { reasons.add("socket_compatibility_unverified"); continue; }
      addAxis(index, resolved.gemChoices[socket.key], slot.installed?.gems[index] ?? null);
    }
  }
  if (slots.some(s=>s.owned && !s.allowOwnedChanges)) reasons.add("owned_equipment_preserved");
  const inputKey = hash({ traversal: exact ? "priced-exhaustive-v1" : "priced-pruned-diverse-v4", slots, resolutions, catalog:catalog.version, character,
    prices:exact ? input.prices.prices : input.prices,
    budget:input.budgetCopper, items:input.itemsCopper, objective:input.objective ?? "dps", baselineDps, baseline, identity:input.simulationIdentity, axes });
  if (input.checkpoint && (input.checkpoint.version !== 1 || input.checkpoint.inputKey !== inputKey)) throw new Error("enhancement_checkpoint_changed");
  const checkpoint: EnhancementCheckpoint = input.checkpoint ? structuredClone(input.checkpoint) : {version:1,inputKey,nextConfiguration:0,cache:{},...(exact?{exactNextConfiguration:"0"}:{})};
  if (!Number.isSafeInteger(checkpoint.nextConfiguration) || checkpoint.nextConfiguration < 0) throw new Error("invalid_enhancement_checkpoint");
  if (exact && (typeof checkpoint.exactNextConfiguration !== "string" || checkpoint.exactNextConfiguration.length > 512 ||
    !/^(0|[1-9][0-9]*)$/.test(checkpoint.exactNextConfiguration))) throw new Error("invalid_enhancement_checkpoint");
  checkpoint.totalSimulations ??= 0;
  checkpoint.traversalSteps ??= 0;
  checkpoint.nextSeed ??= 0;
  if (![checkpoint.totalSimulations,checkpoint.traversalSteps,checkpoint.nextSeed].every(value=>Number.isSafeInteger(value)&&value!>=0)) throw new Error("invalid_enhancement_checkpoint");
  checkpoint.cache = {...input.simulationCache,...checkpoint.cache};
  const confirmedEntries=[checkpoint.confirmed,checkpoint.bestValueConfirmed,checkpoint.bestDpsConfirmed];
  for (const retained of [...confirmedEntries, ...(exact?[checkpoint.bestMeasuredDps,...checkpoint.finalists??[]]:[])]) {
    if (!retained) continue;
    const simulation = measurement(retained.simulation), config = retained.configuration;
    if (!config || config.status !== "priced" || (!exact && !config.fullyEnhanced) || config.itemsCopper !== input.itemsCopper ||
      !Number.isSafeInteger(config.totalCopper) || Number(config.totalCopper) < input.itemsCopper || Number(config.totalCopper) > input.budgetCopper ||
      !checkpoint.cache[config.key] || JSON.stringify(measurement(checkpoint.cache[config.key])) !== JSON.stringify(simulation) ||
      baseline && (simulation.engine !== baseline.engine || confirmedEntries.includes(retained) &&
        (!compareGearSimulationResults(baseline, simulation).uncertainty.significant || simulation.dps <= baseline.dps))) {
      throw new Error("invalid_enhancement_checkpoint");
    }
  }
  const finalists = [...(checkpoint.finalists ?? [])];
  let confirmed = checkpoint.confirmed;
  let bestValueConfirmed = checkpoint.bestValueConfirmed, bestDpsConfirmed = checkpoint.bestDpsConfirmed;
  let bestMeasuredDps = checkpoint.bestMeasuredDps;
  const score = (f: typeof finalists[number], objective: "dps" | "value") => {
    if (objective !== "value") return f.simulation.dps;
    const gain = f.simulation.dps - baselineDps!;
    return f.configuration.totalCopper === 0 ? gain > 0 ? Infinity : gain < 0 ? -Infinity : 0 : gain / f.configuration.totalCopper!;
  };
  const rankFor = (objective: "dps" | "value") => (a: typeof finalists[number], b: typeof finalists[number]) => score(b,objective)-score(a,objective) || b.simulation.dps-a.simulation.dps ||
    a.configuration.totalCopper!-b.configuration.totalCopper! || a.configuration.key.localeCompare(b.configuration.key);
  const rank = rankFor(input.objective ?? "dps"), rankValue = rankFor("value"), rankDps = rankFor("dps");
  for (const reason of checkpoint.reasons ?? []) if(!exact || reason!=="market_unverified")reasons.add(reason);
  const configurations: PricedEnhancementConfiguration[] = [];
  let simulations = 0, visited = 0;
  let marketVerified = true;
  try { assertFreshMarket({ sourceUpdatedAt:input.prices.sourceUpdatedAt ?? "" }, input.now); } catch { marketVerified = false; reasons.add("market_unverified"); }
  const clearRetained = () => { finalists.length = 0; confirmed = bestValueConfirmed = bestDpsConfirmed = bestMeasuredDps = undefined;
    checkpoint.finalists=[];checkpoint.confirmed=checkpoint.bestValueConfirmed=checkpoint.bestDpsConfirmed=checkpoint.bestMeasuredDps=undefined;
    // Fresh quotes may reuse native measurements, but must rebuild all price-certified leaders.
    if(exact) checkpoint.exactNextConfiguration="0";
  };
  if (!marketVerified) clearRetained();
  else if (exact) for (const retained of [...finalists,confirmed,bestValueConfirmed,bestDpsConfirmed,bestMeasuredDps]) {
    if(retained) retained.configuration.sourceUpdatedAt=input.prices.sourceUpdatedAt;
  }
  if (exact && !marketVerified) return {checkpoint,complete:true,searchLimited:true,catalogComplete:catalog.complete,visited,simulations,reasons:[...reasons],configurations,finalists:[]};
  if (resolutions.some(r=>!r.verified) || reasons.has("socket_compatibility_unverified")) return {checkpoint,complete:true,searchLimited:true,catalogComplete:catalog.complete,visited,simulations,reasons:[...reasons],configurations,finalists:[]};
  const strides: bigint[] = [];
  const total = axes.reduce((n,a)=>{strides.push(n);return n*BigInt(a.length);},1n);
  const position = () => BigInt(exact ? checkpoint.exactNextConfiguration! : checkpoint.nextConfiguration);
  const moveTo = (next: bigint) => { if(exact) checkpoint.exactNextConfiguration=next.toString(); else checkpoint.nextConfiguration=Number(next); };
  const countStep = () => { checkpoint.traversalSteps=Math.min(Number.MAX_SAFE_INTEGER,checkpoint.traversalSteps!+1);visited++; };
  if (exact && position() > total) throw new Error("invalid_enhancement_checkpoint");
  const hasSeed = () => !exact && checkpoint.nextSeed! < (checkpoint.seedSelections?.length ?? 0);
  // Main traversal and lookahead use exactly the same compatibility, ladder
  // pricing and positional configuration construction. Lookahead has no cursor
  // or ranking effects and cannot certify a configuration out of order.
  const prepare = (indices: number[], configurationReasons: Set<string>):
    { valid: false; pruneAxis: number } | { valid: true; config: PricedEnhancementConfiguration } => {
    const selected = axes.map((axis,index)=>axis[indices[index]]);
    const categories = new Map<string,{count:number;limit:number}>();
    const identities = new Map<string,{count:number;unique:boolean}>();
    let valid = true, pruneAxis = 0;
    const partialQuantities = new Map<number,number>();
    // Higher radix digits form a fixed suffix. If that suffix alone is impossible,
    // skip ALL assignments of lower digits instead of spending the bounded budget on them.
    for (let axis = selected.length - 1; axis >= 0; axis--) {
      const {enhancement:e, retained} = selected[axis];
      if (e) {
        const key = `${e.kind}:${e.simulationId}`;
        const identity = identities.get(key) ?? {count:0,unique:false};
        identity.count++; identity.unique ||= e.uniqueEquipped === true; identities.set(key,identity);
        if (identity.unique && identity.count > 1) valid = false;
      }
      if (e?.profession && (character.professions?.[String(e.profession.id)] ?? -1) < e.profession.rank) { valid = false; configurationReasons.add("profession_unverified_or_insufficient"); }
      if (e?.category) {
        const previous = categories.get(e.category.id) ?? {count:0,limit:e.category.limit};
        previous.count++; previous.limit = Math.min(previous.limit,e.category.limit); categories.set(e.category.id,previous);
        if (previous.count > previous.limit) valid = false;
      }
      if (e && !retained) partialQuantities.set(e.consumableItemId,(partialQuantities.get(e.consumableItemId) ?? 0)+1);
      let partialCost = input.itemsCopper;
      for (const [itemId, quantity] of partialQuantities) {
        const price = input.prices.prices[itemId];
        const quote = price ? exactCommodityQuote(price.ladder,quantity).totalCopper : null;
        if (quote === null) { configurationReasons.add("price_unknown_or_insufficient_quantity"); valid = false; break; }
        partialCost += quote;
        if (!Number.isSafeInteger(partialCost)) throw new Error("invalid_budget");
      }
      if (partialCost > input.budgetCopper) { valid = false; configurationReasons.add("over_budget"); }
      if (!valid) { pruneAxis = axis; break; }
    }
    if (!valid) return { valid: false, pruneAxis };
    const configurationSlots = slots.map(slot=>({slotType:slot.slotType,variantKey:slot.variantKey,enchantId:0,gemIds:slot.sockets.map(()=>0)}));
    const quantities = new Map<number,number>();
    const kinds = new Map<number, Enhancement["kind"]>();
    for (const choice of selected) {
      const e = choice.enhancement;
      if (choice.socket === null) configurationSlots[choice.slot].enchantId = e?.simulationId ?? 0;
      else configurationSlots[choice.slot].gemIds[choice.socket] = e?.simulationId ?? 0;
      if (e && !choice.retained) {
        if (kinds.has(e.consumableItemId) && kinds.get(e.consumableItemId) !== e.kind) throw new Error("invalid_enhancement_catalog");
        kinds.set(e.consumableItemId,e.kind);
        quantities.set(e.consumableItemId,(quantities.get(e.consumableItemId) ?? 0)+1);
      }
    }
    const fullyEnhanced = selected.every(c=>c.enhancement !== null || (slots[c.slot].owned && !slots[c.slot].allowOwnedChanges));
    const consumables = [...quantities].sort(([a],[b])=>a-b).map(([itemId,quantity])=>{
      const quote = input.prices.prices[itemId] ? exactCommodityQuote(input.prices.prices[itemId].ladder,quantity) : {totalCopper:null,levels:[],missingQuantity:quantity};
      return {itemId,kind:kinds.get(itemId)!,quantity,quotedCopper:quote.totalCopper,levels:quote.levels,missingQuantity:quote.missingQuantity};
    });
    const known = consumables.every(c=>c.quotedCopper !== null);
    const totalCopper = known ? input.itemsCopper + consumables.reduce((sum,c)=>sum+c.quotedCopper!,0) : null;
    if (totalCopper !== null && !Number.isSafeInteger(totalCopper)) throw new Error("invalid_budget");
    const status = !marketVerified ? "market_unverified" : !known ? "price_unknown" : totalCopper! > input.budgetCopper ? "over_budget" : "priced";
    const config: PricedEnhancementConfiguration = {key:hash({identity:input.simulationIdentity,catalog:catalog.version,slots:configurationSlots,metadata:slots.map(s=>s.metadataKey)}),
      slots:configurationSlots,consumables,itemsCopper:input.itemsCopper,totalCopper,fullyEnhanced,status,sourceUpdatedAt:input.prices.sourceUpdatedAt};
    return { valid: true, config };
  };
  const indicesAt = (at: bigint) => axes.map(axis => {
    const index = Number(at % BigInt(axis.length)); at /= BigInt(axis.length); return index;
  });
  const saveCheckpoint = () => {
    checkpoint.confirmed=confirmed;checkpoint.bestValueConfirmed=bestValueConfirmed;checkpoint.bestDpsConfirmed=bestDpsConfirmed;
    if(exact)checkpoint.bestMeasuredDps=bestMeasuredDps;
    checkpoint.finalists=finalists;checkpoint.reasons=[...reasons];
    if(exact) {
      const pinned=new Set([...finalists,confirmed,bestValueConfirmed,bestDpsConfirmed,bestMeasuredDps]
        .flatMap(row=>row?[row.configuration.key]:[]));
      const recent=Object.keys(checkpoint.cache).filter(key=>!pinned.has(key)).slice(-Math.max(0,256-pinned.size));
      checkpoint.cache=Object.fromEntries([...recent,...pinned].map(key=>[key,checkpoint.cache[key]]));
    }
  };
  let prefetchedThrough: bigint | undefined;
  const measuredHere = new Set<string>();
  while ((hasSeed() || position() < total) && visited < bounds.configurations && (simulations < bounds.simulations || prefetchedThrough !== undefined && position() <= prefetchedThrough) &&
    (exact || checkpoint.totalSimulations < 12 && checkpoint.traversalSteps < 4096)) {
    if(exact && visited && visited%32===0) await new Promise<void>(resolve=>setImmediate(resolve));
    signal.throwIfAborted();
    if (input.shouldYield?.()) break;
    const fromSeed = hasSeed();
    const indices = fromSeed ? checkpoint.seedSelections![checkpoint.nextSeed!] : indicesAt(position());
    const advance = () => {
      if (fromSeed) checkpoint.nextSeed!++; else moveTo(position()+1n);
      countStep();
    };
    if (!exact && !Number.isSafeInteger(checkpoint.nextConfiguration + 1)) { reasons.add("configuration_limit"); checkpoint.traversalSteps = 4096; break; }
    const prepared = prepare(indices,reasons);
    if (!prepared.valid) {
      if (fromSeed) { advance(); continue; }
      const stride = strides[prepared.pruneAxis];
      const next = (position() / stride + 1n) * stride;
      if (!exact && next > BigInt(Number.MAX_SAFE_INTEGER)) { reasons.add("configuration_limit"); checkpoint.traversalSteps = 4096; break; }
      moveTo(next);countStep();continue;
    }
    const { config } = prepared;
    const { fullyEnhanced, status } = config;
    configurations.push(config);
    if (!fullyEnhanced) reasons.add("bare_configuration");
    if (status === "price_unknown") reasons.add("price_unknown_or_insufficient_quantity");
    // Exact metadata authorizes positional zeros. Legacy mode retains its full-fill contract.
    if (status === "priced" && (fullyEnhanced || exact)) {
      let simulation = checkpoint.cache[config.key];
      if (!simulation) {
        const batch = [config];
        let nextPosition: bigint | undefined;
        if (parallel && simulations + 1 < bounds.simulations) {
          let next = position()+1n;
          // Bound both repeated preparation work and the later real traversal.
          for (let scanned=1; next<total && visited+scanned<bounds.configurations; scanned++) {
            if(scanned%32===0)await new Promise<void>(resolve=>setImmediate(resolve));
            signal.throwIfAborted();
            if(input.shouldYield?.())break;
            const candidate=prepare(indicesAt(next),new Set());
            if(!candidate.valid) {
              const stride=strides[candidate.pruneAxis];next=(next/stride+1n)*stride;continue;
            }
            if(candidate.config.status==='priced' && candidate.config.key!==config.key && !checkpoint.cache[candidate.config.key]) {
              batch.push(candidate.config);nextPosition=next;break;
            }
            next++;
          }
        }
        if(parallel && input.shouldYield?.())break;
        if(batch.length===1) {
          simulation = measurement(await input.simulate(structuredClone(config),signal));
          signal.throwIfAborted(); checkpoint.cache[config.key] = simulation; simulations++;
          checkpoint.totalSimulations=Math.min(Number.MAX_SAFE_INTEGER,checkpoint.totalSimulations+1);
        } else {
          const controller=new AbortController(), pairSignal=AbortSignal.any([signal,controller.signal]);
          let failure: unknown;
          const results=await Promise.allSettled(batch.map(async candidate=>{
            try {
              pairSignal.throwIfAborted();
              const measured=await input.simulate(structuredClone(candidate),pairSignal);
              pairSignal.throwIfAborted();
              const result=measurement(measured);
              if((baseline && result.engine!==baseline.engine) || finalists.some(row=>row.simulation.engine!==result.engine))
                throw new Error('simulation_version_changed');
              return result;
            }catch(error){failure??=error;controller.abort(error);throw error;}
          }));
          const engines=new Set(results.flatMap(result=>result.status==='fulfilled'?[result.value.engine]:[]));
          if(engines.size>1) {
            // Without a retained engine/baseline neither differing build can be
            // certified. Keep the cursor and retry against one worker version.
            saveCheckpoint();input.onCheckpoint?.(structuredClone(checkpoint));
            signal.throwIfAborted();throw new Error('simulation_version_changed');
          }
          for(const [index,result] of results.entries())if(result.status==='fulfilled') {
            checkpoint.cache[batch[index].key]=result.value;measuredHere.add(batch[index].key);simulations++;
            checkpoint.totalSimulations=Math.min(Number.MAX_SAFE_INTEGER,checkpoint.totalSimulations+1);
          }
          // Drain every sibling before publishing facts or returning control.
          // Never move the cursor past a failed or aborted native measurement.
          if(results.some(result=>result.status==='rejected') || signal.aborted) {
            saveCheckpoint();input.onCheckpoint?.(structuredClone(checkpoint));
            signal.throwIfAborted();throw failure;
          }
          prefetchedThrough=nextPosition;
          simulation=checkpoint.cache[config.key];measuredHere.delete(config.key);
        }
      } else { simulation = measurement(simulation); if(!measuredHere.delete(config.key))input.onCacheHit?.(); }
      try { assertFreshMarket({sourceUpdatedAt:input.prices.sourceUpdatedAt ?? ""}, input.now); }
      catch { config.status = "market_unverified"; marketVerified=false;clearRetained();reasons.add("market_unverified"); if(!exact)advance();break; }
      if (!exact && !checkpoint.seedSelections) {
        // Diversify before the fast radix digit can spend the native budget on one enchant axis.
        // Seeds share ALL normal feasibility checks and the mechanical cache. They are heuristic,
        // not evidence of a globally optimal combination or independent statistical confirmation.
        const alternatives = axes.map((axis,index)=>axis.map((choice,i)=>({choice,i})).filter(({choice,i})=>
          i !== indices[index] && choice.enhancement !== null).map(({i})=>i));
        const variableAxes = alternatives.flatMap((values,index)=>values.length ? [index] : []);
        const spread = Array.from({length:Math.min(11,variableAxes.length)},(_,i)=>
          variableAxes[Math.floor(i * (variableAxes.length - 1) / Math.max(1,Math.min(11,variableAxes.length)-1))]);
        const seeds: number[][] = [], seen = new Set([indices.join(",")]);
        const add = (values:number[]) => {const key=values.join(",");if (!seen.has(key)) {seen.add(key);seeds.push(values);}};
        const at = (axis:number, stratum:number) => alternatives[axis][stratum === 0 ? 0 : stratum === 1 ? Math.floor((alternatives[axis].length-1)/2) : alternatives[axis].length-1];
        for (let stratum=0; stratum<3; stratum++) {
          // Includes later slots even when there are more axes than available native evaluations.
          add(indices.map((value,axis)=>alternatives[axis].length ? at(axis,stratum) : value));
          for (const axis of spread) { const values=[...indices];values[axis]=at(axis,stratum);add(values); }
        }
        checkpoint.seedSelections = seeds; checkpoint.nextSeed = 0;
      }
      if (finalists.some(f=>f.simulation.engine !== simulation.engine)) throw new Error("simulation_version_changed");
      const existing = finalists.findIndex(f=>f.configuration.key===config.key);
      if (existing < 0) finalists.push({configuration:config,simulation});
      else if (config.totalCopper! < finalists[existing].configuration.totalCopper!) finalists[existing] = {configuration:config,simulation};
      if (exact && (!bestMeasuredDps || rankDps({configuration:config,simulation},bestMeasuredDps)<0)) bestMeasuredDps={configuration:config,simulation};
      if (baseline) {
        if (baseline.engine !== simulation.engine) throw new Error("simulation_version_changed");
        const comparison = compareGearSimulationResults(baseline, simulation);
        const candidate = {configuration:config,simulation};
        if (comparison.deltaDps > 0 && comparison.uncertainty.significant) {
          if (!bestValueConfirmed || rankValue(candidate,bestValueConfirmed) < 0) bestValueConfirmed = candidate;
          if (!bestDpsConfirmed || rankDps(candidate,bestDpsConfirmed) < 0) bestDpsConfirmed = candidate;
          confirmed = input.objective === "value" ? bestValueConfirmed : bestDpsConfirmed;
        }
      }
      finalists.sort(rank);
      finalists.length = Math.min(finalists.length,bounds.finalists);
      if (confirmed && !finalists.some(f=>f.configuration.key === confirmed!.configuration.key)) {
        if (finalists.length === bounds.finalists) finalists.pop();
        finalists.push(confirmed); finalists.sort(rank);
      }
    }
    advance();
  }
  const exhaustive = !hasSeed() && position() >= total;
  const capped = !exact && !exhaustive && (checkpoint.totalSimulations >= 12 || checkpoint.traversalSteps >= 4096);
  if (capped) reasons.add("configuration_limit");
  saveCheckpoint();
  return {checkpoint,complete:exhaustive || capped || exact&&!marketVerified,
    searchLimited:!exhaustive || !catalog.complete || exact&&(reasons.has("price_unknown_or_insufficient_quantity")||reasons.has("profession_unverified_or_insufficient")),
    catalogComplete:catalog.complete,visited,simulations,reasons:[...reasons],configurations,finalists};
}
