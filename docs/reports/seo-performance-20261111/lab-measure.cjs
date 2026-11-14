const fs=require('fs'); const os=require('os');
const pathModule=require('path');
const root=process.env.SEO_REPO||pathModule.resolve(__dirname,'../../..');
const {chromium}=require(root+'/node_modules/playwright-core');
const labDir=process.env.SEO_LAB_DIR||'/tmp/seo-performance-20261111/lab';
fs.mkdirSync(labDir,{recursive:true});
const vitals=fs.readFileSync(root+'/node_modules/next/dist/compiled/web-vitals/web-vitals.js','utf8');
const args=process.argv.slice(2), label=args[0]||'baseline', origin=args[1]||'https://wowarcana.com';
const paths=process.env.PERF_PATHS?JSON.parse(process.env.PERF_PATHS):['/','/wow/raids/the-voidspire','/wow/map','/library','/wow/auction','/wow/forever/dungeons/scholomance'];
const runs=Number(process.env.PERF_RUNS||3), out=labDir+'/'+label+'.json';
(async()=>{
if(label==='diagnostic'){
 const cp=require('child_process');
 const result=cp.spawnSync(process.execPath,['--experimental-strip-types','--no-warnings','--import','./tests/atlas/resolve.mjs','--test','tests/analytics/plausible.test.ts','tests/analytics/tracking.test.ts','tests/atlas/seo.test.ts','tests/atlas/seoRoutes.test.ts','tests/atlas/foreverDungeonSeo.test.ts'],{cwd:root+'/apps/web',encoding:'utf8'});
 fs.writeFileSync(labDir+'/tests.tap',result.stdout+result.stderr);
 console.log('source tests exit',result.status);if(result.status!==0)throw new Error('Source tests failed; see tests.tap');
}
const browser=await chromium.launch({executablePath:process.env.SEO_CHROMIUM||'/home/debian/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
for(const profile of ['mobile','desktop'])for(let run=1;run<=runs;run++)for(const path of paths){
 const loadBefore=os.loadavg(); const context=await browser.newContext({viewport:profile==='mobile'?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:1,isMobile:profile==='mobile',hasTouch:profile==='mobile',reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/stats/api/event',r=>r.abort());
 await context.addInitScript({content:`(()=>{const module={exports:{}};${vitals};window.__lab={metrics:{},longtasks:[]};for(const name of ['LCP','CLS','INP','TTFB','FCP'])module.exports['on'+name]?.(m=>window.__lab.metrics[name]={value:m.value,rating:m.rating,entries:m.entries.map(e=>({startTime:e.startTime,duration:e.duration,url:e.url,element:e.element?.outerHTML?.slice(0,600)}))},{reportAllChanges:true});try{new PerformanceObserver(l=>window.__lab.longtasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true})}catch{}})();`});
 const page=await context.newPage(); const cdp=await context.newCDPSession(page);
 await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile==='mobile'?4:1});
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:profile==='mobile'?150:20,downloadThroughput:(profile==='mobile'?1.6:10)*1024*1024/8,uploadThroughput:750*1024/8});
 const net=[];cdp.on('Network.loadingFinished',e=>net.push(e.encodedDataLength));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let row={label,origin,path,profile,run,browser:browser.version(),loadBefore};
 try{
  const response=await page.goto(origin+path,{waitUntil:'load',timeout:90000});
  await page.waitForTimeout(3000);
  const data=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {metrics:window.__lab?.metrics,lcp:performance.getEntriesByType('largest-contentful-paint').map(e=>({start:e.startTime,url:e.url})),nav:{ttfb:n.responseStart,dom:n.domContentLoadedEventEnd,load:n.loadEventEnd},resources:performance.getEntriesByType('resource').map(e=>({name:e.name,type:e.initiatorType,transfer:e.transferSize,encoded:e.encodedBodySize,duration:e.duration,start:e.startTime,responseEnd:e.responseEnd})),longtasks:window.__lab?.longtasks,title:document.title,canonical:document.querySelector('link[rel=canonical]')?.href,overflow:document.documentElement.scrollWidth>innerWidth}});
  row={...row,status:response.status(),...data};
  await page.screenshot({path:labDir+'/'+label+'-'+profile+'-'+path.replace(/\W/g,'_')+'-'+run+'.png'});
  row.navigationNetworkBytes=net.reduce((a,b)=>a+b,0);
  try {
   if(path.includes('/wow/map')) { await page.getByRole('button',{name:'Zoom in',exact:true}).click({timeout:8000}); row.scenario='map zoom'; }
   else if(path.includes('/wow/auction')) { await page.locator('#auction-find').pressSequentially('linen',{delay:80,timeout:8000});row.scenario='auction item search'; }
   else if(path==='/library') { await page.locator('#library-search-input').pressSequentially('druid',{delay:80,timeout:8000});row.scenario='library search suggestions'; }
   else { await page.keyboard.press('Tab');row.scenario='keyboard focus'; }
   await page.waitForTimeout(1000);
   row.interaction=await page.evaluate(()=>window.__lab?.metrics.INP||null);
  } catch(e) { row.interactionError=e.message; }

 }catch(e){row.error=e.message;}
 row.networkBytes=net.reduce((a,b)=>a+b,0);row.errors=errors;row.loadAfter=os.loadavg();results.push(row);
 fs.writeFileSync(out,JSON.stringify(results,null,2));console.log(JSON.stringify({path,profile,run,status:row.status,metrics:row.metrics,bytes:row.networkBytes,error:row.error}));await context.close();
}
}finally{await browser.close()}
})();
