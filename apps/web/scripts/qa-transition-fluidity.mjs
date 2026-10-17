import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.BASE_URL||'https://gildra.net',label=process.env.FLUIDITY_LABEL||'baseline';
const out=path.resolve(import.meta.dirname,'../.artifacts/transition-fluidity',label);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--site-per-process']});
const profiles=[{name:'desktop',width:1440,cpu:1},{name:'mobile',width:390,cpu:4}].filter(p=>(process.env.FLUIDITY_PROFILES||'desktop,mobile').split(',').includes(p.name));
const phases=(process.env.FLUIDITY_PHASES||'freezing,shattering').split(','),runs=Number(process.env.FLUIDITY_RUNS||3),results=[];
try {
 for(const profile of profiles)for(const phase of phases)for(let run=0;run<runs;run++) {
  const context=await browser.newContext({viewport:{width:profile.width,height:900},reducedMotion:'no-preference'});
  await context.addInitScript(phase=>{
   if(window!==window.top)return;
   localStorage.setItem('gildra-consent','declined');localStorage.setItem('gildra-home-music',JSON.stringify({enabled:false,confirmed:true,volume:0}));
   window.__iceFrames=[];window.__iceMessages={};window.__stall=null;
   const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);this.addEventListener('message',({data})=>{
    if(data.type!=='qa-frame')return;window.__iceFrames.push(data);
    if(!window.__stall&&data.phase===phase&&data.progress>=.12){
     const from=performance.timeOrigin+performance.now(),start=performance.now();while(performance.now()-start<330){Math.sqrt(performance.now());}
     window.__stall={from,to:performance.timeOrigin+performance.now()};
    }
   });}postMessage(message,...rest){const m=window.__iceMessages;if(message?.type)m[message.type]=(m[message.type]||0)+1;return super.postMessage(message,...rest);}};
  },phase);
  // Real renderer, unchanged except frame timestamps. Worker epoch timestamps
  // distinguish actual paint stalls from delayed delivery to a busy parent.
  await context.route('**/assets/motion/ice-renderer-v*.js',async route=>{
   const response=await route.fetch(),source=await response.text();
   await route.fulfill({response,body:source+'\nconst qaDraw=draw;draw=function(message){const before=performance.now();qaDraw(message);postMessage({type:"qa-frame",id:message.id,phase:message.phase,progress:message.progress,epoch:performance.timeOrigin+performance.now(),cost:performance.now()-before});};'});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu});
  await page.goto(base+'/ru/wow/raids',{waitUntil:'load'});await page.locator('[data-book-route-frame][data-view-transitions]').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1500);
  const clickMs=await page.evaluate(()=>{const a=document.createElement('a');a.href='/ru/privacy';document.body.append(a);const start=performance.now();a.click();return performance.now()-start;});
  await page.waitForFunction(()=>window.__stall,null,{timeout:15000});
  await page.waitForFunction(()=>!document.querySelector('[data-themed-transition][data-phase]'),null,{timeout:15000});await page.waitForTimeout(50);
  const data=await page.evaluate(()=>({stall:window.__stall,frames:window.__iceFrames,messages:window.__iceMessages}));
  const during=data.frames.filter(f=>f.epoch>data.stall.from+20&&f.epoch<data.stall.to-20);
  const gaps=data.frames.slice(1).map((f,i)=>({from:data.frames[i].epoch,to:f.epoch,ms:f.epoch-data.frames[i].epoch})).filter(g=>g.from<data.stall.to&&g.to>data.stall.from);
  const row={base,label,profile,phase,run,clickMs,...data,framesDuringParentStall:during.length,maxWorkerGapDuringStall:Math.max(0,...gaps.map(g=>g.ms)),errors};
  row.passed=during.length>=5&&row.maxWorkerGapDuringStall<120&&!errors.length;results.push(row);
  console.log(JSON.stringify({profile:profile.name,phase,run,framesDuringParentStall:row.framesDuringParentStall,maxWorkerGapDuringStall:Math.round(row.maxWorkerGapDuringStall),messages:data.messages,passed:row.passed}));await context.close();
 }
 assert.ok(results.every(r=>r.passed),'ice must keep painting through a 330ms UI-thread stall, including during shattering');
}finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({base,label,browser:browser.version(),method:'Instrumented real worker frames, CPU1 desktop/parentCPU4 mobile, 330ms busy UI task. QA routing disables HTTP cache equally. No FPS/field INP claim.',passed:results.length===profiles.length*phases.length*runs&&results.every(r=>r.passed),results},null,2));await browser.close();}
