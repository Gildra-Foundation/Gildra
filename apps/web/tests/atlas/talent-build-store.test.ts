import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTalentBuildStore } from '../../lib/wow/talentBuildStore.ts';
import { emptyBuildLibrary, parseBuildLibrary, type TalentBuildLibrary, type SavedCharacterBuild } from '../../lib/wow/talentBuildLibrary.ts';
const b = (id: string) => ({ id, name: id, savedAt: '2026-10-19T09:00:00Z', loadout: 'code', buildVersion: 'tree', scenario: 'raid' });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status});
function storage() { const map = new Map<string,string>(); Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {getItem: (k:string) => map.get(k) ?? null, setItem: (k:string,v:string) => map.set(k,v)}}); return map; }
test('navigation does not abandon a save; edits during a request reach the server in order', async () => {
 storage(); let release!: (r:Response)=>void; const writes: Array<{expectedRevision: number; payload: TalentBuildLibrary}> = [];
 globalThis.fetch = async (_url, init) => { if (!init?.method) return json({documents:[]}); const body=JSON.parse(String(init.body)); writes.push(body); if(writes.length===1) return new Promise(r=>{release=r;}); return json({revision:2,payload:body.payload}); };
 const store=makeTalentBuildStore('one','owner','char','spec'); await store.synchronize();
 const unsubscribe=store.subscribe(()=>{}); store.update(parseBuildLibrary([b('a')])); unsubscribe();
 assert.equal(store.getSnapshot().status,'saving'); store.update(parseBuildLibrary([{...b('a'),name:'renamed'},b('b')]));
 release(json({revision:1})); await tick(); await tick();
 assert.equal(writes.length,2); assert.equal(writes[1].expectedRevision,1); assert.equal(writes[1].payload.builds.length,2); assert.equal(store.getSnapshot().status,'synced');
});
test('offline data survives recreation; deletion from another device wins at conflict', async () => {
 const local=storage(); globalThis.fetch=async()=>{throw new Error('offline');};
 const first=makeTalentBuildStore('offline','owner','char','spec'); await first.synchronize(); first.update(parseBuildLibrary([b('a'),b('b')])); await tick();
 assert.equal(first.getSnapshot().status,'offline'); assert.equal(JSON.parse(local.get('offline')!).dirty,true);
 let count=0; const remote={...emptyBuildLibrary(),deleted:{a:'2026-10-19T09:02:00Z'}};
 globalThis.fetch=async(_url,init)=>{ if(!init?.method)return json({documents:[{kind:'talent-builds',revision:1,payload:emptyBuildLibrary()}]}); const body=JSON.parse(String(init.body)); if(count++===0)return json({current:{revision:2,payload:remote}},409); assert.equal(body.expectedRevision,2); assert.deepEqual(body.payload.builds.map((x:SavedCharacterBuild)=>x.id),['b']); return json({revision:3}); };
 const second=makeTalentBuildStore('offline','owner','char','spec'); await second.synchronize();
 assert.equal(second.getSnapshot().status,'synced'); assert.deepEqual(second.getSnapshot().library.builds.map(x=>x.id),['b']);
});
test('account change refuses background writes while preserving the local copy',async()=>{
 const local=storage(); globalThis.fetch=async(_url,init)=>{assert.equal((init?.headers as Record<string,string>)['X-Workspace-Owner'],'old-owner');return json({code:'account_changed'},401);};
 const store=makeTalentBuildStore('account','old-owner','char','spec'); await store.synchronize();store.update(parseBuildLibrary([b('private')]));await tick();
 assert.equal(store.getSnapshot().status,'expired');assert.equal(JSON.parse(local.get('account')!).library.builds[0].id,'private');
});
test('server limit errors retain all local builds and report the actual conflict',async()=>{
 storage(); globalThis.fetch=async(_url,init)=>init?.method ? json({message:'talent build limit reached'},400):json({documents:[]});
 const store=makeTalentBuildStore('limit','owner','char','spec');await store.synchronize();store.update(parseBuildLibrary(Array.from({length:13},(_,i)=>b(String(i)))));await tick();
 assert.equal(store.getSnapshot().status,'limit');assert.equal(store.getSnapshot().library.builds.length,13);
});
test('unavailable browser storage never yields a successful save without server confirmation',async()=>{
 storage();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{throw new Error('quota');}}});globalThis.fetch=async()=>{throw new Error('offline');};
 const store=makeTalentBuildStore('quota','owner','char','spec');await store.synchronize();store.update(parseBuildLibrary([b('a')]));await tick();assert.equal(store.getSnapshot().storageFailed,true);assert.equal(store.getSnapshot().status,'offline');
});
test('date offsets normalize before resolving concurrent edits',()=>{
 const library=parseBuildLibrary([{...b('a'),savedAt:'2026-10-19T12:00:00+03:00'}]);assert.equal(library.builds[0].savedAt,'2026-10-19T09:00:00.000Z');
});
