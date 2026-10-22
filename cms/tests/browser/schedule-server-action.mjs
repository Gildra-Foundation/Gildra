import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright-core');const out=process.env.CMS_QA_DIR,q=JSON.parse(await fs.readFile(out+'/qa.json')),f=JSON.parse(await fs.readFile(out+'/fixture.json')),action=JSON.parse(await fs.readFile(out+'/qa-native-action.json'));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH,args:['--host-resolver-rules=MAP mail.gildra.net '+q.browser_ip]});const tokens={},results=[];
async function api(path,user,method='GET',data){const r=await fetch(q.origins.cms+path,{method,headers:{...(user?{authorization:'JWT '+tokens[user]}:{}),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const body=await r.json().catch(()=>({}));return {status:r.status,body};}
try{
 for(const user of ['owner','gildra_editor','gildra_admin','gildra_author','riftden_editor']){const r=await api('/api/admins/login',null,'POST',{email:f.users[user].email,password:'local-test-password-1'});assert.equal(r.status,200);tokens[user]=r.body.token;}
 for(const [actor,canCancel]of [['gildra_author',false],['riftden_editor',false],['gildra_editor',true],['gildra_admin',true],['owner',true]]){
  const created=await api('/api/payload-jobs','owner','POST',{taskSlug:'schedulePublish',queue:'default',waitUntil:new Date(Date.now()+86400000).toISOString(),input:{type:'publish',doc:{relationTo:'guides',value:String(f.articles.gildra_author_draft)},user:{relationTo:'admins',value:f.users.gildra_editor.id}}});assert.equal(created.status,201);const id=(created.body.doc??created.body).id;assert(id);
  const c=await browser.newContext();await c.addCookies([{name:'payload-token',value:tokens[actor],url:q.browser_origin,httpOnly:true,secure:true},{name:'payload-lng',value:'en',url:q.browser_origin}]);
  const p=await c.newPage();try{
   await p.goto(q.browser_origin+'/admin/articles');
   const status=await p.evaluate(async({path,key,id})=>{const r=await fetch(path,{method:'POST',headers:{'Next-Action':key,'Content-Type':'text/plain;charset=UTF-8','Accept':'text/x-component'},body:JSON.stringify([{name:'schedule-publish',args:{deleteID:id}}])});await r.text();return r.status;},{path:action.path,key:action.nextAction,id});
   const job=await api('/api/payload-jobs/'+id,'owner');assert.equal(job.status===200,!canCancel,actor+' cannot bypass scheduler boundaries');if(canCancel)assert.equal(status,200,actor+' legitimate action');else assert(status>=400,actor+' action refuses cancellation');
   results.push({actor,canCancel,nextActionStatus:status,jobRetained:job.status===200,passed:true});console.log('PASS native schedule action '+actor+': '+(canCancel?'local cancellation permitted':'cancellation denied'));
   if(!canCancel)assert.equal((await api('/api/payload-jobs/'+id,'owner','DELETE')).status,200);
  }finally{await c.close();}
 }
 await fs.writeFile(out+'/browser-schedule-action.json',JSON.stringify({at:new Date().toISOString(),passed:true,results},null,2)+'\n');
}finally{await browser.close();}
