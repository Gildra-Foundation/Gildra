import assert from 'node:assert/strict';
import {test} from 'node:test';
import {harness,record,offer,market} from './priority-feedback-harness.mjs';

// Current runner/discovery/planner; synthetic catalog/reference/native transports.
// Fresh cache per harness. Counts verify scheduling, not a wall-clock SLA.
const summary=(id,level=10)=>({...record(id),itemLevel:level,highlights:[{key:'inventory_type',value:'Wrist'},{key:'required_level',value:'Requires level 81'}]});
test('new priority item is measured first after refresh despite an older resolved pending pool',async()=>{
 const entities=Array.from({length:200},(_,i)=>summary(i+1));
 const initial=entities.map(row=>({...offer(1,row.externalId),itemId:row.externalId}));
 const h=await harness({entities,offers:initial}),run=await h.start();let result=run.result;
 for(let i=0;i<4;i++)result=await h.runner.continueAuctionGearSearch(run.entry,h.signal(),h.progress,'synthetic');
 assert.equal(result.items.length,132);assert.equal(result.pendingItems,98);
 const priorPending=new Set(result.items.filter(row=>row.evaluation==='pending').map(row=>row.itemId));
 entities.push(summary(90000,500));h.state.market=market([...initial,{...offer(1,900000),itemId:90000}]);
 await h.runner.verifyAuctionGearSearch(run.entry,'synthetic',h.signal(),false);
 const beforeNative=h.state.simulationOrder.length,beforeMetadata=h.state.metadataOrder.length;
 result=await h.runner.continueAuctionGearSearch(run.entry,h.signal(),h.progress,'synthetic');
 assert.equal(h.state.metadataOrder[beforeMetadata][0],90000,'Metadata traversal should already prioritize the new item');
 assert.deepEqual(h.state.simulationOrder[beforeNative],[90000],'First DPS after arrival must use global hints, not old Map insertion order');
 assert.equal(result.items.find(row=>row.itemId===90000).evaluation,'upgrade');
 assert([...priorPending].every(id=>result.items.some(row=>row.itemId===id)),'All older pending items stay in the domain');
 for(let steps=0;!result.searchComplete;steps++){
  assert(steps<40,'Full unchanged domain must converge');result=await h.runner.continueAuctionGearSearch(run.entry,h.signal(),h.progress,'synthetic');
 }
 assert.equal(result.items.length,201);assert.equal(result.pendingItems,0);
 const measured=h.state.simulationOrder.filter(selection=>selection.length===1).flat();
 assert.equal(measured.length,201);assert.equal(new Set(measured).size,201,'Previously measured effects and baseline are reused');
 assert.equal(h.state.simulationCalls,202);
});
