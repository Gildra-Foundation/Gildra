import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "https://gildra.net";
const label = process.env.PERF_LABEL || "baseline";
const directory = path.resolve(import.meta.dirname, "../.artifacts/site-performance", label);
fs.mkdirSync(directory, { recursive:true });
const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROMIUM_PATH, args:["--no-sandbox"] });
const profiles = [{ id:"desktop", viewport:{width:1440,height:900}, cpu:1 }, { id:"mobile", viewport:{width:390,height:844}, cpu:4 }];
const results = { base, label, tool:"Playwright + Chrome DevTools Protocol", field:"Unavailable: unauthenticated PSI quota 429; no analytics credentials accessed", profiles:[], loads:[], transitions:[] };
const probe = () => {
  window.__perf = { long:[], lcp:0, cls:0, frames:[], measuring:false, operations:{} };
  for (const type of ["longtask", "largest-contentful-paint", "layout-shift"]) {
    try { new PerformanceObserver(list => { for (const e of list.getEntries()) {
      if (type === "longtask") window.__perf.long.push({ start:e.startTime, duration:e.duration });
      if (type === "largest-contentful-paint") window.__perf.lcp=e.startTime;
      if (type === "layout-shift" && !e.hadRecentInput) window.__perf.cls+=e.value;
    }}).observe({ type, buffered:true }); } catch {}
  }
  // Same lightweight wrappers in baseline and candidate; retain API receivers.
  for (const [prototype, method] of [[Node.prototype,"cloneNode"],[Element.prototype,"getBoundingClientRect"],[HTMLCanvasElement.prototype,"toDataURL"],[CanvasRenderingContext2D.prototype,"drawImage"],[CanvasRenderingContext2D.prototype,"putImageData"]]) {
    const original = prototype[method];
    prototype[method] = function(...args) {
      if (!window.__perf.measuring) return original.apply(this,args);
      const before=performance.now();
      try { return original.apply(this,args); } finally { const record=window.__perf.operations[method] ||= {count:0,ms:0}; record.count++;record.ms+=performance.now()-before; }
    };
  }
};
async function session(profile) {
  const context=await browser.newContext({ viewport:profile.viewport, reducedMotion:"no-preference" });
  await context.addInitScript(() => {
    localStorage.setItem("gildra-consent","declined");
    localStorage.setItem("gildra-home-music",JSON.stringify({confirmed:true,enabled:false,volume:0}));
  });
  await context.addInitScript(probe);
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:profile.cpu});
  if (process.env.PERF_NETWORK !== "off") await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:80,downloadThroughput:4_000_000/8,uploadThroughput:1_000_000/8});
  return {context,page,cdp};
}
try {
  results.browser=browser.version();
  for (const profile of profiles) {
    results.profiles.push({...profile,network:process.env.PERF_NETWORK === "off" ? "host network" : "4Mbps down/1Mbps up, 80ms latency"});
    if (process.env.PERF_TRANSITIONS_ONLY !== "1") for (const route of ["/ru","/ru/wow","/ru/wow/raids","/ru/privacy"]) {
      for (let run=0;run<3;run++) {
        const {context,page}=await session(profile);
        await page.goto(base+route,{waitUntil:"load",timeout:90000});
        await page.waitForTimeout(3500);
        const row=await page.evaluate(() => {
          const p=window.__perf, nav=performance.getEntriesByType("navigation")[0], entries=performance.getEntriesByType("resource");
          const bytes={js:0,css:0,img:0,font:0,total:0};
          for (const e of entries) { const size=e.encodedBodySize; bytes.total+=size;if(/\.js(?:\?|$)/.test(e.name))bytes.js+=size;else if(/\.css(?:\?|$)/.test(e.name))bytes.css+=size;else if(/\.woff2?(?:\?|$)/.test(e.name))bytes.font+=size;else if(/\.(?:avif|webp|png|jpe?g|svg)(?:\?|$)|\/_next\/image/.test(e.name))bytes.img+=size; }
          const animations=document.getAnimations().filter(a=>a.playState==="running");
          return {ttfb:nav.responseStart-nav.startTime,lcp:p.lcp,cls:p.cls,tbt:p.long.reduce((sum,e)=>sum+Math.max(0,e.duration-50),0),maxTask:Math.max(0,...p.long.map(e=>e.duration)),bytes,nodes:document.querySelectorAll("*").length,animations:animations.length,resources:entries.sort((a,b)=>b.encodedBodySize-a.encodedBodySize).slice(0,8).map(e=>({url:e.name,size:e.encodedBodySize,duration:e.duration}))};
        });
        results.loads.push({profile:profile.id,route,run,...row});
        console.log(`Load ${profile.id} ${route} #${run+1}: LCP ${Math.round(row.lcp)}ms, TBT ${Math.round(row.tbt)}ms, ${Math.round(row.bytes.total/1024)}KiB`);
        await context.close();
      }
    }
    for (const route of ["/ru","/ru/wow/raids"]) for(let run=0;run<3;run++) {
      const {context,page,cdp}=await session(profile);
      const errors=[];page.on("pageerror",e=>errors.push(e.message));
      await page.goto(base+route,{waitUntil:"load",timeout:90000});
      await page.locator("[data-book-route-frame][data-view-transitions]").waitFor();
      await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);
      const trace=run===0 && profile.id==="desktop" && route==="/ru";
      if(trace) await cdp.send("Tracing.start",{categories:"devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.cpu_profiler",transferMode:"ReturnAsStream"});
      const before=(await cdp.send("Performance.getMetrics")).metrics;
      await page.evaluate(() => {
        const p=window.__perf;p.measuring=true;p.from=performance.now();p.maxNodes=0;p.maxTransitionNodes=0;p.phases=[];p.raf=[];
        const host=document.querySelector("[data-themed-transition]");
        p.observer=new MutationObserver(()=>p.phases.push({phase:host.dataset.phase,at:performance.now()-p.from}));p.observer.observe(host,{attributes:true,attributeFilter:["data-phase"]});
        const sample=()=>{if(!p.measuring)return;p.raf.push(performance.now());p.maxNodes=Math.max(p.maxNodes,document.querySelectorAll("*").length);p.maxTransitionNodes=Math.max(p.maxTransitionNodes,host.querySelectorAll("*").length);requestAnimationFrame(sample)};requestAnimationFrame(sample);
        const a=document.createElement("a");a.href=location.pathname==="/ru" ? "/ru/privacy" : "/ru/login";document.body.append(a);a.click();p.clickMs=performance.now()-p.from;
      });
      await page.waitForFunction(()=>window.__perf.phases.some(p=>p.phase==="shattering"),null,{timeout:30000});
      await page.waitForFunction(()=>!document.querySelector("[data-themed-transition][data-phase]"),null,{timeout:30000});
      await page.waitForTimeout(100);
      const row=await page.evaluate(()=>{
        const p=window.__perf;p.measuring=false;p.observer.disconnect();const gaps=p.raf.slice(1).map((t,i)=>t-p.raf[i]);const tasks=p.long.filter(e=>e.start>=p.from);return {clickMs:p.clickMs,duration:performance.now()-p.from,maxFrameGap:Math.max(0,...gaps),framesOver50:gaps.filter(g=>g>50).length,tbt:tasks.reduce((s,e)=>s+Math.max(0,e.duration-50),0),maxTask:Math.max(0,...tasks.map(e=>e.duration)),maxNodes:p.maxNodes,maxTransitionNodes:p.maxTransitionNodes,operations:p.operations,phases:p.phases};
      });
      const after=(await cdp.send("Performance.getMetrics")).metrics;
      row.mainThread=Object.fromEntries(after.filter(m=>["TaskDuration","ScriptDuration","LayoutDuration","RecalcStyleDuration","LayoutCount","RecalcStyleCount","JSHeapUsedSize"].includes(m.name)).map(m=>[m.name,m.value-(before.find(b=>b.name===m.name)?.value||0)]));
      if(trace){const complete=new Promise(resolve=>cdp.once("Tracing.tracingComplete",resolve));await cdp.send("Tracing.end");const {stream}=await complete;let chunks="";for(;;){const chunk=await cdp.send("IO.read",{handle:stream});chunks+=chunk.data;if(chunk.eof)break}await cdp.send("IO.close",{handle:stream});fs.writeFileSync(path.join(directory,"transition-trace.json"),chunks)}
      results.transitions.push({profile:profile.id,route,run,...row,errors});
      console.log(`Transition ${profile.id} ${route} #${run+1}: click ${Math.round(row.clickMs)}ms, blocked ${Math.round(row.tbt)}ms, max task ${Math.round(row.maxTask)}ms, nodes ${row.maxTransitionNodes}`);
      await context.close();
    }
  }
} finally { fs.writeFileSync(path.join(directory,"measurements.json"),JSON.stringify(results,null,2));await browser.close(); }
