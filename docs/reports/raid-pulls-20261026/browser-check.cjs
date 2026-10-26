const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cases = [['the-voidspire',7],['the-dreamrift',1],['march-on-queldanas',3],['venomous-abyss',8],['sporefall',1]];
const dir = __dirname;
const base = process.env.RAID_PULL_BASE_URL || 'http://127.0.0.1:3317';
const results=[];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/home/debian/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox']});
 try {
  for(const width of [1440,390]) for(const locale of ['ru','en']) for(const [slug,count] of cases){
   const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce',hasTouch:width<500,isMobile:width<500});
   const errors=[]; page.on('pageerror',error=>errors.push(error.message));
   const response=await page.goto(`${base}/${locale==='ru'?'ru/':''}wow/raids/${slug}`,{waitUntil:'domcontentloaded',timeout:120000});
   assert.equal(response.status(),200);
   const root=page.locator(`[data-raid-pulls="${slug}"]`); await root.waitFor(); await page.evaluate(()=>document.fonts.ready);
   assert.equal(await root.locator('[data-raid-pull-marker]').count(),count);
   const initial=await root.locator('[data-raid-selected]').getAttribute('data-raid-selected');
   for(let i=0;i<count;i++){
    await root.locator(`[data-raid-pull-marker="${i}"]`).click();
    await page.waitForFunction(({slug,i})=>document.querySelector(`[data-raid-pulls="${slug}"] [data-raid-pull-choice="${i}"]`)?.getAttribute('aria-pressed')==='true',{slug,i});
    assert.equal(await root.locator(`[data-raid-pull-marker="${i}"]`).getAttribute('aria-pressed'),'true');
    assert.ok((await root.locator('[data-raid-selected] h3').textContent()).trim());
    assert.ok((await root.locator('[data-raid-selected]').innerText()).includes(locale==='ru'?'Мобы в пуле':'Enemies in this pull'));
   }
   const roleGroup=root.getByRole('radiogroup');
   for(const [name,role] of locale==='ru'?[['Танки','tank'],['Лекари','healer'],['Бойцы','dps']]:[['Tanks','tank'],['Healers','healer'],['Damage','dps']]){
    await roleGroup.getByRole('radio',{name,exact:true}).check();
    assert.equal(await root.locator('[data-raid-role-tasks]').count(),1);
    assert.equal(await root.locator('[data-raid-role-tasks]').getAttribute('data-raid-role-tasks'),role);
   }
   await roleGroup.getByRole('radio',{name:locale==='ru'?'Все роли':'All roles',exact:true}).check();
   assert.equal(await root.locator('[data-raid-role-tasks]').count(),3);
   const hash=await page.evaluate(()=>location.hash); assert.ok(hash.startsWith('#raid-pull='));
   await page.reload({waitUntil:'domcontentloaded'});await root.waitFor();
   await page.waitForFunction(({slug,index})=>document.querySelector(`[data-raid-pulls="${slug}"] [data-raid-pull-marker="${index}"]`)?.getAttribute('aria-pressed')==='true',{slug,index:count-1});
   assert.equal(await root.locator('[data-raid-pull-marker][aria-pressed="true"]').getAttribute('data-raid-pull-marker'),String(count-1));
   const geometry=await root.evaluate(el=>{
    const plane=el.querySelector('[data-raid-map-plane]').getBoundingClientRect();
    const markers=[...el.querySelectorAll('[data-raid-map-plane] button, [data-raid-map-plane] a')].map(x=>x.getBoundingClientRect());
    return {overflow:document.documentElement.scrollWidth-innerWidth,clipped:markers.some(x=>x.left<plane.left-1||x.right>plane.right+1||x.top<plane.top-1||x.bottom>plane.bottom+1),overlap:markers.some((a,i)=>markers.some((b,j)=>i<j&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))};
   });
   assert.ok(geometry.overflow<=1,JSON.stringify(geometry));assert.equal(geometry.clipped,false);assert.equal(geometry.overlap,false);
   assert.deepEqual(errors,[]);
   const broken=await root.locator('img').evaluateAll(images=>images.filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src));assert.deepEqual(broken,[]);
   await root.locator('[data-raid-pull-choice="0"]').click();
   const cookieDecline=page.getByRole('button',{name:locale==='ru'?'Отклонить':'Decline',exact:true});
   if(await cookieDecline.isVisible()) await cookieDecline.click();
   await page.locator('#pulls').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-120,behavior:'instant'}));
   await page.screenshot({path:path.join(dir,`${slug}-${locale}-${width}-final.png`)});
   if(width===390&&locale==='ru'&&slug==='the-voidspire') await root.locator('figure').screenshot({path:path.join(dir,'mobile-map-final.png')});
   if(width===1440&&locale==='ru'&&slug==='the-voidspire'){
    await page.setViewportSize({width,height:1200});
    await root.locator('figure').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-180,behavior:'instant'}));
    await page.screenshot({path:path.join(dir,'preview-desktop.png')});
   }
   results.push({slug,locale,width,pulls:count,geometry,errors,initial});console.log('PASS',slug,locale,width);
   await page.close();
  }
  // Additional layout boundaries and keyboard operation on the trash workspace.
  for(const width of [320,768,1024]){
   const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
   await page.goto(`${base}/ru/wow/raids/the-voidspire`,{waitUntil:'domcontentloaded'});
   const first=page.locator('[data-raid-pull-marker="0"]');await first.focus();await page.keyboard.press('Enter');
   assert.equal(await first.getAttribute('aria-pressed'),'true');
   const geometry=await page.locator('[data-raid-map-plane]').evaluate(el=>{
    const plane=el.getBoundingClientRect();const markers=[...el.querySelectorAll('button,a')].map(x=>x.getBoundingClientRect());
    return {overflow:document.documentElement.scrollWidth-innerWidth,clipped:markers.some(x=>x.left<plane.left-1||x.right>plane.right+1),overlap:markers.some((a,i)=>markers.some((b,j)=>i<j&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))};
   });assert.ok(geometry.overflow<=1);assert.equal(geometry.clipped,false);assert.equal(geometry.overlap,false);
   results.push({width,keyboard:true,geometry});await page.close();
  }
  const themePage=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await themePage.goto(`${base}/ru/wow/raids/the-voidspire`,{waitUntil:'domcontentloaded'});
  await themePage.locator('[data-raid-pulls]').waitFor();
  const accents=[];
  for(const theme of ['arthas','illidan','garek','varok']){
   const tokens=await themePage.locator('[data-raid-pulls]').evaluate((el,theme)=>{document.documentElement.setAttribute('data-site-theme',theme);const css=getComputedStyle(el);return{theme,chrome:css.getPropertyValue('--atlas-accent').trim(),material:css.getPropertyValue('--raid-card-accent').trim()}},theme);
   accents.push(tokens);assert.equal(tokens.material,'#b39ade');
  }
  assert.equal(new Set(accents.map(x=>x.chrome)).size,4);
  await themePage.emulateMedia({forcedColors:'active'});
  assert.equal(await themePage.locator('[data-raid-pull-marker="0"]').evaluate(el=>getComputedStyle(el).borderTopStyle),'solid');
  await themePage.emulateMedia({forcedColors:'none'});
  await themePage.evaluate(()=>document.documentElement.setAttribute('data-transparency','reduced'));
  assert.equal(await themePage.locator('[data-raid-map-plane] img').first().evaluate(el=>getComputedStyle(el).display),'none');
  results.push({themes:accents,forcedColors:true,reducedTransparency:true});await themePage.close();
  fs.writeFileSync(path.join(dir,'browser-results.json'),JSON.stringify({base,results},null,2));
  console.log('PASS total',results.length);
 }finally{await browser.close()}
})().catch(error=>{fs.writeFileSync(path.join(dir,'browser-failure.json'),JSON.stringify({error:error.stack,results},null,2));console.error(error);process.exit(1)});
