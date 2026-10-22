import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core');
const out=process.env.CMS_QA_DIR,qa=JSON.parse(await fs.readFile(out+'/qa.json','utf8')),fixture=JSON.parse(await fs.readFile(out+'/fixture.json','utf8'));
const origin=qa.browser_origin,browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--host-resolver-rules=MAP mail.gildra.net '+qa.browser_ip]});const results=[];
const check=async(name,fn)=>{try{await fn();results.push({name,passed:true});console.log('PASS '+name);}catch(e){const error=String(e);results.push({name,passed:false,error});console.log('FAIL '+name+' '+error);}};
try{
for(const site of ['gildra','riftden'])for(const role of ['owner','admin','editor','author','analyst'])await check(`${site}/${role}: browser lists, native form, direct foreign URL`,async()=>{
 const user=role==='owner'?'owner':site+'_'+role;
 const login=await fetch(qa.origins.cms+'/api/admins/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:fixture.users[user].email,password:'local-test-password-1'})});assert.equal(login.status,200);const {token}=await login.json();
 const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'payload-token',value:token,url:origin,httpOnly:true,secure:true,sameSite:'Lax'},{name:'payload-lng',value:'en',url:origin},{name:'payload-tenant',value:String(fixture.sites[site]),url:origin}]);
 const p=await context.newPage(),errors=[];p.setDefaultTimeout(8000);const actions=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.headers()['next-action'])actions.push({url:r.url(),id:r.headers()['next-action'],body:r.postData()});});
 try{
  const r=await p.goto(origin+'/admin/articles?site='+fixture.sites[site]+'&locale=en');assert.equal(r.headers()['x-gildra-publish-qa'],'owned-20261019');await p.getByRole('heading',{name:'Articles',exact:true}).waitFor();
  const workspace=p.locator('.gd-workspace');const visible=await workspace.innerText();const foreign=site==='gildra'?'riftden':'gildra';if(role!=='owner')assert(!visible.includes(foreign+' author draft'));if(role==='analyst')assert(!visible.includes(site+' author draft'));
  await p.goto(origin+'/admin/collections/guides/'+fixture.articles[site+'_author_draft']+'?locale=en');
  if(role==='analyst'){
   await p.waitForFunction(()=>!document.querySelector('input[name=title]')&&document.readyState==='complete');assert.equal(await p.locator('input[name=title]').count(),0);
  }else{
   await p.locator('input[name=title]').waitFor();await p.waitForFunction(()=>{const el=document.querySelector('input[name=title]');return el&&Object.keys(el).some(k=>k.startsWith('__reactProps$'));});
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const publish=p.getByRole('button',{name:/^Publish( changes)?$/i});
   if(role==='author'&&process.env.CMS_QA_ASSERT_PUBLISH_UI==='1')assert.equal(await publish.isEnabled().catch(()=>false),false,'Author has no active Publish control');
   if(['owner','admin','editor'].includes(role))assert.equal(await publish.count(),1);
   if(role==='author'&&site==='gildra'){
    await p.locator('input[name=title]').fill('Gildra author native draft edit '+Date.now());
    await p.locator('input[name=title]').blur();const saved=p.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname==='/api/guides/'+fixture.articles.gildra_author_draft);
    const save=p.getByRole('button',{name:/save draft/i});if(await save.count())await save.click();assert.equal((await saved).status(),200);
   }
  }
  await p.goto(origin+'/admin/collections/guides/'+fixture.articles[foreign+'_author_draft']+'?locale=en');
  if(role==='owner')await p.locator('input[name=title]').waitFor();else{await p.waitForFunction(()=>!document.querySelector('input[name=title]')&&document.readyState==='complete');assert.equal(await p.locator('input[name=title]').count(),0);}
  assert.deepEqual(errors,[]);results.push({name:site+'/'+role+' runtime',passed:true,serverActionsObserved:actions.length});
 }catch(e){console.log('UI diagnostic '+site+'/'+role+': '+(await p.locator('body').innerText()).slice(-600));throw e;}finally{await context.close();}
});
}finally{await browser.close();}
await fs.writeFile(out+'/browser-roles-results.json',JSON.stringify({at:new Date().toISOString(),passed:results.every(r=>r.passed),results},null,2)+'\n');console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length}));if(results.some(r=>!r.passed))process.exitCode=1;
