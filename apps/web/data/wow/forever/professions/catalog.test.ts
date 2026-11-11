import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { professions, filterRecipes, pageNumber } from '@/lib/forever/guides/professions';
const evidence=JSON.parse(readFileSync(new URL('./evidence.json',import.meta.url),'utf8'));
test('Forever roster includes First Aid and excludes Retail-only professions',()=>{
 assert.deepEqual(professions.map(p=>p.slug).sort(),['alchemy','blacksmithing','cooking','enchanting','engineering','first-aid','fishing','herbalism','leatherworking','mining','skinning','tailoring'].sort());
 assert.equal(evidence.edition,'forever');assert.equal(evidence.build,'1.60.1.70862');
 for(const p of professions) {assert.equal(p.maxSkill,300);assert.equal(p.ranks.at(-1)?.maxSkill,300);}
});
test('recipes have no dangling item relations or excluded entries',()=>{
 for(const p of professions){
  assert.equal(new Set(p.recipes.map(r=>r.id)).size,p.recipes.length);
  const ex=new Set(evidence.professions[p.slug].excluded.map((x:{id:number})=>x.id));
  for(const r of p.recipes){assert.ok(!ex.has(r.id));assert.ok(r.requiredSkill===null||(r.requiredSkill>=1&&r.requiredSkill<=300));
   for(const x of r.reagents){assert.ok(p.items[x.id]);assert.ok(Number.isInteger(x.quantity)&&x.quantity>0);}
   if(r.output){assert.ok(p.items[r.output.id]);assert.ok(r.output.quantity>0);}
   for(const id of r.sourceItems)assert.ok(p.items[id]);
  }
  assert.equal(evidence.professions[p.slug].sourceTotal,p.recipes.length+ex.size);
 }
});
test('SoD leftovers and Classic-only learn skills do not leak',()=>{
 const p=professions.find(p=>p.slug==='alchemy')!;
 assert.ok(!p.recipes.some(r=>r.id===426607));
 assert.equal(p.recipes.find(r=>r.id===2331)?.requiredSkill,null);
 assert.equal(p.recipes.find(r=>r.id===1245250)?.requiredSkill,1);
});
test('search supports Russian reagents, source intersections and unknown skills',()=>{
 const p=professions.find(p=>p.slug==='alchemy')!;const r=p.recipes.find(r=>r.id===1230564)!;
 assert.ok(filterRecipes(p,{q:'  '+p.items[r.reagents[0].id].name.ru.toUpperCase()+' '}).some(x=>x.id===r.id));
 assert.ok(!filterRecipes(p,{skill:'300'}).some(r=>r.requiredSkill===null));
 assert.ok(filterRecipes(p,{camp:'yes',source:'trainer'}).every(r=>r.campTier!==null&&r.trainers.length));
 assert.equal(filterRecipes(p,{q:'definitely-not-a-recipe'}).length,0);
});
test('pagination clamps hostile URLs and empty results',()=>{
 assert.equal(pageNumber('-1',178),1);assert.equal(pageNumber('999999999999999999999',178),1);
 assert.equal(pageNumber('99',178),4);assert.equal(pageNumber('0',0),1);
});

test('speculative reagent chains and acquisition items are removed',()=>{
 const engineering=professions.find(p=>p.slug==='engineering')!;
 assert.ok(!engineering.recipes.some(r=>r.id===435966||r.id===435964||r.id===1266939));
 const enchanting=professions.find(p=>p.slug==='enchanting')!;
 assert.deepEqual(enchanting.recipes.find(r=>r.id===1231139)?.sourceItems,[]);
});
