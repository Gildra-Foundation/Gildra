import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {decodeMythicTalentImport,talentImportSnapshot} from '../../components/wow/mythic/mythicTalentImport.ts';
import {playerSpecs,parsePlayerProfile,talentsForProfile,toolsForMechanic,canHelpWithMechanic} from '../../components/wow/mythic/playerTools.ts';
import {pullRoleTasks} from '../../components/wow/mythic/pullRole.ts';import {buildMdtPullIntel} from '../../components/wow/mythic/mdtPullIntel.ts';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));const fixtures=read('./talentImport.fixtures.json');
const spec=id=>playerSpecs.find(s=>s.id===id);const fixture=id=>fixtures.specs.find(s=>s.specId===id);
const decoded=code=>{const r=decodeMythicTalentImport(code);assert(r.ok,JSON.stringify(r));return r};const selection=(id,kind)=>new Set(decoded(fixture(id)[kind]).selectedSpellIds);
const mechanic=(action,spellId,role='healer')=>({name:'Enemy spell',source:'Enemy',action,spellId,role});
const buttons=(id,mode,action,spellId)=>toolsForMechanic(spec(id),mechanic(action,spellId),selection(id,mode)).map(o=>o.spell.id);
function replaceBits(code,offset,width,value){const a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const bits=[...code].flatMap(c=>Array.from({length:6},(_,i)=>(a.indexOf(c)>>i)&1));for(let i=0;i<width;i++)bits[offset+i]=(value>>i)&1;return Array.from({length:code.length},(_,i)=>a[bits.slice(i*6,i*6+6).reduce((s,b,j)=>s+(b<<j),0)]).join('')}

test('compact snapshot has complete sorted class orders and valid tuple/entry contracts for40specs',()=>{
 assert.equal(Object.keys(talentImportSnapshot.specs).length,40);assert.equal(Object.keys(talentImportSnapshot.classes).length,13);
 for(const [id,s]of Object.entries(talentImportSnapshot.specs)){assert(spec(Number(id)));const order=talentImportSnapshot.classes[s.classId].order;assert.deepEqual(order,[...new Set(order)].sort((a,b)=>a-b));assert.equal(new Set(s.nodes.map(n=>n[0])).size,s.nodes.length);for(const n of s.nodes){assert.equal(n.length,6);assert(order.includes(n[0]));assert(n[1]>0);assert([0,1,2,3].includes(n[2]));assert(n[5].every(e=>e.length===3&&e.every(Number.isInteger)));}}
});
test('all40specs decode independent on/off fixtures and optional spell requirements select exactly',()=>{
 for(const f of fixtures.specs){const on=decoded(f.on),off=decoded(f.off);assert.equal(on.specId,f.specId);assert.equal(off.classId,f.classId);assert(on.hashChecked);const onIds=new Set(on.selectedSpellIds),offIds=new Set(off.selectedSpellIds);
  for(const kind of ['interrupt','stop','dispel','purge','defend'])for(const option of spec(f.specId)[kind])if(option.talentSpellId){assert(onIds.has(option.talentSpellId),String(option.talentSpellId));assert(!offIds.has(option.talentSpellId),String(option.talentSpellId));}
 }
});
test('selected choice entry is decoded without enabling the unselected sibling',()=>{
 const d=decoded(fixtures.special.choiceOther);assert(d.selectedSpellIds.includes(fixtures.special.choiceSpell));assert(!d.selectedSpellIds.includes(fixtures.special.excludedChoiceSpell));
 assert.deepEqual(toolsForMechanic(spec(105),mechanic('Пурж',1310319),new Set(d.selectedSpellIds)),[]);
});
test('partial ranks and tiered ranks do not grant later entries',()=>{
 assert(decoded(fixtures.special.partial).selectedSpellIds.includes(fixtures.special.partialSpell));const d=decoded(fixtures.special.tiered);assert(d.selectedSpellIds.includes(fixtures.special.tierFirst));assert(!d.selectedSpellIds.includes(fixtures.special.tierOther));
});
test('base abilities survive import while untaken kicks/control/defensives disappear',()=>{
 assert.deepEqual(buttons(64,'off','Кик',1),[2139]);assert.deepEqual(buttons(250,'off','Кик',1),[]);assert.deepEqual(buttons(250,'on','Кик',1),[47528]);
 assert.deepEqual(buttons(64,'off','Диспел',1217973),[]);assert.deepEqual(buttons(64,'on','Диспел',1217973),[475]);
 assert.deepEqual(buttons(65,'off','Защита',1),[498]);assert.deepEqual(buttons(73,'off','Защита',1),[]);assert.deepEqual(buttons(73,'on','Защита',1),[871]);
});
test('improved dispel effects and exact Freedom exceptions require their selected talents',()=>{
 assert.deepEqual(buttons(65,'off','Диспел',373693),[4987]);assert.deepEqual(buttons(65,'off','Диспел',1308148),[]);assert.deepEqual(buttons(65,'on','Диспел',1308148),[4987]);
 assert.deepEqual(buttons(70,'off','Диспел',1305234),[]);assert.deepEqual(buttons(70,'on','Диспел',1305234),[1044]);assert.deepEqual(buttons(70,'on','Диспел',373693),[]);
 assert(decoded(fixture(105).off).selectedSpellIds.includes(392378),'Automatically granted Improved Nature\'s Cure remains available');
});
test('bad alphabet, truncation, extra payload, versions, specs and changed tree hashes fail safely',()=>{
 const code=fixture(64).on;
 for(const value of ['', 'https://example.test/build', '!'+code, code.slice(0,-1),code+'/',code+'AA','A'.repeat(4097)])assert(!decodeMythicTalentImport(value).ok,value.slice(0,30));
 assert.deepEqual(decodeMythicTalentImport(replaceBits(code,0,8,3)),{ok:false,error:'version'});
 assert.deepEqual(decodeMythicTalentImport(replaceBits(code,8,16,65000)),{ok:false,error:'spec'});
 const a='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const old=(a.indexOf(code[4])&15);assert(!decodeMythicTalentImport(replaceBits(code,24,8,old^255)).ok);
 assert.deepEqual(decodeMythicTalentImport(replaceBits(code,24,8,255)),{ok:false,error:'tree'});
 assert.equal(decoded(' \n'+code+'\n').code,code);assert.equal(decoded(code+'A').code,code,'One zero sextet is normalized like live Hunter profiles');
});
test('optional zero hash is recognized explicitly and never disables talent filtering',()=>{
 const d=decoded(fixtures.special.hashless);assert.equal(d.hashChecked,false);const ids=new Set(d.selectedSpellIds);assert.deepEqual(toolsForMechanic(spec(105),mechanic('Пурж',1310319),ids),[]);
});
test('saved code is revalidated, mismatched or corrupted import fails closed, clearing spec clears import',()=>{
 const code=fixture(64).on;const p=parsePlayerProfile({classId:8,specId:64,talentString:code});assert.equal(p.talentString,code);assert(talentsForProfile(p).result.ok);
 assert.equal(parsePlayerProfile({...p,specId:null}).talentString,undefined);
 const wrong=talentsForProfile({...p,specId:62});assert(!wrong.result.ok);assert.equal(wrong.selection.size,0);
 for(const bad of ['!',42,'A'.repeat(5000)]){const state=talentsForProfile(parsePlayerProfile({...p,talentString:bad}));assert(!state.result.ok);assert.equal(state.selection.size,0);assert.deepEqual(toolsForMechanic(spec(64),mechanic('Диспел',1217973),state.selection),[]);}
 assert.equal(talentsForProfile({classId:8,specId:64}).selection,undefined);
});
test('all161groups ×40specs with imported on/off builds retain duties but never recommend untaken talents',()=>{
 const maps=read('../../data/wow/mythic-reviews/mdt.json'),combat=read('../../data/wow/mythic-reviews/combat.json');let count=0;
 for(const [slug,data]of Object.entries(maps)){const nodes=new Map(data.nodes.map(n=>[n.id,n]));const groups=data.route.pulls.length?data.route.pulls.map(ids=>ids.map(id=>nodes.get(id))):[...Map.groupBy(data.nodes,n=>`${n.floor}:${n.group}`).values()];for(const members of groups){count++;const intel=buildMdtPullIntel(members,[],{reviewed:combat[slug]},'ru');for(const s of playerSpecs)for(const mode of ['on','off']){const chosen=selection(s.id,mode),tasks=pullRoleTasks(intel,s.role,s,chosen);assert(intel.mechanics.filter(m=>m.role===s.role||m.role==='all').every(m=>tasks.mechanics.includes(m)));for(const m of tasks.mechanics){assert(m.role===s.role||m.role==='all'||canHelpWithMechanic(s,m,chosen));for(const o of toolsForMechanic(s,m,chosen))assert(o.talents.every(t=>chosen.has(t.id)));}}}}
 assert.equal(count,161);
});


test("57 independently published live exports decode to their source specialization", () => {
  const references = read("./talentImport.references.json");
  assert.equal(references.exports.length, 57);
  for (const entry of references.exports) {
    const decoded = decodeMythicTalentImport(entry.code);
    assert.equal(decoded.ok, true, entry.source);
    assert.equal(decoded.specId, entry.specId, entry.source);
  }
});
