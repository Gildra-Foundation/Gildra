import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import ts from "typescript";
import { PNG } from "pngjs";
import { chromium } from "playwright";
import { iceFracture } from "../components/motion/iceFracture.ts";

const output=path.resolve(import.meta.dirname,"../.artifacts/site-performance/renderer");fs.mkdirSync(output,{recursive:true});
const code=ts.transpileModule(fs.readFileSync(path.resolve(import.meta.dirname,"../components/motion/iceMaterial.ts"),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/^export /gm,"");
const worker=fs.readFileSync(path.resolve(import.meta.dirname,"../public/assets/motion/ice-renderer-v4.js"));
const server=http.createServer((req,res)=>{res.setHeader("Content-Type",req.url.includes(".js") ? "application/javascript" : "text/html");res.end(req.url.includes(".js") ? worker : '<!doctype html><body style="margin:0;background:#000"></body>')});
await new Promise(resolve=>server.listen(5188,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:["--no-sandbox"]});
const results=[];
try {
 for(const width of [390,1440,2560]) {
  const page=await browser.newPage({viewport:{width,height:900}}), errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.clock.install();
  await page.goto("http://127.0.0.1:5188");
  await page.addScriptTag({content:code+"\nwindow.__createIce=iceMaterial;"});
  await page.evaluate(({width,geometry})=>{window.__material=window.__createIce(width,900,geometry);const c=window.__material.canvas;c.style.cssText="display:block;width:100vw;height:100vh";document.body.append(c);}, {width,geometry:iceFracture(width,900)});
  const frame=async(phase,progress,name)=>{
   await page.evaluate(({phase,progress})=>window.__material.draw(phase,progress),{phase,progress});
   await page.waitForFunction(({phase,progress})=>{const c=document.querySelector("canvas");return c?.dataset.renderPhase===phase && Number(c.dataset.renderProgress)===progress;},{phase,progress});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const png=await page.screenshot({path:path.join(output,`${width}-${name}.png`)}), decoded=PNG.sync.read(png);
   const light=(x,y)=>{const i=(Math.round(y*(decoded.height-1))*decoded.width+Math.round(x*(decoded.width-1)))*4;return decoded.data[i]+decoded.data[i+1]+decoded.data[i+2]};
   let covered=0;for(let i=0;i<decoded.data.length;i+=4)if(decoded.data[i]+decoded.data[i+1]+decoded.data[i+2]>60)covered++;
   return {covered:covered/(decoded.width*decoded.height),edge:light(.02,.5),centre:light(.5,.5)};
  };
  const early=await frame("freezing",.24,"early"), late=await frame("freezing",.73,"late");
  assert.ok(early.edge>early.centre);assert.ok(late.covered>early.covered+.2);
  await frame("cracking",1,"cracks");await frame("shattering",.45,"shatter");
  // A burst of frames is coalesced, and cancellation rejects late worker replies.
  await page.evaluate(()=>{for(let i=0;i<=100;i++)window.__material.draw("shattering",i/100)});
  await page.waitForFunction(()=>document.querySelector("canvas")?.dataset.renderProgress==="1");
  await page.evaluate(()=>{window.__material.dispose();document.querySelector("canvas").remove()});
  await page.waitForTimeout(50);assert.equal(await page.locator("canvas").count(),0);
  await page.clock.fastForward(60001);
  for(let i=0;i<100 && page.workers().length;i++) await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(page.workers().length,0,"idle worker must terminate");
  assert.deepEqual(errors,[]);results.push({width,early,late,errors});await page.close();
  console.log(`Worker renderer passed: ${width}px; progressive frost, fracture/shatter frames, coalescing and disposal.`);
 }
 // Constrained browsers keep an inexpensive fallback and never prevent routing.
 const p=await browser.newPage();await p.goto("http://127.0.0.1:5188");await p.evaluate(()=>{window.Worker=undefined});await p.addScriptTag({content:code+"\nwindow.__createIce=iceMaterial;"});
 await p.evaluate(geometry=>{const m=window.__createIce(390,900,geometry);document.body.append(m.canvas);m.draw("cracking",1);m.draw("shattering",.5);m.dispose()},iceFracture(390,900));
 assert.equal(await p.locator("canvas").getAttribute("data-render-phase"),"shattering");await p.close();
 const blocked=await browser.newPage(),blockedErrors=[];blocked.on("pageerror",e=>blockedErrors.push(e.message));
 await blocked.route("**/ice-renderer-v4.js",route=>route.abort());await blocked.goto("http://127.0.0.1:5188");await blocked.addScriptTag({content:code+"\nwindow.__createIce=iceMaterial;"});
 await blocked.evaluate(geometry=>{window.__material=window.__createIce(390,900,geometry);document.body.append(window.__material.canvas);window.__material.draw("freezing",.5)},iceFracture(390,900));
 await blocked.waitForFunction(()=>document.querySelector("canvas")?.dataset.renderer==="fallback");
 assert.equal(await blocked.locator("canvas").getAttribute("data-render-phase"),"freezing");assert.deepEqual(blockedErrors,[]);await blocked.evaluate(()=>window.__material.dispose());await blocked.close();
 fs.writeFileSync(path.join(output,"result.json"),JSON.stringify({passed:true,results,fallback:true,blockedWorkerFallback:true,idleWorkerTermination:true},null,2));
} finally {await browser.close();server.close()}
