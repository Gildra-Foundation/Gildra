const {chromium}=require('playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const base=process.env.FOREVER_QA_BASE||'http://127.0.0.1:3126';
const output=process.env.FOREVER_QA_OUT||'/tmp/forever-platform-20261111/DATA/qa';
fs.mkdirSync(output,{recursive:true});
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:'/home/debian/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
 const results=[];const failures=[];
 const api=base+'/wow/forever/library/data';
 for(const [query,status] of [['?edition=retail',409],['?build=12.1.0',409],['?type=invalid',400],['?type=item&id=-1',400],['?type=item&id=999999999',404],['?type=spell&id=10',200]]){
  const response=await fetch(api+query);if(response.status!==status)failures.push({api:query,expected:status,actual:response.status});
 }
 // Fault injection is restricted to this worktree's own immutable test snapshot.
 const shard=path.resolve('apps/web/data/wow/forever/database/npc/54.json.gz');const saved=shard+'.qa-backup';
 fs.renameSync(shard,saved);
 try {
  const response=await fetch(api+'?type=npc&id=54');if(response.status!==503)failures.push('Missing shard must return503');
  const errorPage=await browser.newPage();await errorPage.goto(base+'/wow/forever/library/npc/54',{waitUntil:'domcontentloaded'});
  await errorPage.getByRole('alert').filter({hasText:'Unable to load the library'}).waitFor({timeout:30000});
  await errorPage.screenshot({caret:'initial',path:path.join(output,'error.png')});await errorPage.close();
 } finally {fs.renameSync(saved,shard);}
 const recovered=await fetch(api+'?type=npc&id=54');if(recovered.status!==200)failures.push('Read retry after restored shard failed');
 for(const lang of ['en','ru']) for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',isMobile:width<500,hasTouch:width<500});
  const page=await context.newPage();page.on('pageerror',e=>failures.push(`${lang}/${width}: ${e.message}`));page.on('console',m=>{if(m.type()==='error' && /hydrat|server rendered/i.test(m.text()))failures.push(`${lang}/${width}: ${m.text()}`);});
  for(const suffix of ['', '?type=spell&q=Blizzard','?type=recipe&category=alchemy','?type=npc','?type=quest','/item/647','/spell/10','/recipe/1245250','/quest/8','/npc/54','?q=not-a-real-record-zzzzzz']){
   const url=base+(lang==='ru'?'/ru':'')+'/wow/forever/library'+suffix;
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
   await page.locator('h1:visible').first().waitFor({timeout:60000});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
   const consent=page.getByRole('button',{name:/^(Decline|Отклонить)$/});if(await consent.isVisible())await consent.click();
   const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,h1:[...document.querySelectorAll('h1')].filter(el=>el.checkVisibility()).length,junk:/build 1\.60|source:|coming soon|retail fallback|normalized|imported/i.test(document.querySelector('main')?.innerText||''),foreign:[...document.querySelectorAll('main a[href]')].map(a=>a.getAttribute('href')).filter(h=>/^\/(ru\/)?library\//.test(h))}));
   const result={lang,width,suffix,status:response.status(),...state};results.push(result);
   if(response.status()!==200||state.overflow||state.h1!==1||state.junk||state.foreign.length)failures.push(result);
   if(['','/spell/10','/item/647'].includes(suffix))await page.screenshot({caret:'initial',path:path.join(output,`${lang}-${width}-${suffix.replaceAll('/','-')||'list'}.png`),fullPage:true});
  }
  await context.close();
 }
 // Keyboard GET submission, paging and empty-state reset work without client data stores.
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
 page.on('pageerror',e=>failures.push(`navigation: ${e.message}`));page.on('console',m=>{if(m.type()==='error' && /hydrat|server rendered/i.test(m.text()))failures.push(`navigation: ${m.text()}`);});
 await page.goto(base+'/wow/forever/library');await page.locator('#library-q').focus();await page.keyboard.press('Tab');if(await page.evaluate(()=>document.activeElement?.id)!=='library-quality')failures.push('filter keyboard focus order failed');await page.locator('#library-q').fill('Shortsword');await page.locator('#library-q').press('Enter');await page.waitForURL(/q=Shortsword/);
 if(!(await page.locator('h3').allTextContents()).some(x=>x.includes('Shortsword')))failures.push('keyboard search failed');
 for(const [prefix,next,previous] of [['','Next','Previous'],['/ru','Далее','Назад']]) {
  await page.goto(base+prefix+'/wow/forever/library');await page.getByRole('link',{name:next,exact:true}).click();await page.waitForURL(/page=2/);await page.getByRole('link',{name:previous,exact:true}).waitFor();
 }
 await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await page.goto(base+'/ru/wow/forever/library/spell/10');
 await page.screenshot({caret:'initial',path:path.join(output,'forced-colors.png'),fullPage:true});
 await context.close();await browser.close();
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({results,failures},null,2));
 console.log(JSON.stringify({cases:results.length,failures},null,2));if(failures.length)process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1});
