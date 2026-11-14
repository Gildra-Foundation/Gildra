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
  cache: Record<string, GearPlanSimulation>; totalSimulations?: number; traversalSteps?: number; seedSelections?: number[][]; nextSeed?: number; reasons?: string[];
  confirmed?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation };
  finalists?: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation }[] };
export type EnhancementOptimizerInput = { slots: readonly EnhancementSlot[]; catalog: EnhancementCatalog; character: EnhancementCharacter;
  prices: { prices: ExactCommodityPrices; sourceUpdatedAt: string | null }; itemsCopper: number; budgetCopper: number;
  simulationIdentity: string; signal: AbortSignal;
  simulationCache?: Record<string, GearPlanSimulation>;
  objective?: "dps" | "value"; baselineDps?: number; baseline?: GearPlanSimulation;
  simulate: (configuration: PricedEnhancementConfiguration, signal: AbortSignal) => Promise<GearPlanSimulation>;
  shouldYield?: () => boolean; onCacheHit?: () => void; checkpoint?: EnhancementCheckpoint;
  limits?: { configurations?: number; simulations?: number; finalists?: number }; now?: number };
export type EnhancementOptimizerResult = { checkpoint: EnhancementCheckpoint; complete: boolean; searchLimited: boolean; catalogComplete: boolean;
  visited: number; simulations: number; reasons: string[];
  configurations: PricedEnhancementConfiguration[];
  finalists: { configuration: PricedEnhancementConfiguration; simulation: GearPlanSimulation }[] };

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)])) : value;
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
  const baseline = input.baseline ? measurement(input.baseline) : undefined;
  const baselineDps = baseline?.dps ?? input.baselineDps;
  const bounds = { configurations: input.limits?.configurations ?? 128, simulations: input.limits?.simulations ?? 1, finalists: input.limits?.finalists ?? 3 };
  if (!positive(bounds.configurations) || bounds.configurations > 1024 || !positive(bounds.simulations) || bounds.simulations > 12 ||
      !positive(bounds.finalists) || bounds.finalists > 3 || !Number.isSafeInteger(input.itemsCopper) || input.itemsCopper < 0 ||
      !Number.isSafeInteger(input.budgetCopper) || input.budgetCopper < 0 || !input.simulationIdentity || !catalog.version ||
      (input.objective !== undefined && !["dps", "value"].includes(input.objective)) ||
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
      if (options.length > 100) throw new Error("enhancement_catalog_limit");
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
  const inputKey = hash({ traversal: "priced-pruned-diverse-v3", slots, resolutions, catalog:catalog.version, character, prices:input.prices,
    budget:input.budgetCopper, items:input.itemsCopper, objective:input.objective ?? "dps", baselineDps, baseline, identity:input.simulationIdentity, axes });
  if (input.checkpoint && (input.checkpoint.version !== 1 || input.checkpoint.inputKey !== inputKey)) throw new Error("enhancement_checkpoint_changed");
  const checkpoint: EnhancementCheckpoint = input.checkpoint ? structuredClone(input.checkpoint) : {version:1,inputKey,nextConfiguration:0,cache:{}};
  if (!Number.isSafeInteger(checkpoint.nextConfiguration) || checkpoint.nextConfiguration < 0) throw new Error("invalid_enhancement_checkpoint");
  checkpoint.totalSimulations ??= 0;
  checkpoint.traversalSteps ??= 0;
  checkpoint.nextSeed ??= 0;
  checkpoint.cache = {...input.simulationCache,...checkpoint.cache};
  const finalists = [...(checkpoint.finalists ?? [])];
  let confirmed = checkpoint.confirmed;
  const score = (f: typeof finalists[number]) => {
    if (input.objective !== "value") return f.simulation.dps;
    const gain = f.simulation.dps - baselineDps!;
    return f.configuration.totalCopper === 0 ? gain > 0 ? Infinity : gain < 0 ? -Infinity : 0 : gain / f.configuration.totalCopper!;
  };
  const rank = (a: typeof finalists[number], b: typeof finalists[number]) => score(b)-score(a) || b.simulation.dps-a.simulation.dps ||
    a.configuration.totalCopper!-b.configuration.totalCopper! || a.configuration.key.localeCompare(b.configuration.key);
  for (const reason of checkpoint.reasons ?? []) reasons.add(reason);
  const configurations: PricedEnhancementConfiguration[] = [];
  let simulations = 0, visited = 0;
  let marketVerified = true;
  try { assertFreshMarket({ sourceUpdatedAt:input.prices.sourceUpdatedAt ?? "" }, input.now); } catch { marketVerified = false; reasons.add("market_unverified"); }
  if (!marketVerified) { finalists.length = 0; confirmed = undefined; }
  if (resolutions.some(r=>!r.verified) || reasons.has("socket_compatibility_unverified")) return {checkpoint,complete:true,searchLimited:true,catalogComplete:catalog.complete,visited,simulations,reasons:[...reasons],configurations,finalists:[]};
  const strides: bigint[] = [];
  const total = axes.reduce((n,a)=>{strides.push(n);return n*BigInt(a.length);},1n);
  const hasSeed = () => checkpoint.nextSeed! < (checkpoint.seedSelections?.length ?? 0);
  while ((hasSeed() || BigInt(checkpoint.nextConfiguration) < total) && visited < bounds.configurations && simulations < bounds.simulations && checkpoint.totalSimulations < 12 && checkpoint.traversalSteps < 4096) {
    signal.throwIfAborted();
    if (input.shouldYield?.()) break;
    const fromSeed = hasSeed();
    let cursor = BigInt(checkpoint.nextConfiguration);
    const indices = fromSeed ? checkpoint.seedSelections![checkpoint.nextSeed!] : axes.map(axis => {
      const index = Number(cursor % BigInt(axis.length)); cursor /= BigInt(axis.length); return index;
    });
    const selected = axes.map((axis,index)=>axis[indices[index]]);
    const advance = () => {
      if (fromSeed) checkpoint.nextSeed!++; else checkpoint.nextConfiguration++;
      checkpoint.traversalSteps!++; visited++;
    };
    if (!Number.isSafeInteger(checkpoint.nextConfiguration + 1)) { reasons.add("configuration_limit"); checkpoint.traversalSteps = 4096; break; }
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
      if (e?.profession && (character.professions?.[String(e.profession.id)] ?? -1) < e.profession.rank) { valid = false; reasons.add("profession_unverified_or_insufficient"); }
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
        if (quote === null) { reasons.add("price_unknown_or_insufficient_quantity"); valid = false; break; }
        partialCost += quote;
        if (!Number.isSafeInteger(partialCost)) throw new Error("invalid_budget");
      }
      if (partialCost > input.budgetCopper) { valid = false; reasons.add("over_budget"); }
      if (!valid) { pruneAxis = axis; break; }
    }
    if (!valid) {
      if (fromSeed) { advance(); continue; }
      const stride = strides[pruneAxis];
      const next = (BigInt(checkpoint.nextConfiguration) / stride + 1n) * stride;
      if (next > BigInt(Number.MAX_SAFE_INTEGER)) { reasons.add("configuration_limit"); checkpoint.traversalSteps = 4096; break; }
      checkpoint.nextConfiguration = Number(next); checkpoint.traversalSteps++; visited++; continue;
    }
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
    configurations.push(config);
    if (!fullyEnhanced) reasons.add("bare_configuration");
    if (status === "price_unknown") reasons.add("price_unknown_or_insufficient_quantity");
    // Fully filled configurations avoid ambiguous zero/hole transport semantics. Bare configurations are reported, not simulated.
    if (status === "priced" && fullyEnhanced) {
      let simulation = checkpoint.cache[config.key];
      if (!simulation) {
        simulation = measurement(await input.simulate(structuredClone(config),signal));
        signal.throwIfAborted(); checkpoint.cache[config.key] = simulation; simulations++; checkpoint.totalSimulations++;
      } else { simulation = measurement(simulation); input.onCacheHit?.(); }
      try { assertFreshMarket({sourceUpdatedAt:input.prices.sourceUpdatedAt ?? ""}, input.now); }
      catch { config.status = "market_unverified"; finalists.length = 0; confirmed = undefined; reasons.add("market_unverified"); advance(); break; }
      if (!checkpoint.seedSelections) {
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
      if (baseline) {
        if (baseline.engine !== simulation.engine) throw new Error("simulation_version_changed");
        const comparison = compareGearSimulationResults(baseline, simulation);
        const candidate = {configuration:config,simulation};
        if (comparison.deltaDps > 0 && comparison.uncertainty.significant && (!confirmed || rank(candidate,confirmed) < 0)) confirmed = candidate;
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
  const exhaustive = !hasSeed() && BigInt(checkpoint.nextConfiguration) >= total;
  const capped = !exhaustive && (checkpoint.totalSimulations >= 12 || checkpoint.traversalSteps >= 4096);
  if (capped) reasons.add("configuration_limit");
  checkpoint.confirmed = confirmed;
  checkpoint.finalists = finalists; checkpoint.reasons = [...reasons];
  return {checkpoint,complete:exhaustive || capped,searchLimited:!exhaustive || !catalog.complete,catalogComplete:catalog.complete,visited,simulations,reasons:[...reasons],configurations,finalists};
}
