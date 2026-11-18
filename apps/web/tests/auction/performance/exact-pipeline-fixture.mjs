import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import v8 from 'node:v8';
import { syncBuiltinESMExports } from 'node:module';
import * as persistence from '../../../lib/wow/auctionGearPersistence.ts';
import * as policy from '../../../lib/wow/auctionGearEnhancementMode.ts';
import * as scenarios from '../../../lib/wow/auctionGearScenarios.ts';
import * as slots from '../../../lib/wow/auctionGearSelection.ts';
import * as diagnostics from '../../../lib/wow/auctionGearDiagnostics.ts';
import { prepareGearLoadout } from '../../../lib/wow/gearSimulation.ts';
import { auctionSelectionEffectKey } from '../../../lib/wow/auctionGearEffects.ts';
import { createAuctionGearEnhancedLoadoutIterator } from '../../../lib/wow/auctionGearEnhancedLoadouts.ts';
import { evaluateAuctionEnhancementStage, auctionEnhancementScenarioFinalists } from '../../../lib/wow/auctionGearEnhancementStage.ts';
import { auctionEnhancementCatalogInfo } from '../../../lib/wow/auctionEnhancementCatalog.ts';
import { customizedAuctionGearOptions } from '../../../lib/wow/auctionGearEnhancedConfiguration.ts';
import { assertFreshMarket } from '../../../lib/wow/auctionMarket.ts';
import { harness, strip, record, offer, character } from '../completion/priority-feedback-harness.mjs';

const source = async (name, ref) => ref ? execFileSync('git', ['show', `${ref}:apps/web/lib/wow/${name}.ts`], {encoding:'utf8'})
  : readFile(new URL(`../../../lib/wow/${name}.ts`, import.meta.url), 'utf8');
const exportsOf = value => [...value.matchAll(/^export (?:async )?function (\w+)/gm)].map(row => row[1]);
const evaluate = (value, bindings, names=exportsOf(value)) => new vm.Script(strip(value)+`;({${names.join(',')}})`).runInNewContext(bindings);
const sharedHashes=Object.fromEntries(await Promise.all(['auctionGearPlanner','auctionGearEnhancedLoadouts','auctionGearEnhancementStage','auctionGearEnhancementOptimizer','auctionGearPersistence'].map(async name=>[name,createHash('sha256').update(await source(name)).digest('hex')])));
const globals = { randomUUID, createHash, process, Map, Set, WeakMap, Date, Object, JSON, Number, Math, Error, AbortController, AbortSignal,
  DOMException, structuredClone, setTimeout, clearTimeout, setImmediate, clearImmediate, queueMicrotask, performance };

/** Actual full-task wrapper, Runner, discovery, planners, exact stage, Jobs and
 * SearchStore/persistence. Only owned-account/catalog/native/quote transports
 * use labeled local fixtures; no network request or live worker is involved. */
export async function exactPipeline({ ref, items=3, onPublication, onWrite, beforeTurn, nativeMs=0 }={}) {
  assert.equal(process.env.GILDRA_AUCTION_STATE_DIR, undefined, 'Never use service state');
  const directory = await mkdtemp(join(tmpdir(), 'gildra-exact-pipeline-'));
  process.env.GILDRA_AUCTION_STATE_DIR = directory;
  const sources = Object.fromEntries(await Promise.all(['auctionGearRunner','auctionGearExhaustiveEnhancements','auctionGearSearchStore','auctionGearJobs','auctionGearBackground']
    .map(async name => [name, await source(name, ['auctionGearRunner','auctionGearExhaustiveEnhancements','auctionGearSearchStore'].includes(name) ? ref : undefined)])));
  const counts={ searchWrites:0, jobWrites:0, assembly:0, searchPlanning:0, stage:0, publications:0, turns:0, ownership:0, armory:0, market:0, native:0 };
  const times={ searchWrites:0, jobWrites:0, assembly:0, searchPlanning:0, stage:0 };
  const measure=async(name,work)=>{const start=performance.now();counts[name]++;try{return await work();}finally{times[name]=(times[name]??0)+performance.now()-start;}};
  const disk={...persistence,
    writeAuctionState:(...args)=>{const name=args[0]==='search'?'searchWrites':'jobWrites', start=performance.now();counts[name]++;
      try{onWrite?.({kind:args[0],data:args[3],counts});return persistence.writeAuctionState(...args);}finally{times[name]+=performance.now()-start;}},
    writeAuctionStateAsync:(...args)=>measure(args[0]==='search'?'searchWrites':'jobWrites',()=>{onWrite?.({kind:args[0],data:args[3],counts});return persistence.writeAuctionStateAsync(...args);})};
  const jobs=evaluate(sources.auctionGearJobs,{...globals,...disk,...policy,...scenarios,...slots,...diagnostics});
  const fixture=await harness({entities:Array.from({length:items},(_,i)=>record(90000+i)),
    offers:Array.from({length:items},(_,i)=>({...offer(1,i+1),itemId:90000+i}))});
  fixture.state.workerEngine='SimulationCraft 18428cd synthetic-exact-pipeline';
  const runnerBindings=await fixture.runner.assembleAuctionGearSearch.constructor('return globalThis')();
  const discoveryBindings=await fixture.discovery.advanceAuctionGearDiscovery.constructor('return globalThis')();
  const discovery=evaluate(await source('auctionGearDiscovery'),{...discoveryBindings,
    resolveAuctionVariants:async input=>{const result=await discoveryBindings.resolveAuctionVariants(input);
      for(const row of result.variants.values()) Object.assign(row,{metadataVersion:2,enhancements:{status:'verified',socketColors:[14,0,0],socketCount:1,socketBonusId:0,requiredProfessionId:0,requiredProfessionRank:0}});
      return result;}});
  let runner, entry;
  const store=evaluate(sources.auctionGearSearchStore,{...globals,...disk,getActiveAuctionGearJob:jobs.getActiveAuctionGearJob,
    snapshotAuctionGearContext:context=>runner.snapshotAuctionGearContext(context),restoreAuctionGearContext:data=>runner.restoreAuctionGearContext(data)});
  const quote=async(_region,ids)=>({prices:Object.fromEntries(ids.map(id=>[String(id),{ladder:[[10,100]]}])),
    sourceUpdatedAt:fixture.state.market.sourceUpdatedAt,fetchedAt:fixture.state.market.fetchedAt});
  const exact=evaluate(sources.auctionGearExhaustiveEnhancements,{...globals,createAuctionGearEnhancedLoadoutIterator,
    evaluateAuctionEnhancementStage:input=>measure('stage',()=>evaluateAuctionEnhancementStage({...input,quote})),
    auctionEnhancementCatalogInfo,exactCommodityPrices:quote,assertFreshMarket,auctionGearSlots:slots.auctionGearSlots});
  const requests=[], publications=[];
  runner=evaluate(sources.auctionGearRunner,{...runnerBindings,...globals,...store,...discovery,...exact,prepareGearLoadout,
    auctionSelectionEffectKey,auctionEnhancementScenarioFinalists,customizedAuctionGearOptions,
    assembleAuctionGear:input=>measure('assembly',()=>runnerBindings.assembleAuctionGear(input)),
    searchAuctionGearOptions:input=>measure('searchPlanning',()=>runnerBindings.searchAuctionGearOptions(input)),
    getBattleNetCharacterBySlug:async()=>{counts.ownership++;return character;},
    getBattleNetSimulationSnapshot:async()=>{counts.armory++;return fixture.state.armory;},
    getCharacterAuctionMarket:async(...args)=>{counts.market++;if(counts.ownership)assert.equal(args[2].refresh,true);return runnerBindings.getCharacterAuctionMarket(...args);},
    fetch:async(url,options)=>{
      if(new URL(url).pathname==='/healthz')return runnerBindings.fetch(url,options);
      counts.native++;const request=JSON.parse(options.body);requests.push(request);
      assert.equal(request.actionListMode,'native');
      if(nativeMs)await new Promise(resolve=>setTimeout(resolve,nativeMs));options.signal?.throwIfAborted();
      const dps=1000+(request.gearChanges??[]).reduce((sum,row)=>sum+(row.itemId-89999)*10+(row.gemIds??[]).reduce((n,id)=>n+id%100,0),0);
      return Response.json({dps,dpsMean:dps,dpsError:1,confidence:95,iterations:750,engine:fixture.state.workerEngine},{headers:{'x-gildra-engine':'simulationcraft'}});
    }});
  const background=evaluate(sources.auctionGearBackground,{...globals,...policy,...store,...runner,
    verifyAuctionGearSearch:async(...args)=>{await beforeTurn?.({entry:args[0],fixture,counts,jobs});return runner.verifyAuctionGearSearch(...args);}});
  const owner=randomUUID(), input={characterSlug:'synthetic',locale:'en',scenario:'single-target',budgetCopper:1000,
    selectedSlots:['WRIST'],objective:'dps',enhancementMode:'enhanced'};
  let settled, taskError;
  const done=new Promise(resolve=>{settled=resolve;});
  const wrap=task=>async(signal,progress,hooks)=>{counts.turns++;return task(signal,progress,{...hooks,
    continueWith:next=>hooks.continueWith(wrap(next)),
    publishResult:result=>{hooks.publishResult(result);counts.publications++;publications.push(structuredClone(result));
      entry??=store.getAuctionGearSearch(owner,result.searchId);onPublication?.({result,entry,jobs,owner,counts,fixture});}}).catch(error=>{taskError=String(error.stack);throw error;});};
  const serialization={calls:0,bytes:0,ms:0}, originalSerialize=v8.serialize;
  v8.serialize=(...args)=>{const start=performance.now(), value=originalSerialize(...args);serialization.calls++;serialization.bytes+=value.length;serialization.ms+=performance.now()-start;return value;};
  syncBuiltinESMExports();
  const started=performance.now();
  const job=jobs.enqueueAuctionGearJob(owner,wrap(background.fullAuctionGearTask(async(signal,progress,hooks)=>
    runner.startAuctionGearSearchFromSnapshot(input,character,fixture.state.armory,owner,'synthetic-token',signal,progress,hooks.searchCreated,hooks.publishResult),owner,'synthetic-token')),
    {scope:{characterSlug:'synthetic',locale:'en'},work:{action:'search',input,runMode:'full'},onSettled:()=>settled()});
  try {
    await done;
    const final=jobs.getAuctionGearJob(owner,job.id), elapsedMs=performance.now()-started;
    entry??=store.getAuctionGearSearch(owner,final.searchId);
    const diskEntry=entry&&persistence.readAuctionState('search',entry.id);
    const summary={counts,times,serialization,sharedHashes,elapsedMs,status:final.status,error:final.error,taskError,
      equipmentChecked:final.result?.enhancementOptimization?.equipmentChecked,
      sourceHashes:Object.fromEntries(Object.entries(sources).map(([name,value])=>[name,createHash('sha256').update(value).digest('hex')]))};
    return {summary,final,entry,diskEntry,requests,publications,fixture};
  } finally {
    if(entry)await store.flushPendingAuctionGearSearch(entry).catch(()=>{});
    v8.serialize=originalSerialize;syncBuiltinESMExports();
    delete process.env.GILDRA_AUCTION_STATE_DIR;await rm(directory,{recursive:true,force:true});
  }
}
