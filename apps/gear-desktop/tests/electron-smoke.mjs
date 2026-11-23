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
async function providerLink(label,click){
 for(let n=0;n<120;n++){
   const found=await app.evaluate(async({BrowserWindow},args)=>{
     const host=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='gear://auth/');
     const wc=host?.contentView.children.at(-1)?.webContents;
     if(!wc || !wc.getURL().startsWith('https://eu.'))return false;
     const link=await wc.executeJavaScript("document.querySelector('a')?.textContent");
     if(link!==args.label)return false;
     if(args.click)await wc.executeJavaScript("document.querySelector('a').click()");
     return true;
   },{label,click});
   if(found)return;
   await new Promise(r=>setTimeout(r,150));
 }
 throw Error('Missing provider link '+label);
}
try{
 const page=await app.firstWindow();
 page.setDefaultTimeout(30000);
 page.on('pageerror',e=>console.error('renderer:',e.message));
 await app.evaluate(({session}, {profile,slug})=>{
   const account=session.fromPartition('persist:gildra-account');
   globalThis.testGear={reads:[],cloud:[],pages:[],callbacks:[],authorizations:0,signed:false};
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
     if(path==='/api/auth/signin/battlenet'){
       const flow=++qa.authorizations;
       return Response.json({url:'https://eu.battle.net/oauth/authorize?flow='+flow});
     }
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
   account.protocol.handle('https',req=>{
     const u=new URL(req.url);
     const html=body=>new Response(body,{headers:{'Content-Type':'text/html'}});
     const redirect=location=>new Response(null,{status:302,headers:{Location:location}});
     const oauth='https://eu.battle.net/oauth/authorize';
     const returnTo='https://account.battle.net/overview';
     const registered='https://gildra.net/api/auth/callback/battlenet';
     const canonical='https://wowarcana.com/api/auth/callback/battlenet';
     if(u.origin+u.pathname===oauth){
       if(u.searchParams.get('flow')==='2')return html('<a href="'+registered+'?code=fixture">Approve</a>');
       return redirect('https://eu.account.battle.net/login/en-us/?ref='+encodeURIComponent(oauth+'?state=fixture'));
     }
     if(u.origin==='https://eu.account.battle.net'&&u.pathname==='/login/en-us/'){
       if(u.searchParams.get('ref')!==returnTo)return html('The provided callback URL is invalid.');
       return html('<a href="'+returnTo+'">Continue</a>');
     }
     if(u.origin+u.pathname===registered){qa.callbacks.push(u.origin);return redirect(canonical+u.search);}
     if(u.origin+u.pathname===canonical){qa.callbacks.push(u.origin);qa.signed=true;return redirect('https://wowarcana.com/api/wow/gear-desktop-data?read=session');}
     return new Response(null,{status:404});
   });
 },{profile,slug});
 await page.reload();
 await page.getByRole('button',{name:'Войти через Battle.net'}).waitFor();
 assert.equal(new URL(page.url()).protocol,'gear:');
 const opened=app.waitForEvent('window');
 await page.getByRole('button',{name:'Войти через Battle.net'}).click();
 const login=await opened;
 await login.getByRole('button',{name:'Свернуть'}).waitFor();
 await providerLink('Continue',true);
 await providerLink('Approve',true);
 await page.getByRole('combobox',{name:'Персонаж',exact:true}).waitFor();
 assert.deepEqual(await app.evaluate(()=>globalThis.testGear.callbacks),['https://gildra.net','https://wowarcana.com']);
 await page.getByRole('combobox',{name:'Персонаж',exact:true}).selectOption(slug);
 await page.locator('[data-tool-panel="upgrades"] h3').first().waitFor();
 assert.equal(await page.evaluate(async()=> (await (await fetch('/api/wow/auction-gear-plans?active=1')).json()).hosted),true);
 await page.getByRole('combobox',{name:'Где выполнять расчёт'}).selectOption('local');
 await page.waitForURL('gear://local/**');
 await page.locator('[data-tool-panel="upgrades"] h3').first().waitFor();
 await new Promise(r=>setTimeout(r,500));
 const budget=page.locator('[name="budgetGold"]');
 await budget.fill('7250');
 await page.getByRole('textbox',{name:'Название профиля'}).fill('Рейд');
 await page.getByRole('button',{name:'Сохранить профиль'}).click();
 await budget.fill('4750');
 await page.getByRole('button',{name:'Применить',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[name="budgetGold"]').value==='7250');
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
 await page.evaluate(()=>{
   const fixture=document.createElement('div');
   fixture.dataset.upgradeSlot='HEAD';
   const source=document.createElement('span');source.dataset.source='raid';
   const button=document.createElement('button');button.dataset.overlayItem=JSON.stringify({item:{itemId:7,name:'Fixture Helm',slotType:'HEAD',iconUrl:'/brand.ico'}});
   button.textContent='Fixture Helm';source.append(button);fixture.append(source);
   document.querySelector('[data-tool-panel="upgrades"]').append(fixture);
 });
 await hud.getByRole('button',{name:'Закрепить предмет'}).first().click();
 await hud.getByRole('button',{name:'Редактирую'}).click();
 await hud.locator('.hud-pinned').waitFor();
 assert.ok(await hud.evaluate(()=>innerHeight<=65));

 await page.getByRole('button',{name:'Играю'}).click();
 await hud.getByRole('button',{name:'Редактирую'}).waitFor();
 await hud.locator('.hud-key select').selectOption('Ctrl+Alt+H');
 assert.equal(await hud.evaluate(async()=>(await window.gear.state()).editKey),'Ctrl+Alt+H');
 const opacity=hud.getByRole('slider');
 await opacity.focus();
 await opacity.press('Home');
 await opacity.press('ArrowRight');
 await hud.getByText('21%',{exact:true}).waitFor();
 const savedSettings=JSON.parse(await readFile(join(dir,'settings.json'),'utf8'));
 assert.equal(savedSettings.opacity,21);
 if(process.platform==='win32'){
   const alpha=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('gear://overlay')).getOpacity());
   assert.ok(Math.abs(alpha-.21)<.01,'Window opacity was '+alpha);
 }
 await opacity.press('End');
 const outside=app.waitForEvent('window');
 await app.evaluate(({BrowserWindow})=>{
   const main=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('gear://local'));
   main.minimize();
   const peer=globalThis.gearTestPeer=new BrowserWindow({x:10,y:10,width:220,height:160});
   return peer.loadURL('data:text/html,<button>Outside</button>');
 });
 const peerPage=await outside;
 await peerPage.getByRole('button',{name:'Outside'}).click();
 await app.evaluate(()=>new Promise(r=>setTimeout(r,350)));
 assert.equal(await app.evaluate(({BrowserWindow})=>{
   const overlay=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('gear://overlay'));
   return overlay.isVisible()&&overlay.isAlwaysOnTop()&&!overlay.isMinimized();
 }),true);
 await app.evaluate(()=>globalThis.gearTestPeer.destroy());
 await hud.getByRole('button',{name:'Открыть подбор'}).click();
 // Use separate remote partitions even when the local shell is already authenticated.
 await app.evaluate(({session})=>{
   for(const key of ['browser','telegram','whatsapp']){
     session.fromPartition('persist:gildra-companion-'+key).protocol.handle('https',req=>new Response('<title>fixture</title><a href="/guide">Guide</a>',{headers:{'Content-Type':'text/html'}}));
   }
 });
 await app.evaluate(({session})=>{
   // A real, looping one-second PCM stream makes playback testable without service accounts.
   const wav=Buffer.alloc(44+16000,0);
   wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
   wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);
   wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
   for(let i=0;i<8000;i++)wav.writeInt16LE(Math.round(50*Math.sin(i/12)),44+i*2);
   for(const key of ['youtube','soundcloud','spotify'])session.fromPartition('persist:gildra-companion-'+key).protocol.handle('https',()=>new Response(
     '<title>QA '+key+'</title><audio loop controls src="data:audio/wav;base64,'+wav.toString('base64')+'"></audio>',{headers:{'Content-Type':'text/html'}}));
 });
 const panelOpen=app.waitForEvent('window',{predicate:async w=>{try{await w.waitForURL('gear://panel/**',{timeout:3500});return true;}catch{return false;}}});
 await page.getByRole('button',{name:'Браузер',exact:true}).click();
 const panel=await panelOpen;
 await panel.waitForURL('gear://panel/**');
 const address=panel.getByRole('textbox',{name:'Адрес'});
 await panel.waitForFunction(()=>document.querySelector('form input')?.value==='https://wowarcana.com/ru');
 await panel.getByRole('button',{name:'База предметов'}).click();
 await panel.waitForFunction(()=>document.querySelector('form input').value.endsWith('/ru/library/items'));
 await address.fill('https://example.org/guide');await address.press('Enter');
 await panel.waitForFunction(()=>document.querySelector('form input').value==='https://example.org/guide');
 await panel.getByRole('button',{name:'Telegram',exact:true}).click();
 await panel.waitForFunction(()=>document.querySelector('form input').value.includes('web.telegram.org'));
 await panel.getByRole('button',{name:'WhatsApp',exact:true}).click();
 await panel.waitForFunction(()=>document.querySelector('form input').value.includes('web.whatsapp.com'));
 await panel.getByRole('button',{name:'Браузер',exact:true}).click();
 await panel.waitForFunction(()=>document.querySelector('form input').value==='https://example.org/guide');
 assert.equal(await panel.evaluate(()=>window.gear.action('panel-url','file:///invalid')),false);
 assert.equal(await app.evaluate(async ({BrowserWindow})=>{
   const remote=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='gear://panel/').contentView.children[0].webContents;
   return remote.executeJavaScript("typeof window.gear==='undefined' && typeof require==='undefined'");
 }),true);
 for(const key of ['soundcloud','spotify','youtube']){
   await panel.getByRole('combobox',{name:'Музыка и видео'}).selectOption(key);
   await panel.waitForFunction(key=>document.querySelector('.media-title')?.textContent==='QA '+key,key);
 }
 await panel.getByRole('button',{name:'Воспроизвести',exact:true}).click();
 await panel.getByRole('button',{name:'Пауза',exact:true}).waitFor();
 await panel.getByRole('button',{name:'Telegram',exact:true}).click();
 await panel.getByRole('button',{name:/Скрыть панель/}).click();
 const miniOpened=app.waitForEvent('window');
 await hud.getByRole('button',{name:'Мини-плеер',exact:true}).click();
 const mini=await miniOpened;
 await mini.waitForURL('gear://mini/**');
 await mini.waitForFunction(()=>document.querySelector('input[type=range]')?.disabled===false);
 const media=await mini.evaluate(async()=>{
   const seek=await window.gear.action('mini-seek',{key:'youtube',amount:0.4});
   const volume=await window.gear.action('mini-volume',{key:'youtube',amount:0.35});
   return {position:seek.position,volume:volume.volume};
 });
 assert.ok(Math.abs(media.position-0.4)<0.15);
 assert.ok(Math.abs(media.volume-0.35)<0.01);
 assert.equal(await app.evaluate(({BrowserWindow})=>{
   const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()==='gear://mini/');
   return win.isAlwaysOnTop()&&win.isVisible();
 }),true);
 await mini.getByRole('button',{name:'Закрыть',exact:true}).click();
 await hud.getByRole('button',{name:'Пауза',exact:true}).click();
 await hud.getByRole('button',{name:'Воспроизвести',exact:true}).waitFor();
 await hud.getByRole('button',{name:'Отключить звук'}).click();
 await hud.waitForFunction(()=>document.querySelector('.media-strip [aria-pressed="true"]'));

 await page.getByRole('button',{name:'EN',exact:true}).click();
 await page.getByRole('combobox',{name:'Calculation mode'}).waitFor();
 assert.deepEqual(await app.evaluate(()=>globalThis.testGear.pages),[]);
 await app.evaluate(()=>{globalThis.testGear.signed=false;});
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.getByRole('button',{name:'Sign in with Battle.net'}).waitFor();
 const reopened=app.waitForEvent('window');
 await page.getByRole('button',{name:'Sign in with Battle.net'}).click();
 await (await reopened).getByRole('button',{name:'Close'}).waitFor();
 await providerLink('Continue',false);
 console.log(JSON.stringify({electron:await app.evaluate(()=>process.versions.electron),...baseline,alwaysTop,sitePages:0,cloudSubmissionsInLocalMode:0}));
} finally { await app.close(); }
