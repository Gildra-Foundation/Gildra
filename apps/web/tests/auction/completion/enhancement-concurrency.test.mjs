// Controlled native stand-ins: concurrency/precision contracts, never live DPS.
import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeAuctionGearEnhancements as optimize } from '../../../lib/wow/auctionGearEnhancementOptimizer.ts';
import { setImmediate as nextTurn } from 'node:timers/promises';
const engine='SimulationCraft exact-concurrency-fixture';
const measured=(dps=1100,dpsError=1)=>({dps,dpsError,iterations:750,confidence:95,engine});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function fixture(extra={}) {
  const gems=Array.from({length:5},(_,i)=>({key:`gem-${i}`,kind:'gem',consumableItemId:8000+i,simulationId:8000+i,
    ...(i===2?{category:{id:'unique-category',limit:1}}:{})}));
  const calls=[];
  const input={exhaustive:true,simulationConcurrency:2,slots:[{slotType:'HEAD',variantKey:'fixture',metadataKey:'verified',owned:false,
    sockets:[{key:'0',type:'14'},{key:'1',type:'14'}]}],
    catalog:{version:'exact-concurrency-v1',complete:true,resolve:()=>({verified:true,enchantApplicable:false,enchantChoices:[],gemChoices:{'0':gems,'1':gems}})},character:{},
    prices:{sourceUpdatedAt:new Date().toISOString(),prices:Object.fromEntries(gems.map((g,i)=>[g.consumableItemId,{ladder:[[5+i*7,1],[9+i*7,30]]}]))},
    itemsCopper:100,budgetCopper:150,simulationIdentity:'synthetic-profile/engine/encounter',objective:'value',baseline:measured(1000),
    signal:new AbortController().signal,limits:{configurations:128,simulations:2},simulate:async config=>{
      calls.push(structuredClone(config));return measureConfig(config);
    },...extra};
  return{input,calls};
}
function measureConfig(config){const ids=config.slots[0].gemIds,noisy=ids.every(id=>id===8001);return measured(noisy?2000:ids.every(id=>id===0)?1100:1001+ids.reduce((sum,id)=>sum+(id? id-7999:0)*20,0),noisy?1000:1);}
async function finish(h,checkpoint){let result;for(let turn=0;turn<100;turn++){
  result=await optimize({...h.input,checkpoint});checkpoint=JSON.parse(JSON.stringify(result.checkpoint));
  assert(result.simulations<=h.input.limits.simulations);if(result.complete)return result;
}assert.fail('bounded fixture failed to finish');}

test('two independently priced configurations start together and apply in deterministic traversal order',async()=>{
  const pending=[],h=fixture({simulate:async config=>{const gate=deferred();pending.push({config,gate});return gate.promise;}});
  const running=optimize(h.input);await nextTurn();assert.equal(pending.length,2);
  assert(pending.every(row=>row.config.status==='priced'&&row.config.totalCopper<=150));
  pending[1].gate.resolve(measureConfig(pending[1].config));await nextTurn();
  let finished=false;running.then(()=>{finished=true;});await nextTurn();assert.equal(finished,false);
  pending[0].gate.resolve(measureConfig(pending[0].config));const result=await running;
  assert.equal(result.simulations,2);assert.equal(result.checkpoint.exactNextConfiguration,'2');
  assert.deepEqual(result.configurations.map(row=>row.key),pending.map(row=>row.config.key));
  assert.deepEqual(Object.keys(result.checkpoint.cache).sort(),pending.map(row=>row.config.key).sort());
});

test('serial and concurrent JSON-restored traversal cover identical configurations, prices, uncertainty and independent leaders',async()=>{
  const serial=fixture({simulationConcurrency:1}),parallel=fixture();parallel.input.prices=serial.input.prices;
  const first=await optimize({...serial.input,limits:{...serial.input.limits,simulations:1}});
  // The same old serial checkpoint is valid on a capacity-two continuation.
  const result1=await finish(serial,first.checkpoint),result2=await finish(parallel,first.checkpoint);
  assert.deepEqual(result2.checkpoint,result1.checkpoint);
  assert.deepEqual(parallel.calls,serial.calls.slice(1));
  for(const leader of ['bestMeasuredDps','bestValueConfirmed','bestDpsConfirmed'])assert(result2.checkpoint[leader]);
  assert.notEqual(result2.checkpoint.bestValueConfirmed.configuration.key,result2.checkpoint.bestDpsConfirmed.configuration.key);
});

test('failed second simulation preserves validated first facts with the original cursor and retries only missing work',async()=>{
  const first=deferred(),second=deferred(),calls=[];let saved;
  const h=fixture({simulate:async(config,signal)=>{calls.push({config,signal});return calls.length===1?first.promise:second.promise;},onCheckpoint:value=>{saved=value;}});
  const initial=await optimize({...h.input,shouldYield:()=>true});const before=JSON.stringify(initial.checkpoint);
  const running=optimize({...h.input,checkpoint:initial.checkpoint});await nextTurn();assert.equal(calls.length,2);
  first.resolve(measureConfig(calls[0].config));await nextTurn();second.reject(new Error('native_second_failed'));
  await assert.rejects(running,/native_second_failed/);assert.equal(JSON.stringify(initial.checkpoint),before);
  assert.equal(saved.exactNextConfiguration,'0');assert.equal(saved.totalSimulations,1);
  assert.deepEqual(Object.keys(saved.cache),[calls[0].config.key]);
  const retry=fixture();retry.input.prices=h.input.prices;const result=await finish(retry,JSON.parse(JSON.stringify(saved)));
  assert(!retry.calls.some(row=>row.key===calls[0].config.key));assert(retry.calls.some(row=>row.key===calls[1].config.key));
  const serial=fixture({simulationConcurrency:1});serial.input.prices=h.input.prices;
  assert.deepEqual(result.checkpoint,(await finish(serial)).checkpoint);
});

test('failure aborts and drains a slow sibling and never caches its post-abort response',async()=>{
  const slow=deferred(),pending=[];let saved,settled=false;
  const h=fixture({simulate:async(config,signal)=>{pending.push({config,signal});if(pending.length===2)throw Error('second_failed');return slow.promise;},onCheckpoint:value=>{saved=value;}});
  const running=optimize(h.input);running.then(()=>{settled=true;},()=>{settled=true;});await nextTurn();
  assert.equal(pending.length,2);assert.equal(pending[0].signal.aborted,true);assert.equal(settled,false);
  slow.resolve(measured());await assert.rejects(running,/second_failed/);
  assert.equal(saved.exactNextConfiguration,'0');assert.equal(saved.totalSimulations,0);assert.deepEqual(saved.cache,{});
});

test('external abort drains both waiting requests without caching aborted measurements; abort before work starts neither',async()=>{
  const controller=new AbortController(),gates=[deferred(),deferred()],signals=[];let saved,settled=false;
  const h=fixture({signal:controller.signal,simulate:async(_config,signal)=>{const at=signals.length;signals.push(signal);return gates[at].promise;},onCheckpoint:value=>{saved=value;}});
  const running=optimize(h.input);running.then(()=>{settled=true;},()=>{settled=true;});await nextTurn();controller.abort();await nextTurn();
  assert.equal(signals.length,2);assert(signals.every(signal=>signal.aborted));assert.equal(settled,false);
  gates[0].resolve(measured());await nextTurn();assert.equal(settled,false);gates[1].resolve(measured());
  await assert.rejects(running,{name:'AbortError'});assert.equal(saved.exactNextConfiguration,'0');assert.deepEqual(saved.cache,{});
  await assert.rejects(optimize(h.input),{name:'AbortError'});assert.equal(signals.length,2);
});

test('wrong engine and invalid precision are never persisted as completed siblings',async()=>{
  for(const invalid of [{...measured(),engine:'SimulationCraft other'}, {...measured(),confidence:90}]) {
    let count=0,saved;const h=fixture({simulate:async()=>++count===1?measured():invalid,onCheckpoint:value=>{saved=value;}});
    await assert.rejects(optimize(h.input),/simulation_version_changed|invalid_simulation_result/);
    assert.equal(saved.exactNextConfiguration,'0');assert.equal(Object.keys(saved.cache).length,1);
    assert(Object.values(saved.cache).every(row=>row.engine===engine&&row.confidence===95));
  }
});

test('capacity one, legacy bounded mode and single native budget keep serial execution',async()=>{
  for(const extra of [{simulationConcurrency:1},{exhaustive:false},{limits:{configurations:128,simulations:1}}]) {
    let active=0,max=0;const h=fixture({...extra,simulate:async config=>{max=Math.max(max,++active);await nextTurn();active--;return measureConfig(config);}});
    const result=await optimize(h.input);assert.equal(max,1);assert(result.simulations<=(extra.limits?.simulations??2));
  }
});

test('yield after a successful pair retains unconsumed measurement and resumes at capacity one without repetition',async()=>{
  let yieldNow=false;const h=fixture({shouldYield:()=>yieldNow,simulate:async config=>{h.calls.push(structuredClone(config));if(h.calls.length===2)yieldNow=true;return measureConfig(config);}});
  const first=await optimize(h.input);assert.equal(first.simulations,2);assert.equal(first.checkpoint.exactNextConfiguration,'1');
  yieldNow=false;const result=await finish({...h,input:{...h.input,simulationConcurrency:1}},first.checkpoint);
  assert.equal(h.calls.length,new Set(h.calls.map(row=>row.key)).size);assert(result.complete);
});

test('failed first request retains a completed later sibling but never certifies it ahead of the durable cursor',async()=>{
  const first=deferred(),second=deferred(),requests=[];let saved;
  const h=fixture({simulate:async config=>{requests.push(config);return requests.length===1?first.promise:second.promise;},onCheckpoint:value=>{saved=value;}});
  const running=optimize(h.input);await nextTurn();second.resolve(measureConfig(requests[1]));await nextTurn();first.reject(Error('first_failed'));
  await assert.rejects(running,/first_failed/);assert.equal(saved.exactNextConfiguration,'0');
  assert.equal(saved.bestMeasuredDps,undefined);assert.equal(saved.bestValueConfirmed,undefined);
  assert.deepEqual(Object.keys(saved.cache),[requests[1].key]);
  const retry=fixture();retry.input.prices=h.input.prices;const result=await finish(retry,JSON.parse(JSON.stringify(saved)));
  assert(retry.calls.some(row=>row.key===requests[0].key));assert(!retry.calls.some(row=>row.key===requests[1].key));
  const serial=fixture({simulationConcurrency:1});serial.input.prices=h.input.prices;
  assert.deepEqual(result.checkpoint,(await finish(serial)).checkpoint);
});

test('freshness expiry after a pair clears price-certified leaders and fresh retry reuses both exact measurements',async()=>{
  const h=fixture({simulate:async config=>{h.calls.push(config);if(h.calls.length===2)h.input.now=Date.parse(h.input.prices.sourceUpdatedAt)+3*60*60*1000;return measureConfig(config);}});
  const stale=await optimize(h.input);assert.equal(stale.complete,true);assert(stale.reasons.includes('market_unverified'));
  assert.equal(stale.checkpoint.exactNextConfiguration,'0');assert.equal(Object.keys(stale.checkpoint.cache).length,2);
  assert.equal(stale.checkpoint.bestMeasuredDps,undefined);assert.equal(stale.checkpoint.bestDpsConfirmed,undefined);
  const completedKeys=h.calls.map(row=>row.key);delete h.input.now;const result=await finish(h,JSON.parse(JSON.stringify(stale.checkpoint)));
  for(const key of completedKeys)assert.equal(h.calls.filter(row=>row.key===key).length,1);
  assert(result.checkpoint.bestDpsConfirmed);assert(!result.reasons.includes('market_unverified'));
});

test('equivalent procurement variants share native work while later reuse retains serial cache-hit diagnostics',async()=>{
  const sourceUpdatedAt=new Date().toISOString();
  const compare=async simulationConcurrency=>{
    let hits=0;const h=fixture({simulationConcurrency,onCacheHit:()=>{hits++;}});
    const original=h.input.catalog.resolve;
    h.input.catalog={...h.input.catalog,resolve:slot=>{const r=original(slot),first=r.gemChoices['0'][0];
      return{...r,gemChoices:Object.fromEntries(Object.entries(r.gemChoices).map(([key,choices])=>[key,[...choices,{...first,key:'duplicate-procurement',consumableItemId:9000}]]))};}};
    h.input.prices.sourceUpdatedAt=sourceUpdatedAt;h.input.prices.prices[9000]={ladder:[[6,100]]};
    const result=await finish(h);return{calls:h.calls,hits,checkpoint:result.checkpoint};
  };
  const serial=await compare(1),parallel=await compare(2);
  assert(serial.hits>0);assert.equal(parallel.hits,serial.hits);assert.deepEqual(parallel.calls.map(row=>row.key),serial.calls.map(row=>row.key));
  assert.deepEqual(parallel.checkpoint,serial.checkpoint);
});

test('a verified 25-profile worker fills a bounded window while the first native measurement is pending', async () => {
  const choices = Array.from({length: 70}, (_, i) => ({
    key: String(i), kind: 'gem', consumableItemId: 8000 + i, simulationId: 8000 + i,
  }));
  const {input} = fixture({
    simulationBatchSize: 25, limits: {simulations: 50},
    slots: [{slotType: 'HEAD', variantKey: 'fixture', metadataKey: 'verified', owned: false, sockets: [{key:'0',type:'14'}]}],
    catalog: {version: 'batch', complete: true, resolve: () => ({
      verified: true, enchantApplicable: false, enchantChoices: [], gemChoices: {'0': choices},
    })},
    prices: {sourceUpdatedAt: new Date().toISOString(), prices: Object.fromEntries(choices.map(gem => [gem.consumableItemId, {ladder: [[10, 1]]}]))},
  });
  const pending = [], full = deferred();
  const running = optimize({...input, simulate: async config => {
    const gate = deferred();
    pending.push({config, gate});
    if (pending.length === 50) full.resolve();
    return gate.promise;
  }});
  assert.equal(pending.length, 1, 'the first native measurement starts before the producer yields during preparation');
  await full.promise;
  assert.equal(new Set(pending.map(row => row.config.key)).size, 50);
  for (const {config, gate} of [...pending].reverse()) gate.resolve(measureConfig(config));
  const first = await running;
  assert.equal(first.simulations, 50);
  assert.equal(first.checkpoint.exactNextConfiguration, '50');

  const result = await finish({input}, JSON.parse(JSON.stringify(first.checkpoint)));
  const serial = await finish({input: {...input, simulationConcurrency: 1, simulationBatchSize: 0, limits: {simulations: 1}}});
  assert.equal(result.checkpoint.totalSimulations, choices.length + 1);
  assert.deepEqual(result.checkpoint, serial.checkpoint);
});

test('a cooperative deadline during lookahead keeps the first measurement and admits no further work', async () => {
  let started = false;
  const h = fixture({
    simulationBatchSize: 25, limits: {simulations: 50}, shouldYield: () => started,
    simulate: async config => { started = true; h.calls.push(config); return measureConfig(config); },
  });
  const first = await optimize(h.input);
  assert.equal(h.calls.length, 1);
  assert.equal(first.checkpoint.exactNextConfiguration, '1');
  const next = await finish({...h, input: {...h.input, shouldYield: () => false}}, JSON.parse(JSON.stringify(first.checkpoint)));
  assert.equal(h.calls.length, new Set(h.calls.map(config => config.key)).size);
  assert.equal(next.complete, true);
});

test('interrupted profileset windows retain every validated sibling without ranking beyond the cursor', async () => {
  let saved;
  const h = fixture({simulationBatchSize: 4, limits: {simulations: 8}, onCheckpoint: state => { saved = state; }});
  const pending = [];
  const running = optimize({...h.input, simulate: async (config, signal) => {
    const gate = deferred();
    pending.push({config, signal, gate});
    return gate.promise;
  }});
  assert.equal(pending.length, 8);
  for (const row of pending.slice(3)) row.gate.resolve(measureConfig(row.config));
  await nextTurn();
  pending[0].gate.reject(Error('first_native_failed'));
  await nextTurn();
  assert(pending.every(row => row.signal.aborted));
  for (const row of pending.slice(1, 3)) row.gate.resolve(measureConfig(row.config));
  await assert.rejects(running, /first_native_failed/);
  assert.equal(saved.exactNextConfiguration, '0');
  assert.equal(saved.bestMeasuredDps, undefined);
  assert.deepEqual(Object.keys(saved.cache), pending.slice(3).map(row => row.config.key));
  const result = await finish(h, JSON.parse(JSON.stringify(saved)));
  assert(h.calls.every(config => !saved.cache[config.key]));
  assert.equal(result.checkpoint.totalSimulations, h.calls.length + 5);
});

test('a changed owned armory ends the profileset window and resumes at the next ordinal', async () => {
  const h = fixture({simulationBatchSize: 25, limits: {simulations: 50}, budgetCopper: 300});
  const slot = {...h.input.slots[0], sockets: [{key: '0', type: '14'}]};
  const owned = {...slot, slotType: 'LEGS', owned: true, allowOwnedChanges: true, ownedItemId: 9900, installed: {gems: [null]}};
  h.input.slots = [slot, owned];
  const first = await optimize(h.input);
  assert.equal(first.complete, false);
  assert.equal(first.simulations, 6, 'six purchased gem choices share the first owned armory');
  assert.equal(new Set(h.calls.map(row => JSON.stringify(row.ownedChanges))).size, 1);
  const next = await finish(h, JSON.parse(JSON.stringify(first.checkpoint)));
  const serial = await finish({input: {...h.input, simulationConcurrency: 1, limits: {simulations: 2}}});
  assert.deepEqual(next.checkpoint, serial.checkpoint);
  assert.equal(next.checkpoint.totalSimulations, 35);
});

test('two distinct owned base armories occupy both lanes without accumulating more single requests', async () => {
  const h = fixture({simulationBatchSize: 25, limits: {simulations: 50}, budgetCopper: 300});
  const slot = {...h.input.slots[0], sockets: [{key: '0', type: '14'}]};
  h.input.slots = [{...slot, owned: true, allowOwnedChanges: true, ownedItemId: 9900, installed: {gems: [null]}}, {...slot, slotType: 'LEGS'}];
  const first = await optimize(h.input);
  assert.equal(first.simulations, 2);
  assert.equal(new Set(h.calls.map(row => JSON.stringify(row.ownedChanges))).size, 2);
  assert.equal(first.checkpoint.exactNextConfiguration, '2');
});

test('abort during ordered ranking retains all completed native measurements and the processed prefix', async () => {
  const controller = new AbortController(), h = fixture({simulationBatchSize: 25, budgetCopper: 300, limits: {simulations: 50}});
  let saved, issued = 0;
  await assert.rejects(optimize({...h.input, signal: controller.signal, onCheckpoint: state => { saved = state; },
    simulate: async config => {
      if (++issued === 35) setImmediate(() => controller.abort());
      return measureConfig(config);
    },
  }), {name: 'AbortError'});
  assert.equal(issued, 35);
  assert.equal(saved.totalSimulations, 35);
  assert.equal(saved.exactNextConfiguration, '32');
  const result = await finish(h, JSON.parse(JSON.stringify(saved)));
  assert.equal(h.calls.length, 0);
  assert(result.complete);
});
