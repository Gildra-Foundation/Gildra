import test from "node:test";
import assert from "node:assert/strict";
import { foreverRecordPath } from "../../apps/web/lib/forever/database/contract.ts";
import { foreverRecord, foreverSearch } from "../../apps/web/lib/forever/database/server.ts";
test("record URLs are edition-bound and reject unsafe IDs",()=>{
  assert.equal(foreverRecordPath("spell",10,"ru"),"/ru/wow/forever/library/spell/10");
  assert.throws(()=>foreverRecordPath("item",NaN));
  assert.throws(()=>foreverRecordPath("item",-1));
});
test("search is bounded, localized and paginated",async()=>{
  const first=await foreverSearch({type:"item"});const second=await foreverSearch({type:"item",page:"2"});
  assert.equal(first.records.length,48);assert.equal(second.records.length,48);
  assert.equal(new Set([...first.records,...second.records].map(x=>x.id)).size,96);
  const ru=await foreverSearch({type:"item",q:"Иссеченный короткий меч"});assert.ok(ru.records.some(x=>x.id===25));
  assert.ok((await foreverSearch({type:"item",q:"Shortsword WORN"})).records.some(x=>x.id===25));
  const empty=await foreverSearch({q:"no-such-record-zzzzzz"});assert.equal(empty.total,0);assert.equal(empty.page,1);
  const last=await foreverSearch({page:"9999999"});assert.equal(last.page,last.pages);
});
test("filters do not confuse quality zero with no filter",async()=>{
  const result=await foreverSearch({type:"item",quality:"0",minLevel:"5",maxLevel:"20"});
  assert.ok(result.records.length);assert.ok(result.records.every(x=>x.quality===0 && x.level!>=5 && x.level!<=20));
});
test("details and absence never fall back to retail",async()=>{
  const spell=await foreverRecord("spell",10);assert.equal(spell?.edition,"forever");assert.equal(spell?.name.en,"Blizzard");
  assert.equal(await foreverRecord("item",999999999),null);
  assert.equal(await foreverRecord("item",-1),null);
});

test("relation filters retain the exact edge and never widen missing sources",async()=>{
  const recipe=await foreverRecord("recipe",1245250);assert.ok(recipe);
  const expected=recipe.relations.filter(edge=>edge.type==="item" && edge.kind==="reagent").map(edge=>edge.id).sort((a,b)=>a-b);
  const result=await foreverSearch({type:"item",related:"recipe:1245250",edge:"reagent"});
  assert.deepEqual(result.records.map(row=>row.id).sort((a,b)=>a-b),expected);
  assert.equal((await foreverSearch({type:"item",related:"recipe:999999999",edge:"reagent"})).total,0);
  assert.equal((await foreverSearch({type:"item",related:"recipe:1245250",edge:"missing"})).total,0);
});
