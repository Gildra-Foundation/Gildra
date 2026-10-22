import assert from 'node:assert/strict';
import {startStand,launchOptions,loadChromium,PASSWORD} from './stand.mjs';
const stand=await startStand({name:'schedule_browser',fixture:'publication-fixture.ts'}),q=stand.qa,f=stand.fixture;
const browser=await (await loadChromium()).launch(launchOptions());const tokens={},results=[];
async function api(path,user,method='GET',data){const r=await fetch(q.origins.cms+path,{method,headers:{...(user?{authorization:'JWT '+tokens[user]}:{}),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const body=await r.json().catch(()=>({}));return {status:r.status,body};}
// Payload routes every server function through one Next server action; its id is
// build-specific, so observe it from a real edit page instead of hard-coding it.
async function discoverAction(){
 const c=await browser.newContext();await c.addCookies([{name:'payload-token',value:tokens.owner,url:q.browser_origin,httpOnly:true,secure:true},{name:'payload-lng',value:'en',url:q.browser_origin}]);
 const p=await c.newPage();let found;p.on('request',r=>{const key=r.headers()['next-action'];if(key&&!found)found={path:new URL(r.url()).pathname,nextAction:key};});
 try{await p.goto(q.browser_origin+'/admin/collections/guides/'+f.articles.gildra_author_draft+'?locale=en');await p.locator('input[name=title]').waitFor();
  for(let n=0;n<40&&!found;n++){await p.locator('input[name=title]').fill('Discover action '+n);await p.waitForTimeout(250);}
 }finally{await c.close();}
 assert(found,'No Next server action observed on the edit page');return found;
}
try{
 for(const user of ['owner','gildra_editor','gildra_admin','gildra_author','riftden_editor']){const r=await api('/api/admins/login',null,'POST',{email:f.users[user].email,password:PASSWORD});assert.equal(r.status,200);tokens[user]=r.body.token;}
 const action=await discoverAction();
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
 console.log(JSON.stringify({passed:results.length,failed:0}));
}finally{await browser.close();await stand.stop();}
