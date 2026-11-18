/** Physical assignment enumeration fixtures only: no simulation, account or remote requests. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAuctionGearEnhancedLoadoutIterator as create} from '../../../lib/wow/auctionGearEnhancedLoadouts.ts';
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
test('keeps every physical option, including equal effects and late copies, without a shortlist',async()=>{
 const offers=Array.from({length:80},(_,i)=>{const row=option(i+1,'HEAD');row.candidate.itemId=1;return row;});
 const input=base(offers),result=await all(input);assert.equal(result.total,'81');assert.equal(result.rows.length,81);assert.deepEqual(new Set(result.rows.flatMap(r=>r.options.map(o=>o.id))),new Set(offers.map(o=>o.id)));
 const other=option(100,'CHEST');assert.equal((await all(base([...offers,other]))).rows.length,81,'unselected slots cannot be replaced');
});
test('two ring aliases charge one whole lot and respect its quantity without unsafe partial-sum pruning',async()=>{
 const a=option(1,'FINGER_1',60),b=option(1,'FINGER_2',60);const one=await all(base([a,b],['FINGER_1','FINGER_2'],[],60));assert.equal(one.rows.length,3);assert(!one.rows.some(r=>r.options.length===2));
 const two=await all(base([{...a,quantity:2},{...b,quantity:2}],['FINGER_1','FINGER_2'],[],60));assert.equal(two.rows.length,4);const pair=two.rows.find(r=>r.options.length===2);assert.equal(pair.spentCopper,60);assert.equal(pair.remainingCopper,0);
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
 for(const corrupt of [{...state,version:2},{...state,cursor:[2]},{...state,visited:'1'},{...state,visited:'01'},{...state,exhausted:true},{...state,inputKey:'foreign'}])await assert.rejects(iterator.nextBatch(corrupt,limits),/invalid_search_checkpoint/);
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
