import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(join(process.env.RUNNER_TEMP || process.cwd(),'driver','driver.cjs'));
const {_electron}=require('playwright-core');
const profile=JSON.parse(await readFile(new URL('fury-profile.json',import.meta.url)));
const slug='eu--synthetic--gildrareleasesmoke';
const dir=await mkdtemp(join(tmpdir(),'gildra-electron-test-'));
const args=['--user-data-dir='+dir];
if(process.platform==='linux')args.push('--no-sandbox');
if(process.argv[3])args.push(resolve(process.argv[3]));
const app=await _electron.launch({executablePath:resolve(process.argv[2]),args,timeout:60000});
try{
 const page=await app.firstWindow();
 page.setDefaultTimeout(30000);
 page.on('pageerror',e=>console.error('renderer:',e.message));
 await app.evaluate(({session}, {profile,slug})=>{
   const account=session.fromPartition('persist:gildra-account');
   globalThis.testGear={reads:[],cloud:[],pages:[],signed:false};
   const qa=globalThis.testGear;
   const char={id:42,name:'GildraReleaseSmoke',level:90,realm:{id:1,slug:'synthetic',name:'Synthetic'},region:'eu',playableClass:{id:1,name:'Warrior'},playableRace:{id:3},faction:{type:'ALLIANCE'},accountId:5};
   const armory={...profile.armory,activeSpecializationId:72,activeTalentLoadout:profile.talentLoadout};
   Object.assign(armory.profile,{id:42,equipped_item_level:270});armory.equipment.character={id:42,realm:{id:1}};
   for(const row of armory.equipment.equipped_items)Object.assign(row,{name:'Fixture '+row.slot.type,level:{value:270}});
   const market={id:'qa-market',region:'eu',connectedRealmId:1,sourceUpdatedAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),offers:[]};
   account.fetch=async (input,init={})=>{
     const u=new URL(input), path=u.pathname,q=u.searchParams;
     if(u.origin!=='https://wowarcana.com'||!path.startsWith('/api/')){qa.pages.push(u.href);return Response.json({},{status:404});}
     if(path==='/api/auth/csrf')return Response.json({csrfToken:'test'});
     if(path==='/api/auth/signin/battlenet')return Response.json({url:'https://eu.battle.net/oauth/authorize'});
     if(!qa.signed)return Response.json({error:'session_expired'},{status:401});
     if(path.endsWith('/roster'))return Response.json({regions:[{region:'eu',status:200,characters:[char]}]});
     if(path.startsWith('/api/wow/characters/'))return Response.json({snapshot:{slug,character:{name:char.name,itemLevel:270},gear:[],specialization:{slug:'fury-warrior'}},fingerprint:'test-fingerprint'});
     if(path.endsWith('gear-desktop-data')){
       const kind=q.get('read');qa.reads.push(kind);
       const data={session:{protocol:1,owner:'3'.repeat(64)},character:char,snapshot:armory,market,equipment:armory.equipment,icon:{assets:[]},prices:{prices:{},sourceUpdatedAt:market.sourceUpdatedAt}}[kind];
       return Response.json(data??{},{status:data?200:404});
     }
     qa.cloud.push([init.method,path]);
     if(path.endsWith('/auction-gear-plans')&&q.has('active'))return Response.json({hosted:true});
     return Response.json({},{status:404});
   };
   account.protocol.handle('https',req=>new Response('<html><h1>Battle.net test</h1></html>',{headers:{'Content-Type':'text/html'}}));
 },{profile,slug});
 await page.reload();
 await page.getByRole('button',{name:'Войти через Battle.net'}).waitFor();
 assert.equal(new URL(page.url()).protocol,'gear:');
 const opened=app.waitForEvent('window');
 await page.getByRole('button',{name:'Войти через Battle.net'}).click();
 const login=await opened;
 await login.waitForURL('https://eu.battle.net/**');
 await app.evaluate(({BrowserWindow})=>{globalThis.testGear.signed=true;const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://eu.battle.net/'));w.close();});
 await page.getByRole('combobox',{name:'Персонаж',exact:true}).selectOption(slug);
 await page.locator('[data-tool-panel="upgrades"] h3').first().waitFor();
 assert.equal(await page.evaluate(async()=> (await (await fetch('/api/wow/auction-gear-plans?active=1')).json()).hosted),true);
 await page.getByRole('combobox',{name:'Где выполнять расчёт'}).selectOption('local');
 await page.waitForURL('gear://local/**');
 await page.locator('[data-tool-panel="upgrades"] h3').first().waitFor();
 await new Promise(r=>setTimeout(r,500));
 const posted=()=>app.evaluate(()=>globalThis.testGear.cloud.filter(([method])=>method==='POST').length);
 const before=await posted();
 const accepted=page.waitForResponse(r=>r.url()==='gear://local/api/wow/gear-farm-plans' && r.request().method()==='POST');
 await page.getByRole('button',{name:'Проверить добычу'}).click();
 const farmResponse=await accepted;
 assert.equal(farmResponse.status(),202);
 const farmId=(await farmResponse.json()).id;
 const {clientRequestId,...farmScope}=farmResponse.request().postDataJSON();
 const baseline=await page.evaluate(async ({slug,farmId,farmScope})=>{
   const send=async(path,body)=>{const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const job=await r.json();if(!r.ok)throw Error(JSON.stringify(job));return job;};
   const finish=async(base,job,scope={})=>{
     for(let i=0;i<140;i++){
       const j=await send(base+'?'+new URLSearchParams({...scope,id:job.id}));
       if(j.status==='completed')return j.result;
       if(!['queued','running'].includes(j.status))throw Error(JSON.stringify(j));
       await new Promise(r=>setTimeout(r,650));
     } throw Error('Timed out');
   };
   const auction='/api/wow/auction-gear-plans';
   const result=await finish(auction,await send(auction,{characterSlug:slug,budgetGold:'1000',selectedSlots:['HEAD'],locale:'en',scenario:'single-target',fightLengthSeconds:30}));
   const farm=await finish('/api/wow/gear-farm-plans',{id:farmId},farmScope);
   return {baseline:result.baseline,activities:farm.activities.length};
 },{slug,farmId,farmScope});
 assert.ok(baseline.baseline.dps>0&&baseline.baseline.engine.includes('18428cd')&&baseline.activities>0,JSON.stringify(baseline));
 assert.equal(await posted(),before);
 const openedHud=app.waitForEvent('window');
 await page.getByRole('button',{name:'Оверлей',exact:true}).click();
 const hud=await openedHud;
 await hud.waitForURL('gear://overlay/**');
 await hud.getByText('GildraReleaseSmoke',{exact:true}).waitFor();
 const alwaysTop=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('gear://overlay')).isAlwaysOnTop());
 assert.equal(alwaysTop,true);
 await hud.getByRole('button',{name:'Открыть подбор'}).click();
 await page.getByRole('button',{name:'EN',exact:true}).click();
 await page.getByRole('combobox',{name:'Calculation mode'}).waitFor();
 assert.deepEqual(await app.evaluate(()=>globalThis.testGear.pages),[]);
 await app.evaluate(()=>{globalThis.testGear.signed=false;});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByRole('button',{name:'Sign in with Battle.net'}).waitFor();
 const reopened=app.waitForEvent('window');
 await page.getByRole('button',{name:'Sign in with Battle.net'}).click();
 await (await reopened).waitForURL('https://eu.battle.net/**');
 console.log(JSON.stringify({electron:await app.evaluate(()=>process.versions.electron),...baseline,alwaysTop,sitePages:0,cloudSubmissionsInLocalMode:0}));
} finally { await app.close(); }
