import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base=process.env.BASE_URL || "http://127.0.0.1:5187";
const output=path.resolve(import.meta.dirname,"../.artifacts/site-theme");fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:["--no-sandbox"]});
const results=[];
try {
 for(const width of [390,1440,2560]) {
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:"no-preference"});
  await context.addInitScript(()=>{localStorage.setItem("gildra-home-music",JSON.stringify({enabled:false,confirmed:true,volume:0}));localStorage.setItem("gildra-consent","declined");});
  const page=await context.newPage(), errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.clock.install({time:new Date("2026-10-17T10:00:00Z")});
  await page.goto(base+"/");await page.locator("[data-book-route-frame][data-view-transitions]").waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.clock.pauseAt(new Date("2026-10-17T12:00:00Z"));
  const navigate=href=>page.evaluate(href=>{const a=document.createElement("a");a.href=href;document.body.append(a);a.click()},href);
  const painted=async phase=>{
   for(let i=0;i<200;i++) {
    const state=await page.locator("[data-ice-surface]").evaluate(c=>({phase:c.dataset.renderPhase,progress:Number(c.dataset.renderProgress),renderer:c.dataset.renderer}));
    if(state.phase===phase) {assert.equal(state.renderer,"worker");return state;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   throw Error("Worker did not paint "+phase);
  };
  const shot=async name=>{await page.clock.runFor(32);await new Promise(resolve=>setTimeout(resolve,30));await page.screenshot({path:path.join(output,`ice-${width}-${name}.png`)});};
  await navigate("/privacy");await page.clock.runFor(200);const early=await painted("freezing");await shot("early");
  assert.equal(await page.locator("[data-transition-snapshot]").count(),1);
  assert.equal(await page.locator("[data-ice-surface]").count(),1);
  const nodes=await page.locator("[data-themed-transition] *").count();assert.ok(nodes<700,"transition DOM must stay bounded");
  await page.clock.runFor(368);const late=await painted("freezing");
  // An asynchronous worker may have just acknowledged the preceding frame;
  // give its coalesced latest frame time to arrive before comparing progress.
  for(let i=0;i<100 && late.progress<.6;i++){await new Promise(resolve=>setTimeout(resolve,10));Object.assign(late,await painted("freezing"));}
  assert.ok(late.progress>early.progress+.2);await shot("late");
  await page.clock.runFor(240);assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"),"cracking");await painted("cracking");await shot("cracks");
  await page.clock.runFor(700);
  for(let i=0;i<30 && await page.locator("[data-themed-transition]").getAttribute("data-phase")!=="shattering";i++){await new Promise(resolve=>setTimeout(resolve,10));await page.clock.runFor(50);}
  assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"),"shattering");await painted("shattering");await shot("shatter");
  await page.clock.runFor(1000);assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"),null);
  assert.equal(await page.locator("[data-themed-transition] *").count(),0);
  await navigate("/login");await page.clock.runFor(200);await page.keyboard.press("Escape");await page.clock.runFor(1800);
  assert.equal(await page.locator("[data-themed-transition]").getAttribute("data-phase"),null);assert.deepEqual(errors,[]);
  results.push({width,early,late,nodes,errors});await context.close();console.log(`Ice integration passed: ${width}px, worker phases, one snapshot, cancellation and cleanup.`);
 }
 fs.writeFileSync(path.join(output,"ice-material.json"),JSON.stringify(results,null,2));
} finally {await browser.close()}
