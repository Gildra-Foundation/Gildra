import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { playerCatalogue, playerSpecs, playerClasses, parsePlayerProfile, toolsForMechanic, canHelpWithMechanic } from '../../components/wow/mythic/playerTools.ts';
import { pullRoleTasks } from '../../components/wow/mythic/pullRole.ts';
import { buildMdtPullIntel } from '../../components/wow/mythic/mdtPullIntel.ts';
import { talentSpecThemes } from '../../lib/talentSpecThemes.ts';
const maps=JSON.parse(fs.readFileSync(new URL('../../data/wow/mythic-reviews/mdt.json',import.meta.url)));
const combat=JSON.parse(fs.readFileSync(new URL('../../data/wow/mythic-reviews/combat.json',import.meta.url)));
const spec=id=>playerSpecs.find(s=>s.id===id);
const mechanic=(action,spellId,role='healer')=>({name:'Source spell',source:'Enemy',action,spellId,role});
const ids=(id,action,spell)=>toolsForMechanic(spec(id),mechanic(action,spell)).map(x=>x.spell.id);

test('all40playable specs have valid class identity, role and personal defensive options',()=>{
 assert.equal(playerSpecs.length,40);assert.equal(playerClasses.length,13);
 assert.deepEqual(playerSpecs.map(s=>s.id).sort(),talentSpecThemes.map(s=>s.specId).sort());
 for(const s of playerSpecs){const t=talentSpecThemes.find(t=>t.specId===s.id);assert.equal(s.classId,t.classId);assert.equal(s.role,['tank','healer'].includes(t.role)?t.role:'dps');assert(s.defend.length);}
});
test('profile rejects corrupt, foreign-class, unknown and string IDs without preserving stale spec',()=>{
 for(const bad of ['',null,'{',JSON.stringify({classId:999,specId:62}),JSON.stringify({classId:'8',specId:62})])assert.deepEqual(parsePlayerProfile(bad),{classId:null,specId:null});
 assert.deepEqual(parsePlayerProfile('{"classId":8,"specId":62}'),{classId:8,specId:62});
 assert.deepEqual(parsePlayerProfile('{"classId":8,"specId":65}'),{classId:8,specId:null});
});
test('Midnight healer kick removals are respected; restoration shaman retains Wind Shear',()=>{
 for(const id of [65,105,1468,270,256,257])assert.deepEqual(ids(id,'Кик',1),[],String(id));
 assert.deepEqual(ids(264,'Кик',1),[57994]);assert.deepEqual(ids(1480,'Кик',1),[183752]);assert.deepEqual(ids(258,'Кик',1),[15487]);
 assert.deepEqual(ids(266,'Кик',1),[89766]);assert.deepEqual(ids(265,'Кик',1),[19647]);
});
test('curse, poison, friendly magic and enemy enrage are never treated as interchangeable',()=>{
 assert.deepEqual(ids(62,'Диспел',1217973),[475]);assert.deepEqual(ids(62,'Диспел',373693),[]);
 assert.deepEqual(ids(257,'Диспел',1308148),[]);assert.deepEqual(ids(65,'Диспел',1308148),[4987]);
 assert.deepEqual(ids(62,'Пурж',1310319),[]);assert.deepEqual(ids(102,'Пурж',1310319),[2908]);assert.deepEqual(ids(253,'Пурж',1310319),[19801]);
 assert.deepEqual(ids(102,'Пурж',269935),[]);assert.deepEqual(ids(253,'Пурж',269935),[19801]);
 assert.deepEqual(ids(65,'Диспел',999999),[]);assert.equal(canHelpWithMechanic(spec(65),mechanic('Диспел',999999)),false);
 assert.deepEqual(ids(70,'Диспел',1305234),[1044]);assert.deepEqual(ids(70,'Диспел',373693),[]);
});
test('improved dispels and pet/form/limited defensives retain their requirements',()=>{
 assert(toolsForMechanic(spec(65),mechanic('Диспел',1308148))[0].talents.some(t=>t.id===393024));
 assert(toolsForMechanic(spec(105),mechanic('Диспел',1217973))[0].talents.some(t=>t.id===392378));
 assert(toolsForMechanic(spec(265),mechanic('Диспел',373693))[0].note.en.includes('Imp'));
 assert(toolsForMechanic(spec(265),mechanic('Кик',1))[0].note.en.includes('Felhunter'));
 assert(toolsForMechanic(spec(103),mechanic('Кик',1))[0].note.en.includes('Form'));
 assert(toolsForMechanic(spec(259),mechanic('Защита',1))[0].note.en.includes('area damage'));
 assert(toolsForMechanic(spec(62),mechanic('Пурж',269935))[0].note.en.includes('stealable'));
});
test('tank interrupts and damage-dealer curse removal supplement default role assignments only when supported',()=>{
 const intel={mechanics:[mechanic('Кик',1305209,'dps'),mechanic('Диспел',1217973),mechanic('Диспел',373693)],enemies:[],roleNotes:{tank:[],healer:[],dps:[]}};const before=JSON.stringify(intel);
 assert.equal(pullRoleTasks(intel,'tank',spec(73)).mechanics.length,1);
 assert(pullRoleTasks(intel,'dps',spec(62)).mechanics.some(a=>a.spellId===1217973));
 assert(!pullRoleTasks(intel,'dps',spec(62)).mechanics.some(a=>a.spellId===373693));
 assert(!pullRoleTasks(intel,'healer',spec(65)).mechanics.some(a=>a.action==='Кик'));
 assert.equal(JSON.stringify(intel),before);
});
test('all player spell references have localized ID-bound names, source links and local icons; no passive button recommendations',()=>{
 const forbidden=new Set([1261562,374348,1243287,383013]);
 for(const s of playerSpecs)for(const kind of ['interrupt','stop','dispel','purge','defend'])for(const option of s[kind]){
  assert(!forbidden.has(option.spellId));for(const id of [option.spellId,option.talentSpellId,option.extraEffects?.talentSpellId].filter(Boolean)){
   const spell=playerCatalogue.spells[id];assert(spell);assert(!/[A-Za-z]/.test(spell.name.ru),spell.name.ru);assert(spell.source.endsWith('='+id));assert(fs.existsSync(new URL('../../public'+spell.iconUrl,import.meta.url)),spell.iconUrl);
  }
 }
});
test('all dungeon groups preserve own/shared tasks for all40specs and add only supported utility duties',()=>{
 let count=0;
 for(const [slug,data]of Object.entries(maps)){
  const nodes=new Map(data.nodes.map(n=>[n.id,n]));const groups=data.route.pulls.length?data.route.pulls.map(ids=>ids.map(id=>nodes.get(id))):[...Map.groupBy(data.nodes,n=>`${n.floor}:${n.group}`).values()];
  for(const group of groups){count++;const intel=buildMdtPullIntel(group,[],{reviewed:combat[slug]},'ru');
   for(const s of playerSpecs){const tasks=pullRoleTasks(intel,s.role,s);assert(intel.mechanics.filter(a=>a.role===s.role||a.role==='all').every(a=>tasks.mechanics.includes(a)));assert(tasks.mechanics.every(a=>a.role===s.role||a.role==='all'||canHelpWithMechanic(s,a)));}
   for(const a of intel.mechanics.filter(a=>['Диспел','Пурж'].includes(a.action)))assert(playerCatalogue.mechanicEffects[a.spellId],a.name);
  }
 }assert.equal(count,161);
});
