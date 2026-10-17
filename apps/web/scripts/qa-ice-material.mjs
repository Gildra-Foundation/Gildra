import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const base=process.env.BASE_URL||'http://127.0.0.1:5187';
const output=path.resolve(import.meta.dirname,'../.artifacts/site-theme');fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const results=[];
try {
 for(const width of [390,1440,2560]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'});
  await context.addInitScript(()=>{
   if(window!==window.top)return;
   localStorage.setItem('gildra-home-music',JSON.stringify({enabled:false,confirmed:true,volume:0}));localStorage.setItem('gildra-consent','declined');
   // Only the QA pace changes. A fake page clock cannot drive an independent
   // worker clock. Extend phases so screenshots cannot skip a phase on slow CI.
   const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){
    if(message?.type==='play')message={...message,phases:message.phases.map(p=>({...p,duration:p.phase==='freezing'?3000:p.phase==='cracking'?1500:1600}))};
    return send.call(this,message,...rest);
   };
   const schedule=window.setTimeout;window.setTimeout=(fn,delay,...args)=>schedule(fn,delay===920?2000:delay,...args);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/',{waitUntil:'load'});await page.locator('[data-book-route-frame][data-view-transitions]').waitFor();await page.evaluate(()=>document.fonts.ready);
  const navigate=href=>page.evaluate(href=>{const a=document.createElement('a');a.href=href;document.body.append(a);a.click()},href);
  const painted=async(phase,minimum=0)=>{
   const handle=await page.waitForFunction(({phase,minimum})=>{const c=document.querySelector('[data-ice-surface]');return c?.dataset.renderPhase===phase&&Number(c.dataset.renderProgress)>=minimum ? {phase:c.dataset.renderPhase,progress:Number(c.dataset.renderProgress),renderer:c.dataset.renderer}:false},{phase,minimum},{timeout:12000});
   const state=await handle.jsonValue();await handle.dispose();assert.equal(state.renderer,'worker');return state;
  };
  const shot=name=>page.screenshot({path:path.join(output,`ice-${width}-${name}.png`)});
  await navigate('/privacy');const early=await painted('freezing',.12);await shot('early');
  assert.equal(await page.locator('[data-transition-snapshot]').count(),1);assert.equal(await page.locator('[data-ice-surface]').count(),1);
  const nodes=await page.locator('[data-themed-transition] *').count();assert.ok(nodes<700);
  const late=await painted('freezing',.55);assert.ok(late.progress>early.progress+.2);await shot('late');
  await painted('cracking',.25);await shot('cracks');await painted('shattering',.15);await shot('shatter');
  await page.waitForFunction(()=>!document.querySelector('[data-themed-transition][data-phase]'),null,{timeout:10000});
  assert.equal(await page.locator('[data-themed-transition] *').count(),0);
  await navigate('/login');await page.waitForURL(base+'/login');await page.locator('[data-book-route-frame][data-route-state="idle"]').waitFor();await page.keyboard.press('Escape');
  await page.waitForTimeout(250);assert.equal(await page.locator('[data-themed-transition]').getAttribute('data-phase'),null);assert.deepEqual(errors,[]);
  results.push({width,early,late,nodes,errors});await context.close();console.log(`Ice integration passed: ${width}px, independent worker phases, one snapshot, cancellation and cleanup.`);
 }
 fs.writeFileSync(path.join(output,'ice-material.json'),JSON.stringify(results,null,2));
}finally{await browser.close()}
