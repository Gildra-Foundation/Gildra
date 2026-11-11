import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const base=process.env.TALENTS_BASE_URL??'http://127.0.0.1:3159';
const out=process.env.TALENTS_QA_OUT??'/tmp/forever-platform-20261111/TALENTS/qa';mkdirSync(out,{recursive:true});
const data=JSON.parse(readFileSync(new URL('../../data/wow/forever/talents/trees.json',import.meta.url),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME??'/home/debian/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const failures=[],results=[];const check=(v,m)=>{if(!v)failures.push(m)};
try {
 for(const width of (process.env.TALENTS_EXTRAS_ONLY ? [] : [1440,390,320])) for(const lang of ['en','ru']) {
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<600,isMobile:width<600,reducedMotion:'reduce'});
  await context.addInitScript(()=>localStorage.setItem('gildra-consent','declined'));
  for(const cls of data.classes) {
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const prefix=`${cls.slug}-${lang}-${width}`,url=`${base}${lang==='ru'?'/ru':''}/wow/forever/talent-calc/${cls.slug}`;
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:180000});check(response.status()===200,`${prefix}:HTTP`);
   const calc=page.locator('[data-forever-calculator]:visible');await calc.waitFor({timeout:120000});
   await page.evaluate(()=>document.fonts.ready);
   if(width<1180)await page.getByRole('tab').first().waitFor();
   const first=calc.locator(`[data-node="${cls.trees[0].nodes[0].id}"]`);
   await first.scrollIntoViewIfNeeded();
   if(width<600){await first.tap();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByRole('button',{name:lang==='ru'?'Добавить ранг':'Add rank',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:lang==='ru'?'Закрыть':'Close',exact:true}).click();}
   else await first.click();
   await page.waitForFunction(()=>document.querySelector('[data-points-left]')?.textContent==='50');
   check(await first.getAttribute('data-rank')==='1',`${prefix}:spend`);
   const shared=page.url();check(shared.includes('build=1.'),`${prefix}:share`);
   await page.reload({waitUntil:'domcontentloaded'});await calc.waitFor();
   await page.waitForFunction(()=>document.querySelector('[data-points-left]')?.textContent==='50');
   check(await first.getAttribute('data-rank')==='1',`${prefix}:reload`);
   await calc.getByRole('button',{name:lang==='ru'?'Сбросить':'Reset',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-points-left]')?.textContent==='51');
   await calc.getByRole('button',{name:lang==='ru'?'Отменить':'Undo',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-points-left]')?.textContent==='50');
   if(width<1180){await page.getByRole('tab').nth(2).click();check(await page.locator(`[data-node="${cls.trees[2].nodes[0].id}"]`).isVisible(),`${prefix}:tree-tab`);await page.getByRole('tab').first().click();}
   else {
    await first.focus();await page.keyboard.press('ArrowRight');check((await page.evaluate(()=>document.activeElement?.getAttribute('data-node')))!==String(cls.trees[0].nodes[0].id),`${prefix}:roving`);
    await page.keyboard.press('PageDown');check(await page.evaluate(()=>document.activeElement?.closest('section')?.id)===`tree-${cls.trees[1].name.en.toLowerCase().replaceAll(' ','-')}`,`${prefix}:page-down`);
    await first.focus();await page.keyboard.press('-');await page.waitForFunction(()=>document.querySelector('[data-points-left]')?.textContent==='51');
   }
   await calc.scrollIntoViewIfNeeded();
   const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,broken:[...document.querySelectorAll('[data-forever-calculator] img')].filter(i=>i.getBoundingClientRect().width&&i.complete&&!i.naturalWidth).map(i=>i.src),small:[...document.querySelectorAll('[data-node]')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().width<44).length}));
   check(!geometry.overflow,`${prefix}:overflow`);check(!geometry.broken.length,`${prefix}:icons`);check(!geometry.small,`${prefix}:touch-target`);check(!errors.length,`${prefix}:pageerrors ${errors.join(';')}`);
   await page.screenshot({path:`${out}/${prefix}.png`,fullPage:true});
   if(['warrior','priest','druid'].includes(cls.slug)) {
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(async()=>{const r=await axe.run('[data-forever-calculator]',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))});check(!axe.length,`${prefix}:axe ${JSON.stringify(axe)}`);
   }
   results.push({class:cls.slug,lang,width,status:response.status(),geometry,errors});console.log(prefix,'checked');await page.close();
  }
  await context.close();
 }
 // Index geometry and all nine edition-aware class destinations.
 for(const width of [1440,390,320]) for(const lang of ['en','ru']) {
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  await page.goto(`${base}${lang==='ru'?'/ru':''}/wow/forever/talent-calc`,{waitUntil:'networkidle'});
  for(const cls of data.classes) check(await page.locator(`a[href="${lang==='ru'?'/ru':''}/wow/forever/talent-calc/${cls.slug}"]`).count()>0,`index:${lang}:${cls.slug}`);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`index:${lang}:${width}:overflow`);
  await page.screenshot({path:`${out}/index-${lang}-${width}.png`,fullPage:true});await page.close();
 }
 // Tablet, clipboard, level constraint, Legacy, Back and forced-colors.
 const tablet=await browser.newContext({viewport:{width:768,height:1024},permissions:['clipboard-read','clipboard-write']});
 const tp=await tablet.newPage();await tp.goto(`${base}/wow/forever/talent-calc/warrior`,{waitUntil:'networkidle'});
 await tp.locator('[data-forever-calculator]:visible [data-node]').first().click();
 await tp.waitForFunction(()=>document.querySelector('[data-points-left]')?.textContent==='50');
 await tp.locator('#forever-level').selectOption('1');check(await tp.locator('#forever-level').inputValue()==='60','level lowering refused');
 await tp.getByRole('button',{name:'Copy link',exact:true}).click();
 check((await tp.evaluate(()=>navigator.clipboard.readText()))===tp.url(),'clipboard roundtrip');
 await tp.getByRole('button',{name:'Reset',exact:true}).click();await tp.locator('#forever-level').selectOption('5');await tp.locator('#forever-legacy').selectOption('5');
 check(await tp.locator('[data-points-left]').textContent()==='1','Legacy first point at level5');
 await tp.evaluate(()=>{history.pushState({},'',location.pathname+'?build=garbage');dispatchEvent(new PopStateEvent('popstate'))});await tp.getByRole('alert').filter({hasText:'This build link'}).waitFor();
 await tp.goBack();await tp.waitForFunction(()=>document.querySelector('[data-points-left]')?.textContent==='1');
 await tp.emulateMedia({forcedColors:'active'});await tp.locator('[data-forever-calculator]:visible [data-node]').first().focus();
 check(await tp.evaluate(()=>document.activeElement?.matches('[data-node]')),'forced colors keyboard focus');
 check(await tp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'tablet overflow');
 await tp.screenshot({path:`${out}/tablet-forced-colors.png`,fullPage:true});await tablet.close();
 // Malformed, wrong-class, obsolete dataset, repeated parameters, unknown class.
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 for(const token of ['garbage&build=garbage', 'garbage',`1.wrong.warrior.60.0.${'0'.repeat(53)}`,`1.${data.snapshot}.mage.60.0.${'0'.repeat(53)}`]) {
  await page.goto(`${base}/wow/forever/talent-calc/warrior?build=${token}`);await page.getByRole('alert').filter({hasText:/build/i}).waitFor();check(await page.locator('[data-points-left]').textContent()==='51','invalid URL safely empty');
 }
 const unknown=await page.goto(`${base}/wow/forever/talent-calc/monk`);check(unknown.status()===404,'unknown class404');
 await page.close();
} catch(e){failures.push(String(e.stack??e))}finally{await browser.close();writeFileSync(`${out}/report.json`,JSON.stringify({results,failures},null,2));console.log(JSON.stringify({cases:results.length,failures},null,2));if(failures.length)process.exitCode=1;}
