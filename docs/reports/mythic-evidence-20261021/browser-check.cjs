const {chromium}=require('playwright');
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const dataset=require('../../../apps/web/data/wow/mythic-reviews/mdt.json');
const out=__dirname+'/browser';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});const results=[];
 try{
 for(const locale of ['ru','en']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>{const u=route.request().url();return /^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)?route.continue():route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [slug,data] of Object.entries(dataset)){
   await page.goto(`http://127.0.0.1:5197${locale==='ru'?'/ru':''}/wow/mythic-plus/midnight-season-2/${slug}`,{waitUntil:'domcontentloaded',timeout:120000});
   const reject=page.getByRole('button',{name:locale==='ru'?'Отклонить':'Decline',exact:true});if(await reject.isVisible())await reject.click();
   const map=page.getByTestId('mdt-map');await map.waitFor();if(await reject.isVisible())await reject.click();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.getByTestId('dungeon-source-review').count(),1);
   assert.equal(await map.locator('button[title]').count(),data.nodes.length);
   const status=await map.getByTestId('mdt-route-status').textContent();assert.ok(status.includes(data.route.status==='dataset-matched'?'Tactyks':locale==='ru'?'несовместим':'incompatible'));
   assert.equal(await map.locator('ol > li').count(),data.route.pulls.length||1);
   assert.equal(await page.locator('details').filter({has:page.locator('summary',{hasText:locale==='ru'?'Старый черновой редактор':'Old draft editor'})}).evaluate(el=>el.open),false);
   assert.equal(await map.locator('img').evaluate(img=>img.complete&&img.naturalWidth===1680),true);
   for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${slug}/${locale}/${width} overflow`);
    results.push({slug,locale,width,clones:data.nodes.length,status:data.route.status,passed:true});
   }
   await map.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${slug}-${locale}.png`,fullPage:false});
   if(slug==='ruby-life-pools'){
    const pulls=map.locator('ol > li button');await pulls.nth(1).click();assert.equal(await pulls.nth(1).getAttribute('aria-pressed'),'true');
    await map.getByRole('button',{name:locale==='ru'?'Сбросить план':'Reset plan',exact:true}).click();
    assert.equal(await map.locator('button[data-selected]').count(),0);
    const select=map.locator('label select');const option=select.locator('option').nth(1);const id=await option.getAttribute('value');
    await select.selectOption(id);const node=data.nodes.find(n=>n.id===id);const count=data.nodes.filter(n=>n.group===node.group&&n.floor===node.floor).length;
    assert.equal(await map.locator('button[data-selected]').count(),count);
    await map.getByRole('button',{name:locale==='ru'?'+ Следующий пулл':'+ Next pull',exact:true}).click();
    assert.equal(await map.locator('ol > li').count(),2);
    const downloadPromise=page.waitForEvent('download');await map.getByRole('button',{name:locale==='ru'?'Скачать план JSON':'Download plan JSON',exact:true}).click();const download=await downloadPromise;const location=await download.path();const plan=JSON.parse(fs.readFileSync(location,'utf8'));
    assert.equal(plan.sourceSha256,data.sha256);assert.equal(plan.pulls[0].length,count);
    await map.getByRole('button',{name:locale==='ru'?'Восстановить маршрут автора':'Restore authored route',exact:true}).click();assert.equal(await pulls.count(),14);
   }
   console.log('PASS',locale,slug);
  }
  await page.goto(`http://127.0.0.1:5197${locale==='ru'?'/ru':''}/wow/mythic-plus`,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('#dungeons').waitFor();assert.equal(await page.locator('#dungeons article').count(),8);
  assert.equal(errors.length,0,errors.join('\n'));await context.close();
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log('PASS',results.length,'responsive cases + interactions/export/catalog');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
