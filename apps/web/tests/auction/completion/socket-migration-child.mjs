import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks,stripTypeScriptTypes,syncBuiltinESMExports}from'node:module';
import vm from'node:vm';
import {harness,record,offer,character}from'./priority-feedback-harness.mjs';
import * as store from'../../../lib/wow/auctionGearSearchStore.ts';
import * as jobs from'../../../lib/wow/auctionGearJobs.ts';
import {readAuctionState}from'../../../lib/wow/auctionGearPersistence.ts';
import {auctionGearVariantSelectionKey}from'../../../lib/wow/auctionGearExclusions.ts';
assert(process.env.GILDRA_AUCTION_STATE_DIR?.includes('gildra-socket-migration-'));
const mode=process.argv[2],input=JSON.parse(process.argv[3]??'{}');
const h=await harness({entities:[record(90000),record(90001),record(90002)],offers:[90000,90001,90002].map((itemId,index)=>({...offer(1,index+1),itemId}))});
const bindings=await h.runner.continueAuctionGearSearch.constructor('return globalThis')();
const token='synthetic-migration-token',scope={characterSlug:'synthetic',locale:'en'};
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
let output;
if(mode==='seed'){
  const seeded=await h.start({enhancementMode:'equipment'}),entry=seeded.entry;
  assert.equal(entry.context.market.offers.length,0,'Real snapshots omit full raw offers');
  assert(entry.context.discovery.offers.size>0);
  const options=entry.context.options;
  assert.equal(options.length,3);
  const excluded=options.find(row=>row.candidate.itemId===90000),selected=options.find(row=>row.candidate.itemId===90001);
  const variant=auctionGearVariantSelectionKey({itemId:excluded.candidate.itemId,variantKey:excluded.variantKey});
  const selection=input.selection==='selected'?[selected.id]:{excludedOptionIds:[excluded.id],excludedVariantKeys:[variant]};
  entry.knownVariantKeys=new Set(options.map(row=>auctionGearVariantSelectionKey({itemId:row.candidate.itemId,variantKey:row.variantKey})));
  entry.excludedOptionIds=[excluded.id];entry.excludedVariantKeys=[variant];
  const old={...entry.latestSearchResult,kind:'assembly',purchases:[],exhaustiveComplete:true,oldMigrationLeaderboard:true,
    enhancementOptimization:{complete:true,status:'ready',recommendations:[{oldMigrationQuote:123456}]}};
  if(!input.unmigrated)delete entry.context.discovery.socketMetadataRevision;
  entry.latestAssemblyResult=old;entry.exhaustiveEnhancementState={oldMigrationLeaderboard:true};
  if(input.unmigrated){entry.latestSearchResult=undefined;entry.searchCheckpoint=undefined;entry.retainedBaseline=undefined;}
  store.saveAuctionGearSearch(entry);
  const job=jobs.enqueueAuctionGearJob(seeded.owner,async(_signal,_progress,hooks)=>{hooks.publishResult(old);await new Promise(()=>{});},
    {scope,searchId:entry.id,continuation:true,work:{action:'assemble',searchId:entry.id,selection,...(input.full?{runMode:'full'}:{})}});
  await tick();assert.equal(jobs.getAuctionGearJob(seeded.owner,job.id).status,'running');
  output={owner:seeded.owner,searchId:entry.id,id:job.id,selection,excluded:excluded.id,full:input.full,unmigrated:input.unmigrated};
}else{
  const entry=store.getAuctionGearSearch(input.owner,input.searchId);assert(entry);
  if(!input.unmigrated&&!input.progressed){
    assert.equal(entry.metadataRebuildRequired,true);
    assert.equal(entry.context.market.offers.length,0);
    assert.equal(entry.context.discovery.offers.size,3);
    assert.equal(entry.context.coverage.discoveryComplete,false);
    assert.equal(entry.context.coverage.dataComplete,false);
    assert.equal(entry.latestAssemblyResult,undefined);assert.equal(entry.exhaustiveEnhancementState,undefined);
    assert.equal(entry.latestSearchResult,undefined);assert.equal(entry.retainedBaseline,undefined);
  }
  if(mode==='park'){
    store.saveAuctionGearSearch(entry);output={...input,parked:true};
  }else if(mode==='progress'||mode==='progress-read'){
    h.state.market.offers.push({...offer(1,4),itemId:90003});
    const source=fs.readFileSync(new URL('../../../lib/wow/auctionGearRunner.ts',import.meta.url),'utf8');
    const verify=vm.runInNewContext(stripTypeScriptTypes(source,{mode:'strip'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')+';verifyAuctionGearSearch',{...bindings,...store,Error,getBattleNetCharacterBySlug:async()=>character});
    const signal=new AbortController().signal;
    if(mode==='progress'){
      await verify(entry,token,signal);assert.equal(entry.metadataMarketRefreshRequired,false);assert.equal(entry.context.discovery.itemIds.length,4,'Fresh market is used despite identical snapshot ID');
      await h.discovery.advanceAuctionGearDiscovery(entry.context.discovery,{...h.discoveryInput,maxSteps:3});
    }
    const progress={itemCursor:entry.context.discovery.itemCursor,variantCursor:entry.context.discovery.variantCursor,candidates:[...entry.context.discovery.candidates.keys()]};
    assert(progress.itemCursor>0);assert(progress.candidates.length>0);if(input.progressed)assert.deepEqual(progress,input.progressed);
    await verify(entry,token,signal);assert.deepEqual({itemCursor:entry.context.discovery.itemCursor,variantCursor:entry.context.discovery.variantCursor,candidates:[...entry.context.discovery.candidates.keys()]},progress);
    assert.equal(entry.retainedBaseline,undefined);assert.equal(entry.metadataRebuildRequired,true);assert.equal(entry.metadataMarketRefreshRequired,false);
    store.saveAuctionGearSearch(entry);output={...input,progressed:progress};
  }else{
    let verifies=0,assemblies=0,bootstraps=0;const publications=[];
    globalThis.fetch=bindings.fetch;
    const source=fs.readFileSync(new URL('../../../lib/wow/auctionGearRunner.ts',import.meta.url),'utf8');
    const code=stripTypeScriptTypes(source,{mode:'strip'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
    const runner=vm.runInNewContext(code+';({verifyAuctionGearSearch,continueAuctionGearSearch,assembleAuctionGearSearch,selectedAuctionGearAssemblyOptions,startAuctionGearSearch})',{
      ...bindings,...store,Error,
      getBattleNetCharacterBySlug:async()=>{verifies++;
        if(!input.unmigrated&&verifies===1){assert.equal(jobs.getAuctionGearJob(input.owner,input.id).result,null);assert.equal(readAuctionState('job',input.id).data.result,null);}
        return character;},
    });
    const assemble=runner.assembleAuctionGearSearch;
    runner.assembleAuctionGearSearch=async(...args)=>{const prior=args[0].metadataRebuildRequired;const value=await assemble(...args);if(value.kind==='search'){assert(prior);bootstraps++;}else assemblies++;return value;};
    // Actual Work/Background use actual Runner; only capture existing callback.
    globalThis.__migrationRunner={...runner,assembleAuctionGearSearch:(entry,selection,signal,progress,suppliedToken,publish)=>{
      assert.equal(suppliedToken,token);assert.deepEqual(structuredClone(selection),input.selection);
      return runner.assembleAuctionGearSearch(entry,selection,signal,progress,suppliedToken,result=>{publications.push(structuredClone(result));publish?.(result);});
    }};
    const moduleURL=source=>({url:`data:text/javascript,${encodeURIComponent(source)}`,shortCircuit:true});
    const hooked=registerHooks({resolve(specifier,context,next){
      if(specifier==='./auctionGearRunner'&&/auctionGear(?:Work|Background)\.ts$/.test(context.parentURL??''))return moduleURL(`const s=globalThis.__migrationRunner;export const verifyAuctionGearSearch=(...a)=>s.verifyAuctionGearSearch(...a);export const continueAuctionGearSearch=(...a)=>s.continueAuctionGearSearch(...a);export const assembleAuctionGearSearch=(...a)=>s.assembleAuctionGearSearch(...a);export const selectedAuctionGearAssemblyOptions=(...a)=>s.selectedAuctionGearAssemblyOptions(...a);export const startAuctionGearSearch=(...a)=>s.startAuctionGearSearch(...a);`);
      return next(specifier,context);
    }});
    const {resumeOwnedAuctionGearWork}=await import('../../../lib/wow/auctionGearWork.ts');
    resumeOwnedAuctionGearWork('different-owner',input.id,token);assert.equal(verifies,0);
    if(input.failClear){
      const rename=fs.renameSync;fs.renameSync=(from,to)=>{if(String(to).endsWith('job-'+input.id+'.bin'))throw Error('synthetic_clear_failure');return rename(from,to);};syncBuiltinESMExports();
      try{assert.throws(()=>resumeOwnedAuctionGearWork(input.owner,input.id,token),/auction_storage_unavailable/);assert.equal(verifies,0);assert.equal(jobs.getAuctionGearJob(input.owner,input.id).result.oldMigrationLeaderboard,true);}
      finally{fs.renameSync=rename;syncBuiltinESMExports();}
    }
    resumeOwnedAuctionGearWork(input.owner,input.id,token);resumeOwnedAuctionGearWork(input.owner,input.id,token);
    let result;
    for(let i=0;i<1000;i++){await tick();result=jobs.getAuctionGearJob(input.owner,input.id);if(!['running','queued'].includes(result.status))break;}
    if(input.unmigrated){assert.equal(result.status,'failed');assert.equal(result.error,'search_not_ready');assert.equal(bootstraps,0);}
    else{
      assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(result.result.kind,'assembly');assert.equal(bootstraps,1);assert.equal(assemblies,1);
      assert.equal(entry.metadataRebuildRequired,false);assert(entry.retainedBaseline);assert(entry.latestSearchResult);
      assert(publications.length>0);assert(publications.every(row=>!row.oldMigrationLeaderboard&&!row.enhancementOptimization?.recommendations?.some(r=>r.oldMigrationQuote)));
      assert.equal(result.result.optionsConsidered,Array.isArray(input.selection)?1:2);
      assert.equal(readAuctionState('search',entry.id).data.metadataRebuildRequired,false);
    }
    hooked.deregister();output={status:result.status,bootstraps,assemblies,verifies};
  }
}
console.log(JSON.stringify(output));process.exit(0);
