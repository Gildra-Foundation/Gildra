import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const origin=process.env.BOOK_NAVIGATION_ORIGIN ?? 'http://127.0.0.1:5173';
const errors=[];
const attach=async(page)=>{
  page.on('pageerror',e=>errors.push(e.stack));
  await page.addInitScript(()=>{
    window.bookQA={id:Math.random(),events:[]};
    let last='';
    new MutationObserver(()=>{
      const scene=document.querySelector('[data-book-route-scene]');
      const state=scene ? [scene.dataset.bookRouteScene,scene.dataset.bookRoutePhase].join(':') : 'idle';
      if(state!==last){ window.bookQA.events.push(state); last=state; }
    }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-book-route-scene','data-book-route-phase']});
  });
};
const idle=page=>page.waitForFunction(()=>document.querySelector('[data-book-navigation="idle"]') && !document.querySelector('[data-book-route-scene]'),null,{timeout:20000});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await attach(page);
  await page.goto(origin+'/ru/privacy',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('[data-book-route-scene="open"][data-book-route-phase="playing"]').waitFor();
  await page.screenshot({path:'/tmp/gildra-book-opening-playing.png'});
  await idle(page);
  const docId=await page.evaluate(()=>window.bookQA.id);
  const oldAssets=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>/\/assets\/wow\/loading\//.test(x.name)).map(x=>x.name));
  assert.equal(oldAssets.length,0,'Old artwork must not load for navigation');
  await page.locator('a[href="/privacy"]').first().click();
  await page.locator('[data-book-route-scene="turn"]').waitFor();
  await page.locator('[data-book-route-scene="turn"][data-book-route-phase="playing"]').waitFor();
  await page.screenshot({path:'/tmp/gildra-book-turn-desktop.png'});
  await idle(page);
  assert.equal(new URL(page.url()).pathname,'/privacy');
  assert.equal(await page.evaluate(()=>window.bookQA.id),docId,'Plain internal language link must preserve the book shell');
  await page.goBack();
  await idle(page);
  assert.equal(new URL(page.url()).pathname,'/ru/privacy');
  await page.goForward();
  await idle(page);
  assert.equal(new URL(page.url()).pathname,'/privacy');
  const beforeFilter=await page.evaluate(()=>window.bookQA.events.length);
  await page.evaluate(()=>{const a=document.createElement('a');a.href='?filter=example#chapter';document.body.append(a);a.click();a.remove();});
  await page.waitForURL(origin+'/privacy?filter=example#chapter');
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.bookQA.id),docId,'Query links must preserve the shell and page state');
  assert.equal(await page.evaluate(()=>window.bookQA.events.length),beforeFilter,'Filters and anchors must not restart the book');
  await page.keyboard.press('Escape');

  let release; const hold=new Promise(resolve=>release=resolve); let blocked=false;
  await page.route('**/ru/search?**',async route=>{
    if(route.request().headers()['rsc']==='1'){ blocked=true; await hold; }
    await route.continue();
  });
  await page.evaluate(()=>{const a=document.createElement('a');a.href='/ru/search?bookqa=slow';a.textContent='QA navigation';document.body.append(a);a.click();a.remove();});
  await page.locator('[data-book-route-scene="turn"][data-book-route-phase="waiting"]').waitFor();
  await page.waitForTimeout(1500);
  assert.equal(blocked,true,'The test must intercept an actual route request');
  assert.equal(await page.locator('[data-book-route-scene]').getAttribute('data-book-route-phase'),'waiting','A slow route must not be dismissed by a fake timer');
  release();
  await idle(page);
  assert.equal(new URL(page.url()).pathname,'/ru/search');
  console.log('DESKTOP',await page.evaluate(()=>window.bookQA.events));
  const beforeProfile=await page.evaluate(()=>window.bookQA.events.length);
  await page.evaluate(()=>{const a=document.createElement('a');a.href='/wow/characters/eu--eversong--%D1%8D%D0%BB%D0%BA%D0%B0%D1%80%D0%B4%D0%B8%D1%8F';document.body.append(a);a.click();a.remove();});
  await page.waitForURL(origin+'/login',{timeout:60000});
  await idle(page);
  const profileEvents=await page.evaluate(start=>window.bookQA.events.slice(start),beforeProfile);
  assert.ok(profileEvents.includes('turn:waiting'));
  assert.equal(profileEvents.filter(x=>x==='turn:waiting').length,1,'Auth redirects must share one page turn');
  assert.equal(profileEvents.some(x=>x.startsWith('open:')),false,'A real profile/auth redirect must not restart the opening');
  console.log('REAL PROFILE AUTH REDIRECT',profileEvents);

  const mobile=await browser.newPage({viewport:{width:390,height:844}});
  await attach(mobile);
  await mobile.goto(origin+'/ru/privacy',{waitUntil:'domcontentloaded'});
  await idle(mobile);
  await mobile.locator('a[href="/privacy"]').first().click();
  await mobile.locator('[data-book-route-scene="turn"][data-book-route-phase="playing"]').waitFor();
  await mobile.screenshot({path:'/tmp/gildra-book-turn-mobile.png'});
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Book transition must fit narrow screens');
  await idle(mobile);
  console.log('MOBILE',await mobile.evaluate(()=>window.bookQA.events));

  const reduced=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await attach(reduced);
  await reduced.goto(origin+'/ru/privacy',{waitUntil:'domcontentloaded'});
  await idle(reduced);
  await reduced.locator('a[href="/privacy"]').first().click();
  await reduced.waitForURL(origin+'/privacy');
  await idle(reduced);
  assert.equal(await reduced.locator('[data-book-route-scene]').count(),0);
  assert.equal(await reduced.evaluate(()=>window.bookQA.events.includes('turn:waiting')||window.bookQA.events.includes('turn:playing')),false);
  console.log('REDUCED MOTION',await reduced.evaluate(()=>window.bookQA.events));
  assert.deepEqual(errors,[]);
  console.log('PASS: first opening, persistent RU/EN navigation, history, query/hash stability, slow route, mobile layout, reduced motion, and no browser errors.');
} finally { await browser.close(); }
