/** Offline CPU benchmark: actual pinned catalog + Stage/Optimizer, synthetic exact quotes/native measurements. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {validatedAuctionEnhancementMetadata} from '../../../lib/wow/auctionItemVariant.ts';
import * as catalog from '../../../lib/wow/auctionEnhancementCatalog.ts';
import {exactCommodityQuote} from '../../../lib/wow/auctionGearCost.ts';
import {assertFreshMarket} from '../../../lib/wow/auctionMarket.ts';
import {prepareGearLoadout,compareGearSimulationResults} from '../../../lib/wow/gearSimulation.ts';
import {auctionPlanCost,auctionGearPurchase} from '../../../lib/wow/auctionGearPlanner.ts';
import {auctionGearSlots} from '../../../lib/wow/auctionGearSelection.ts';
import {customizedAuctionGearOptions,ownedAuctionGearChanges} from '../../../lib/wow/auctionGearEnhancedConfiguration.ts';
const root=fileURLToPath(new URL('../../../../../',import.meta.url));
const version=process.argv[2]??'current';assert(['baseline','current'].includes(version));
const baselineRef=process.env.AUCTION_ENHANCEMENT_BASELINE_REF??'30280ff234453a8d8f61ec9c75b14302deff7693';
const repeats=Number(process.env.AUCTION_ENHANCEMENT_REPEATS??3);
const out=process.env.AUCTION_ENHANCEMENT_OUTPUT_DIR??path.join(root,'work/gear-planner/enhancement-slicing');
const source=async file=>{if(version==='current')return readFile(path.join(root,'apps/web/lib/wow',file),'utf8');try{return execFileSync('git',['show',`${baselineRef}:apps/web/lib/wow/${file}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{throw new Error(`Baseline ${baselineRef} unavailable locally; set AUCTION_ENHANCEMENT_BASELINE_REF to a local pinned ref. This benchmark never fetches history.`);}};
const optimizerSource=await source('auctionGearEnhancementOptimizer.ts'),stageSource=await source('auctionGearEnhancementStage.ts');
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const strip=code=>stripTypeScriptTypes(code,{mode:'transform'}).replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
const info=catalog.auctionEnhancementCatalogInfo,engine=`SimulationCraft ${info.simcRevision.slice(0,7)} isolated-slicing-fixture`;
const target={itemId:960010,inventoryType:11,itemClassId:4,itemSubclassId:0,itemLevel:150,socketColors:[14,14,0],build:info.build,revision:info.simcRevision,engine};
const resolved=catalog.resolveExactEnhancements(target,{level:90,professions:[]});assert(resolved.verified);
const gems=resolved.gemChoices['0'].filter(row=>!row.uniqueEquipped&&!row.category).slice(0,8),enchants=resolved.enchantChoices.slice(0,3);assert.equal(gems.length,8);assert.equal(enchants.length,3);
const candidate={entityId:'synthetic-real-catalog-ring',itemId:target.itemId,name:'Synthetic catalog ring',slotType:'FINGER_1',itemLevel:150,inventoryType:11,itemClassId:4,itemSubclassId:0,
 constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'1',requiredLevel:1},compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:0},eligible:true,rejectionReasons:[],
 variants:[{key:'exact-fixture-ring',itemLevel:150,bonusIds:[101],contextId:13,resolution:{engine,stats:{},requiredLevel:1,metadataVersion:version==="baseline"?2:3,enhancements:{status:'verified',socketColors:target.socketColors,socketCount:2,socketBonusId:0,requiredProfessionId:0,requiredProfessionRank:0}}}]};
const option={id:'synthetic-ring',auctionId:980010,quantity:1,costCopper:100,candidate,variantKey:candidate.variants[0].key};
const equipment={equipped_items:[{slot:{type:'FINGER_1'},item:{id:970010}}]},loadout=[{slotType:'FINGER_1',itemId:970010,inventoryType:11,itemSubclassId:0}];
const prices=Object.fromEntries([...gems,...enchants].map((row,index)=>[row.consumableItemId,{ladder:[[10+(index+1)**2*7,1],[21+(index+1)**2*7,30]]}]));
const normalize=value=>JSON.parse(JSON.stringify(value,(key,value)=>key==='sourceUpdatedAt'?undefined:value));
async function run(repeat){
 const phases={},configurationTrace=[];const time=(key,work)=>{const began=performance.now();try{return work();}finally{const row=phases[key]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-began;}};
 const cryptoFor=label=>(algorithm,...args)=>{const began=performance.now(),h=createHash(algorithm,...args),wrapper={update:(...args)=>{h.update(...args);return wrapper;},digest:(...args)=>{try{return h.digest(...args);}finally{const row=phases[label]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-began;}}};return wrapper;};
 const globals={Map,Set,WeakMap,Date,Object,Number,JSON,Math,BigInt,Array,Error,AbortSignal,setImmediate,clearImmediate};
 const optimize=new vm.Script(strip(optimizerSource)+'\n;optimizeAuctionGearEnhancements').runInNewContext({...globals,createHash:cryptoFor('optimizerHash'),structuredClone:value=>time('clone',()=>structuredClone(value)),compareGearSimulationResults,assertFreshMarket,exactCommodityQuote:(...args)=>time('commodityQuote',()=>exactCommodityQuote(...args))});
 const stage=new vm.Script(strip(stageSource)+'\n;evaluateAuctionEnhancementStage').runInNewContext({...globals,...catalog,validatedAuctionEnhancementMetadata,createHash:cryptoFor('stageHash'),auctionPlanCost,auctionGearPurchase,customizedAuctionGearOptions,ownedAuctionGearChanges,auctionGearSlots,prepareGearLoadout,compareGearSimulationResults,assertFreshMarket,
  resolveExactEnhancements:(...args)=>time('catalogResolve',()=>catalog.resolveExactEnhancements(...args)),lookupInstalled:(...args)=>time('installedResolve',()=>catalog.lookupInstalled(...args)),
  optimizeAuctionGearEnhancements:async input=>{const began=performance.now();try{const result=await optimize(input);configurationTrace.push(...result.configurations);return result;}finally{const row=phases.optimizer??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-began;}}});
 let quoteCalls=0,nativeCalls=0;const trace=[],turns=[];const now=new Date().toISOString();
 const input={exhaustive:true,includeObjectiveAlternatives:true,finalists:[{label:'fixture',options:[option]}],equipment,loadout,specId:72,level:90,region:'eu',engine,profileFingerprint:'synthetic-profile',encounter:{scenario:'single-target',fightLengthSeconds:120,targets:1},budgetCopper:100000,objective:'value',baseline:{dps:1000,dpsError:1,confidence:95,iterations:750,engine},signal:new AbortController().signal,shouldYield:()=>false,state:{checkpoints:{}},
  quote:async()=>{quoteCalls++;return{prices:structuredClone(prices),sourceUpdatedAt:now,fetchedAt:now};},
  simulate:async options=>{nativeCalls++;const changes=prepareGearLoadout({selections:options,equipment,loadout,specId:72}).changes;const change=changes[0],gemIds=change.gemIds??[];const rank=id=>gems.findIndex(g=>g.simulationId===id)+1;
   const gain=20+gemIds.reduce((sum,id)=>sum+rank(id)*17,0)+(enchants.findIndex(row=>row.simulationId===change.enchantId)+1)*29;
   const noisy=gemIds.length===2&&gemIds.every(id=>rank(id)===8);const measurement={dps:noisy?2000:1000+gain,dpsError:noisy?1000:1,confidence:95,iterations:750,engine};trace.push({changes,measurement});return measurement;}};
 const began=performance.now();let result;
 for(let turn=0;turn<3000;turn++){
  const before=nativeCalls,start=performance.now();result=await stage(input);const elapsed=performance.now()-start;
  turns.push({ms:elapsed,newNative:nativeCalls-before,configurationCursor:Object.values(input.state.checkpoints).map(cp=>cp.exactNextConfiguration)});
  // Mirror durable JSON recovery between per-native continuation turns.
  input.state=time('durableClone',()=>JSON.parse(JSON.stringify(input.state)));
  if(result.complete)break;
 }
 assert(result.complete,'bounded fixture must reach its actual end');
 const elapsed=performance.now()-began;assert(quoteCalls===1);assert(turns.every(turn=>turn.newNative<=1));
 const leaders=normalize(result.recommendations.map(row=>({key:row.configuration.key,configuration:row.configuration,simulation:row.simulation,comparison:row.comparison,optionIds:row.optionIds}))).sort((a,b)=>a.key.localeCompare(b.key));
 const traceHash=digest(trace),configurationHash=digest(normalize(configurationTrace)),leaderHash=digest(leaders),states=Object.values(input.state.checkpoints);
 return{repeat,elapsedMs:elapsed,turnCount:turns.length,nativeCalls,quoteCalls,phases,turns,traceHash,configurationHash,leaderHash,leaders,trace,configurations:normalize(configurationTrace),reasons:result.reasons,status:result.status,complete:result.complete,checkpoint:normalize(states.map(cp=>({inputKey:cp.inputKey,exactNextConfiguration:cp.exactNextConfiguration,traversalSteps:cp.traversalSteps,totalSimulations:cp.totalSimulations,reasons:cp.reasons}))) };
}
const rows=[];for(let repeat=0;repeat<repeats;repeat++)rows.push(await run(repeat));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(const key of ['traceHash','configurationHash','leaderHash','nativeCalls','turnCount'])assert(rows.every(row=>row[key]===rows[0][key]),`fixture is not deterministic: ${key}`);
const report={scope:'Offline actual pinned catalog + unchanged Stage/Optimizer executed with timing wrappers; deterministic synthetic quotes and native measurements, no process/HTTP/account calls.',version,baselineRef,sourceHashes:{optimizer:digest(optimizerSource),stage:digest(stageSource),catalog:digest(await readFile(path.join(root,'apps/web/data/wow/auction-enhancements/catalog.json'),'utf8'))},catalog:info,fixture:{resolvedGemsPerSocket:resolved.gemChoices['0'].length,resolvedEnchants:resolved.enchantChoices.length,quotedGemIds:gems.map(r=>r.simulationId),quotedEnchantIds:enchants.map(r=>r.simulationId),quotes:prices},summary:{medianMs:median(rows.map(r=>r.elapsedMs)),nativeCalls:rows[0].nativeCalls,turns:rows[0].turnCount,medianPhases:Object.fromEntries(Object.keys(rows[0].phases).map(key=>[key,{calls:rows[0].phases[key].calls,ms:median(rows.map(r=>r.phases[key]?.ms??0))}]))},rows};
await mkdir(out,{recursive:true});await writeFile(path.join(out,`${version}.json`),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(out,`${version}-Stage.ts.txt`),stageSource);await writeFile(path.join(out,`${version}-Optimizer.ts.txt`),optimizerSource);console.log(JSON.stringify({output:path.join(out,`${version}.json`),summary:report.summary}));
