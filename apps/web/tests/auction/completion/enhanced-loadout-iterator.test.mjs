/** Grouped equipment enumeration fixtures only: no simulation, account or remote requests. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAuctionGearEnhancedLoadoutIterator as create} from '../../../lib/wow/auctionGearEnhancedLoadouts.ts';
import {auctionPlanCost} from '../../../lib/wow/auctionGearPlanner.ts';
import {auctionGearSlots} from '../../../lib/wow/auctionGearSelection.ts';
const signal=()=>new AbortController().signal;
const inventory={HEAD:1,NECK:2,SHOULDER:3,BACK:16,CHEST:5,WRIST:9,HANDS:10,WAIST:6,LEGS:7,FEET:8,FINGER_1:11,FINGER_2:11,TRINKET_1:12,TRINKET_2:12,MAIN_HAND:13,OFF_HAND:13};
function option(id,slot,cost=10,extra={}){
 const candidate={entityId:`entity-${id}`,itemId:id,name:`Synthetic ${id}`,slotType:slot,itemLevel:100,inventoryType:inventory[slot],itemClassId:slot.endsWith('HAND')?2:4,itemSubclassId:slot.endsWith('HAND')?7:4,eligible:true,rejectionReasons:[],constraints:{uniqueEquipped:false,crafted:false,allowableClassMask:'0',requiredLevel:1},compatibility:{specId:72,method:'specialization',itemClassId:4,itemSubclassId:4},variants:[{key:'exact',itemLevel:100,contextId:0,bonusIds:[]}]};
 return{id:`${id}:${slot}`,auctionId:id,quantity:1,costCopper:cost,variantKey:'exact',candidate,...extra};
}
function base(options=[],selectedSlots=['HEAD'],loadout=[],budgetCopper=100,specId=72){
 return{options,selectedSlots,loadout,budgetCopper,specId,equipment:{equipped_items:loadout.map(item=>({slot:{type:item.slotType},item:{id:item.itemId},sockets:[{item:{id:101}}],enchantments:[{enchantment_id:201,enchantment_slot:{id:0}}]}))}};
}
const key=row=>row.options.map(o=>o.id).sort().join('|');
async function all(input,limits={maxAssignments:10000,maxResults:10000}){
 const iterator=create(input);let state=iterator.initialState(),rows=[];
 for(let batch=0;batch<10000;batch++){
  const next=await iterator.nextBatch(state,{...limits,signal:signal()});rows.push(...next.loadouts);state=JSON.parse(JSON.stringify(next.state));
  if(next.complete)return{rows,state,total:iterator.totalAssignments};
 }
 assert.fail('fixture iterator did not complete');
}
test('emits empty purchase/retained equipment case with zero budget without modifying owned enhancements',async()=>{
 const input=base([],['HEAD'],[{slotType:'HEAD',itemId:50,inventoryType:1,itemSubclassId:4}],0);const snapshot=structuredClone(input),{rows,state,total}=await all(input);
 assert.equal(total,'1');assert.equal(state.visited,'1');assert.equal(rows.length,1);assert.deepEqual(rows[0].options,[]);assert.deepEqual(rows[0].loadout,input.loadout);assert.equal(rows[0].spentCopper,0);assert.equal(rows[0].remainingCopper,0);assert.deepEqual(input,snapshot);
});
test('visits each mechanical variant once and buys the cheapest allowed physical lot', async () => {
  const copies = Array.from({length: 80}, (_, i) => option(i + 1, 'HEAD', 100 - i));
  for (const row of copies) row.candidate.itemId = 1;
  const distinct = option(81, 'HEAD', 5);
  const result = await all(base([...copies, distinct, option(100, 'CHEST')]));
  assert.equal(result.total, '3');
  assert.deepEqual(result.rows.map(row => row.options[0]?.auctionId), [undefined, 80, 81]);
  const withoutCheapest = await all(base(copies.slice(0, -1)));
  assert.equal(withoutCheapest.rows[1].options[0].auctionId, 79);
  assert.equal(withoutCheapest.rows[1].spentCopper, 22);
});

test('keeps distinct native effects, equip constraints and enhancement eligibility in separate branches', async () => {
  const variants = Array.from({length: 11}, (_, i) => option(i + 1, 'FINGER_1'));
  for (const row of variants) row.candidate.itemId = 1;
  const variant = index => variants[index].candidate.variants[0];
  variant(1).bonusIds = [10];
  variant(2).contextId = 13;
  variant(3).modifiers = [{type: 9, value: 80}];
  variants[4].candidate.constraints.uniqueEquipped = true;
  variant(5).itemLevel++;
  variants[6].candidate.itemClassId++;
  for (const i of [7, 8, 9, 10]) {
    variant(i).resolution = {metadataVersion: 3, enhancements: {status: 'verified', socketColors: [14, 0, 0],
      socketCount: 1, socketBonusId: 0, requiredProfessionId: 0, requiredProfessionRank: 0}};
  }
  variant(8).resolution.enhancements.socketColors = [0, 14, 0];
  variant(9).resolution.enhancements.requiredProfessionId = 4;
  Object.assign(variant(10).resolution, {effectsVerified: true, effects: []});
  assert.equal((await all(base(variants, ['FINGER_1']))).total, '12');
});

test('an invalid zero enchant on a cheaper copy cannot hide the valid unenchanted lot', async () => {
  const bad = option(1, 'HEAD', 1, {customization: {enchantId: 0}});
  const good = {...bad, auctionId: 2, id: 'valid', costCopper: 2, customization: {}};
  const {rows} = await all(base([bad, good]));
  assert.deepEqual(rows.map(row => row.options[0]?.id), [undefined, 'valid']);
});

test('joint receipt can switch both rings to a dearer multi-piece lot and survives option exclusions', async () => {
  const makeLot = (id, cost, quantity) => ['FINGER_1', 'FINGER_2'].map(slot => {
    const row = option(id, slot, cost, {quantity});
    row.candidate.itemId = 500;
    return row;
  });
  const lots = [...makeLot(1, 20, 1), ...makeLot(2, 23, 1), ...makeLot(3, 30, 2)];
  const rings = offered => all(base(offered, ['FINGER_1', 'FINGER_2'], [], 43), {maxAssignments: 1, maxResults: 1});
  const both = await rings(lots);
  assert.equal(both.total, '4');
  assert.equal(both.rows[1].spentCopper, 20);
  assert.deepEqual(both.rows[3].options.map(o => o.auctionId), [3, 3]);
  assert.equal(both.rows[3].spentCopper, 30);
  const excluded = await rings(lots.filter(row => row.id !== '3:FINGER_2'));
  assert.equal(excluded.rows[3].spentCopper, 43);
  assert.deepEqual(excluded.rows[3].options.map(o => o.auctionId).sort(), [1, 2]);
});
test('an overflowing pair of individually valid lots cannot hide an affordable shared lot', async () => {
  const slots = ['FINGER_1', 'FINGER_2'];
  const offers = [1, 2, 3].flatMap(id => slots.map(slot => {
    const row = option(id, slot, id < 3 ? Number.MAX_SAFE_INTEGER : 10, {quantity: id < 3 ? 1 : 2});
    row.candidate.itemId = 30;
    return row;
  }));
  const {rows} = await all(base(offers, slots, [], Number.MAX_SAFE_INTEGER));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.at(-1).options.map(row => row.auctionId), [3, 3]);
  assert.equal(rows.at(-1).spentCopper, 10);
});

test('grouped traversal matches physical receipts across budgets, exclusions and equal-price ties', async () => {
  const slots = ['HEAD', 'FINGER_1', 'FINGER_2'];
  const offers = [option(10, 'HEAD', 3), option(11, 'HEAD', 3)];
  offers[1].candidate.itemId = offers[0].candidate.itemId;
  for (const [id, itemId, cost, quantity] of [[20, 9, 3, 1], [21, 9, 3, 1], [22, 9, 5, 2], [23, 8, 4, 1]]) {
    for (const slot of slots.slice(1)) {
      const row = option(id, slot, cost, {quantity});
      row.candidate.itemId = itemId;
      offers.push(row);
    }
  }
  const mechanicalKey = rows => JSON.stringify(rows.map(row => [row.candidate.slotType, row.candidate.itemId]).sort());
  for (const exclusion of [null, '10:HEAD', '20:FINGER_1', '22:FINGER_2']) {
    const allowed = offers.filter(o => o.id !== exclusion);
    for (const budget of [0, 3, 5, 6, 8, 12]) {
      const expected = new Map();
      const walk = (axis, rows) => {
        if (axis < slots.length) {
          walk(axis + 1, rows);
          for (const row of allowed.filter(o => o.candidate.slotType === slots[axis])) walk(axis + 1, [...rows, row]);
          return;
        }
        let cost;
        try { cost = auctionPlanCost(rows); } catch (error) {
          assert.equal(error.message, 'auction_quantity_exceeded');
          return;
        }
        if (cost > budget) return;
        const key = mechanicalKey(rows), receipt = rows.map(row => row.id).sort().join('|'), old = expected.get(key);
        if (!old || cost < old.cost || cost === old.cost && receipt < old.receipt) expected.set(key, {cost, receipt});
      };
      walk(0, []);
      const input = base(allowed, slots, [], budget), iterator = create(input), actual = new Map();
      let state = iterator.initialState();
      while (!state.exhausted) {
        const next = await iterator.nextBatch(state, {maxAssignments: 2, maxResults: 1, signal: signal()});
        state = JSON.parse(JSON.stringify(next.state));
        for (const row of next.loadouts) {
          const key = mechanicalKey(row.options), receipt = row.options.map(o => o.id);
          assert.deepEqual(await iterator.optionIdsAt((BigInt(state.visited) - 1n).toString(), signal()), receipt);
          assert(!actual.has(key));
          actual.set(key, {cost: row.spentCopper, receipt: receipt.sort().join('|')});
        }
      }
      assert.deepEqual(actual, expected);
    }
  }
});

test('two ring aliases charge one whole lot and respect its quantity without unsafe partial-sum pruning',async()=>{
 const a=option(1,'FINGER_1',60),b=option(1,'FINGER_2',60);const one=await all(base([a,b],['FINGER_1','FINGER_2'],[],60));assert.equal(one.rows.length,3);assert(!one.rows.some(r=>r.options.length===2));
 const two=await all(base([{...a,quantity:2},{...b,quantity:2}],['FINGER_1','FINGER_2'],[],60));assert.equal(two.rows.length,4);const pair=two.rows.find(r=>r.options.length===2);assert.equal(pair.spentCopper,60);assert.equal(pair.remainingCopper,0);
});
test('a resumed conflicting ring pair skips only its remaining suffix',async()=>{
 const tail=[option(51,'TRINKET_1'),option(52,'TRINKET_1'),option(53,'TRINKET_1')];
 for(const conflict of ['quantity','category']){
  const left=option(1,'FINGER_1'),right=option(conflict==='quantity'?1:2,'FINGER_2');
  if(conflict==='category')for(const row of [left,right])Object.assign(row.candidate.constraints,{limitCategoryId:8,limitQuantity:1});
  const nextRing=option(3,'FINGER_2');
  const input=base([left,right,nextRing,...tail],['FINGER_1','FINGER_2','TRINKET_1']);
  const it=create(input),state={...it.initialState(),cursor:[1,1,1],visited:'17'};
  const jump=await it.nextBatch(state,{signal:signal(),maxAssignments:1,maxResults:1});
  assert.deepEqual(jump.loadouts,[]);assert.deepEqual(jump.state.cursor,[1,2,0]);assert.equal(jump.state.visited,'20');
  const next=await it.nextBatch(JSON.parse(JSON.stringify(jump.state)),{signal:signal(),maxAssignments:1,maxResults:1});
  assert.deepEqual(next.loadouts[0].options.map(o=>o.id),[left.id,nextRing.id]);
 }
});

test('retained unique items and categories are checked only after simultaneous replacements',async()=>{
 const worn=[{slotType:'FINGER_1',itemId:10,inventoryType:11,itemSubclassId:0,uniqueEquipped:true},{slotType:'FINGER_2',itemId:20,inventoryType:11,itemSubclassId:0}];
 const replaceFirst=option(30,'FINGER_1',5),moveUnique=option(10,'FINGER_2',5);moveUnique.candidate.constraints.uniqueEquipped=true;
 const result=await all(base([replaceFirst,moveUnique],['FINGER_1','FINGER_2'],worn,10));assert(result.rows.some(r=>r.options.length===2),'an individually conflicting ring becomes legal when its old slot changes');assert(!result.rows.some(r=>r.options.length===1&&r.options[0].id===moveUnique.id));
 const locked=await all(base([moveUnique],['FINGER_2'],worn,10));assert.equal(locked.rows.length,1);
 const category=[{slotType:'HEAD',itemId:1,inventoryType:1,itemSubclassId:4,limitCategoryId:8,limitQuantity:2},{slotType:'CHEST',itemId:2,inventoryType:5,itemSubclassId:4,limitCategoryId:8,limitQuantity:2}];
 const head=option(31,'HEAD',5),feet=option(32,'FEET',5);Object.assign(feet.candidate.constraints,{limitCategoryId:8,limitQuantity:2});
 const sets=(await all(base([head,feet],['HEAD','FEET'],category,10))).rows;assert(!sets.some(r=>r.options.length===1&&r.options[0].id===feet.id));assert(sets.some(r=>r.options.length===2));
});
test('two-hand replacements remove only an unlocked off-hand and reject incompatible simultaneous purchases',async()=>{
 const specId=63,worn=[{slotType:'MAIN_HAND',itemId:1,inventoryType:13,itemSubclassId:7},{slotType:'OFF_HAND',itemId:2,inventoryType:23,itemSubclassId:0}];
 const main=option(41,'MAIN_HAND',5),off=option(42,'OFF_HAND',5);Object.assign(main.candidate,{inventoryType:17,itemSubclassId:10});main.candidate.compatibility.specId=specId;Object.assign(off.candidate,{inventoryType:23,itemClassId:4,itemSubclassId:0});off.candidate.compatibility.specId=specId;
 const locked=await all(base([main],['MAIN_HAND'],worn,10,specId));assert.equal(locked.rows.length,1);
 const result=await all(base([main,off],['MAIN_HAND','OFF_HAND'],worn,10,specId));const purchased=result.rows.find(r=>r.options.length===1&&r.options[0].id===main.id);assert(purchased);assert.deepEqual(purchased.removedSlots,['OFF_HAND']);assert(!purchased.loadout.some(i=>i.slotType==='OFF_HAND'));assert(!result.rows.some(r=>r.options.length===2));
 const furyMain=option(51,'MAIN_HAND',5),furyOff=option(52,'OFF_HAND',5);Object.assign(furyMain.candidate,{inventoryType:17,itemSubclassId:8});Object.assign(furyOff.candidate,{inventoryType:17,itemSubclassId:5});assert((await all(base([furyMain,furyOff],['MAIN_HAND','OFF_HAND'],[],10))).rows.some(r=>r.options.length===2),'Titan’s Grip permits legal two-hand pairs');
});
test('JSON resumable batches cover every assignment once, including empty batches of rejected states',async()=>{
 const offers=[option(1,'HEAD',50),option(2,'HEAD',150),option(3,'CHEST',60),option(4,'CHEST',40)];const input=base(offers,['HEAD','CHEST'],[],100);
 const expected=await all(input);let iterator=create(input),state=iterator.initialState(),rows=[],empty=0;
 while(!state.exhausted){const previous=structuredClone(state),next=await iterator.nextBatch(state,{maxAssignments:1,maxResults:1,signal:signal()});assert.deepEqual(state,previous,'caller-owned persisted cursor is never mutated');assert(BigInt(next.state.visited)>BigInt(state.visited));rows.push(...next.loadouts);if(!next.loadouts.length)empty++;state=JSON.parse(JSON.stringify(next.state));iterator=create({...input,options:[...offers].reverse()});}
 assert(empty>0);assert.deepEqual(rows.map(key),expected.rows.map(key));assert.equal(state.visited,iterator.totalAssignments);const done=await iterator.nextBatch(state,{maxAssignments:1,maxResults:1,signal:signal()});assert(done.complete);assert.deepEqual(done.loadouts,[]);
});
test('yield/abort preserve the last acknowledged cursor and large invalid scans yield to cancellation',async()=>{
 const input=base([option(1,'HEAD')]),iterator=create(input),state=iterator.initialState();const yielded=await iterator.nextBatch(state,{maxAssignments:10,maxResults:10,signal:signal(),shouldYield:()=>true});assert.deepEqual(yielded.state,state);assert(!yielded.complete);assert.deepEqual(yielded.loadouts,[]);
 const controller=new AbortController();controller.abort();await assert.rejects(iterator.nextBatch(state,{maxAssignments:10,maxResults:10,signal:controller.signal}),{name:'AbortError'});assert.equal(state.visited,'0');
 const many=create(base(Array.from({length:300},(_,i)=>option(i+1,'HEAD',200))));const current=many.initialState(),cancel=new AbortController();setImmediate(()=>cancel.abort());await assert.rejects(many.nextBatch(current,{maxAssignments:1000,maxResults:1000,signal:cancel.signal}),{name:'AbortError'});assert.equal(current.visited,'0');
});
test('identity binds options/prices/quantity/metadata/equipment/budget and rejects corrupt cursor facts',async()=>{
 const input=base([option(1,'HEAD')]),iterator=create(input),state=iterator.initialState(),limits={maxAssignments:1,maxResults:1,signal:signal()};
 for(const corrupt of [{...state,version:1},{...state,cursor:[2]},{...state,visited:'1'},{...state,visited:'01'},{...state,exhausted:true},{...state,inputKey:'foreign'}])await assert.rejects(iterator.nextBatch(corrupt,limits),/invalid_search_checkpoint/);
 for(const changed of [{...input,budgetCopper:99},{...input,selectedSlots:['CHEST']},{...input,equipment:{equipped_items:[],changed:true}},{...input,options:[{...input.options[0],quantity:2}]},{...input,options:[{...input.options[0],costCopper:9}]},{...input,options:[{...input.options[0],candidate:{...input.options[0].candidate,constraints:{...input.options[0].candidate.constraints,uniqueEquipped:true}}}]}])await assert.rejects(create(changed).nextBatch(state,limits),/invalid_search_checkpoint/);
 for(const maxAssignments of [0,-1,1.5,Infinity])await assert.rejects(iterator.nextBatch(state,{...limits,maxAssignments}),/invalid_search_limit/);
 assert.throws(()=>create({...input,options:[input.options[0],input.options[0]]}),/invalid_auction_selection/);
});
test('raw domain counts remain exact above Number safe integer across all selected slots',async()=>{
 const offers=auctionGearSlots.flatMap((slot,index)=>Array.from({length:10},(_,copy)=>option(index*10+copy+1,slot)));const iterator=create(base(offers,[...auctionGearSlots]));assert.equal(iterator.totalAssignments,(11n**16n).toString());assert(BigInt(iterator.totalAssignments)>BigInt(Number.MAX_SAFE_INTEGER));const first=await iterator.nextBatch(iterator.initialState(),{maxAssignments:1,maxResults:1,signal:signal()});assert.equal(first.state.visited,'1');assert(!first.complete);
});

test('an over-budget prefix skips its entire suffix while an affordable shared lot stays eligible',async()=>{
 const slots=['HEAD','CHEST','FINGER_1','FINGER_2'];
 const ring=option(100,'FINGER_1',30,{quantity:2});
 const alias={...ring,id:'shared-ring-2',candidate:{...ring.candidate,slotType:'FINGER_2'}};
 const offers=[option(1,'HEAD',70),option(2,'CHEST',70),ring,alias];
 const iterator=create(base(offers,slots,[],100)), accepted=[];
 let state=iterator.initialState(),largestJump=1n;
 while(!state.exhausted){
   const batch=await iterator.nextBatch(state,{maxAssignments:1,maxResults:1,signal:signal()});
   const jump=BigInt(batch.state.visited)-BigInt(state.visited);
   if(jump>largestJump)largestJump=jump;
   accepted.push(...batch.loadouts);state=JSON.parse(JSON.stringify(batch.state));
 }
 // A checkpoint from the old walker may start in the middle of the rejected suffix.
 const legacy={...iterator.initialState(),cursor:[1,1,0,1],visited:'13'};
 const resumed=await iterator.nextBatch(legacy,{maxAssignments:1,maxResults:1,signal:signal()});
 assert.equal(resumed.state.visited,'16');assert.equal(resumed.complete,true);assert.deepEqual(resumed.loadouts,[]);
 assert.equal(largestJump,4n);
 assert.equal(accepted.length,12);
 assert(accepted.some(row=>row.options.length===3 && row.spentCopper===100));
 assert(!accepted.some(row=>row.options.some(o=>o.auctionId===1)&&row.options.some(o=>o.auctionId===2)));
});

test('equivalent native variants share an affordable receipt only inside the same enhancement domain',async()=>{
 const engine='SimulationCraft fixture · 18428cd';
 const options=[1,2,3,4].map(i=>{
   const o=option(i,'HEAD',i===2?2:30);
   o.candidate.itemId=999;
   const v=o.candidate.variants[0];
   v.key=o.variantKey='variant-'+i;
   v.contextId=i;
   v.resolution={engine:i===4?'other':engine,metadataVersion:3,enhancements:{status:'verified',
    socketColors:i===3?[14,0,0]:[0,0,0],socketCount:i===3?1:0,socketBonusId:0,requiredProfessionId:0,requiredProfessionRank:0}};
   return o;
 });
 const input=base(options),legacy=await all(input),pinned=await all({...input,engine},{maxAssignments:1,maxResults:1});
 assert.equal(legacy.total,'5');assert.equal(pinned.total,'4');
 assert.deepEqual(pinned.rows.slice(1).map(r=>r.options[0].auctionId),[2,3,4]);
 assert.equal(pinned.rows[1].spentCopper,2);
 await assert.rejects(create({...input,engine}).nextBatch(legacy.state,{maxAssignments:1,maxResults:1,signal:signal()}),/invalid_search_checkpoint/);
});
