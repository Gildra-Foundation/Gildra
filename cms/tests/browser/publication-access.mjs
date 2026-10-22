import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {startStand} from './stand.mjs';
const stand=await startStand({name:'publication_browser',fixture:'publication-fixture.ts'}),{qa,fixture}=stand;
const cms=qa.origins.cms,tokens={},results=[];
async function request(base,path,user,method='GET',data){
 const r=await fetch(base+path,{method,headers:{...(user?{authorization:'JWT '+tokens[user]}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(20000)});
 const text=await r.text();let body;try{body=JSON.parse(text);}catch{/* body is not JSON */}return {status:r.status,body,text,headers:r.headers};
}
const api=(p,u,m,d)=>request(cms,p,u,m,d);
const allowed=r=>r.status>=200&&r.status<300;
const id=d=>typeof d==='object'?d?.id:d;
const text=(s)=>({root:{type:'root',version:1,direction:'ltr',format:'',indent:0,children:[{type:'paragraph',version:1,direction:'ltr',format:'',indent:0,textFormat:0,children:[{type:'text',version:1,text:s,detail:0,format:0,mode:'normal',style:''}]}]}});
async function check(name,fn){try{await fn();results.push({name,passed:true});console.log('PASS '+name);}catch(e){const error=String(e).replace(/token=[^\s&]+/g,'token=[redacted]');results.push({name,passed:false,error});console.log('FAIL '+name+' '+error);}}
async function flush(){
 for(let attempt=0;attempt<30;attempt++){
  const r=await api('/api/payload-jobs/run?queue=default&limit=100','owner');assert.equal(r.status,200);
  const jobs=await api('/api/payload-jobs?limit=100','owner');assert.equal(jobs.status,200);
  const failures=jobs.body.docs.filter(j=>j.hasError);assert.deepEqual(failures.map(j=>({task:j.taskSlug,tries:j.totalTried})),[],'No jobs should fail');
  if(!jobs.body.docs.some(j=>j.taskSlug==='revalidateSite'&&!j.completedAt))return;
 }
 throw Error('Notification queue did not drain');
}
async function eventually(fn){let err;for(let n=0;n<20;n++){try{return await fn();}catch(e){err=e;await new Promise(r=>setTimeout(r,150));}}throw err;}
function page(site,locale,slug=''){return site==='gildra'?`${locale==='ru'?'/ru':''}/wow/articles${slug?'/'+slug:''}`:`${locale==='en'?'/en':''}/articles${slug?'/'+slug:''}`;}
function sitemap(site){return site==='gildra'?'/wow/articles/sitemap.xml':'/sitemap.xml';}
function previewToken(site,doc,user){const secret='local-publish-isolated-fixture-only';const claims={c:'guides',id:String(doc),site:String(fixture.sites[site]),uid:String(fixture.users[user].id),exp:Math.floor(Date.now()/1000)+600};const body=Buffer.from(JSON.stringify(claims)).toString('base64url');const key=createHmac('sha256',secret).update('gildra-preview-v1').digest();return body+'.'+createHmac('sha256',key).update(body).digest('base64url');}
for(const [user,u]of Object.entries(fixture.users)){const r=await api('/api/admins/login',undefined,'POST',{email:u.email,password:'local-test-password-1'});assert.equal(r.status,200,user+' login');tokens[user]=r.body.token;}
await check('Initial queued notifications reach both real frontend receivers',flush);
if(!['lifecycle','memberships'].includes(process.env.CMS_QA_PHASE)){
for(const site of ['gildra','riftden'])for(const role of ['owner','admin','editor','author','analyst']){
 const user=role==='owner'?'owner':site+'_'+role,own=fixture.articles[site+'_author_draft'],other=fixture.articles[site+'_editor_draft'];const foreign=site==='gildra'?'riftden':'gildra',foreignID=fixture.articles[foreign+'_editor_draft'];const writer=role!=='analyst',publisher=['owner','admin','editor'].includes(role);
 await check(`${site}/${role}: lists and direct draft access obey site scope`,async()=>{
  const list=await api('/api/admin/articles?site='+fixture.sites[site]+'&locale=en',user);assert.equal(list.status,200);if(!writer)assert(!list.body.rows.some(r=>[String(own),String(other)].includes(r.id)),'Analyst cannot see unpublished draft rows');
  const doc=await api('/api/guides/'+own+'?draft=true&depth=0',user);assert.equal(allowed(doc),writer);
  const cross=await api('/api/guides/'+foreignID+'?draft=true&depth=0',user);assert.equal(allowed(cross),role==='owner');
  const forged=await api('/api/admin/articles?site='+fixture.sites[foreign],user);assert.equal(allowed(forged),role==='owner');
 });
 await check(`${site}/${role}: create, own/other edits and publish`,async()=>{
  const created=await api('/api/guides?draft=true&locale=en',user,'POST',{site:fixture.sites[site],slug:`qa-matrix-${site}-${role}`,title:'Isolated matrix '+role,summary:'Matrix summary',content:text('Matrix body'),_status:'draft'});assert.equal(allowed(created),writer,`create HTTP${created.status}`);
  if(writer){const doc=created.body.doc??created.body;assert(doc.id);const live=await api('/api/guides/'+doc.id+'?locale=en',user,'PATCH',{_status:'published'});assert.equal(allowed(live),publisher,`publish HTTP${live.status}`);}
  const edit=await api('/api/guides/'+own+'?draft=true',user,'PATCH',{summary:'Own matrix '+role});assert.equal(allowed(edit),writer,`own edit HTTP${edit.status}`);
  const editOther=await api('/api/guides/'+other+'?draft=true',user,'PATCH',{summary:'Other matrix '+role});assert.equal(allowed(editOther),publisher,`other edit HTTP${editOther.status}`);
  if(role!=='owner'){const escape=await api('/api/guides?draft=true',user,'POST',{site:fixture.sites[foreign],slug:`qa-escape-${site}-${role}`,title:'Should refuse',summary:'Forbidden',content:text('Forbidden')});assert(!allowed(escape),'foreign site create');}
 });
 await check(`${site}/${role}: staff provisioning and self-escalation`,async()=>{
  const provision=await api('/api/admins',user,'POST',{email:`provision-${site}-${role}@publication.test`,name:'Temporary provision check',password:'local-test-password-1',platformRole:'staff',sites:[]});assert.equal(allowed(provision),role==='owner');
  if(role!=='owner'){
   const self=await api('/api/admins/'+fixture.users[user].id,user,'PATCH',{platformRole:'owner',sites:[{site:fixture.sites[site],role:'admin'},{site:fixture.sites[foreign],role:'admin'}]});assert(allowed(self));
   const actual=await api('/api/admins/'+fixture.users[user].id+'?depth=0','owner');assert.equal(actual.body.platformRole,'staff');assert.equal(actual.body.sites.length,1);assert.equal(actual.body.sites[0].role,role);
   const other=await api('/api/admins/'+fixture.users[foreign+'_editor'].id,user,'PATCH',{name:'Forbidden change'});assert(!allowed(other));
  }
 });
 await check(`${site}/${role}: private fields, readers and job access`,async()=>{
  const staff=await api('/api/admin/users?kind=staff&site='+fixture.sites[site],user);assert.equal(staff.status,200);assert(!/"(hash|salt|sessions|resetPasswordToken|_verificationToken)"\s*:/.test(staff.text));
  if(!['owner','admin','editor'].includes(role))assert.deepEqual(staff.body.rows.map(r=>r.id),[String(fixture.users[user].id)]);
  const readers=await api('/api/admin/users?kind=readers&site='+fixture.sites[site],user);assert.equal(allowed(readers),['owner','admin'].includes(role));
  const run=await api('/api/payload-jobs/run?queue=default',user);assert.equal(allowed(run),role==='owner');
  const jobs=await api('/api/payload-jobs',user);assert.equal(allowed(jobs),publisher);
 });
}
await check('Mixed site roles never allow cross-site publishing or foreign staff details',async()=>{
 for(const [u,editSite,authorSite]of [['mixed','gildra','riftden'],['reverse','riftden','gildra']]){
  const staff=await api('/api/admin/users',u);assert.equal(staff.status,200);assert(!staff.body.rows.some(r=>r.id===String(fixture.users[authorSite+'_editor'].id)));
  const target=await api('/api/guides?draft=true',u,'POST',{site:fixture.sites[authorSite],slug:'qa-mixed-'+u,title:'Mixed own draft',summary:'Summary',content:text('Body')});assert(allowed(target));
  const denied=await api('/api/guides/'+(target.body.doc??target.body).id,u,'PATCH',{_status:'published'});assert(!allowed(denied));
  const editor=await api('/api/guides/'+fixture.articles[editSite+'_editor_draft'],u,'PATCH',{_status:'published'});assert(allowed(editor));
 }
});
}
if(process.env.CMS_QA_PHASE!=='lifecycle'){
await check('Site admins preserve foreign reader memberships and append audit entries',async()=>{
 const target='/api/members/'+fixture.member;let current=(await api(target+'?depth=0','owner')).body;
 for(const site of ['gildra','riftden']){
  const foreign=site==='gildra'?'riftden':'gildra',before=current.memberships.find(m=>String(id(m.site))===String(fixture.sites[foreign]));
  const memberships=current.memberships.map(m=>String(id(m.site))===String(fixture.sites[site])?{...m,status:m.status==='active'?'blocked':'active'}:m);
  const beforeAudit=(await api('/api/audit-log?where[targetId][equals]='+fixture.member+'&where[action][equals]=members.update','owner')).body.docs.map(e=>e.id);
  const changed=await api(target,site+'_admin','PATCH',{memberships});assert(allowed(changed));current=(await api(target+'?depth=0','owner')).body;assert.deepEqual(current.memberships.find(m=>String(id(m.site))===String(fixture.sites[foreign])),before);
  const tamper=await api(target,site+'_admin','PATCH',{memberships:current.memberships.map(m=>String(id(m.site))===String(fixture.sites[foreign])?{...m,status:m.status==='active'?'blocked':'active'}:m)});assert(!allowed(tamper),'Cannot alter foreign status');
  const journal=await api('/api/audit-log?where[targetId][equals]='+fixture.member+'&where[action][equals]=members.update','owner');assert(journal.body.docs.some(e=>!beforeAudit.includes(e.id)&&e.actorId===String(fixture.users[site+'_admin'].id)));
 }
});
}
if(!['roles','memberships'].includes(process.env.CMS_QA_PHASE)){
for(const site of ['gildra','riftden'])await check(`${site}: real cached EN/RU draft, preview, publish, rename and withdrawal lifecycle`,async()=>{
 const editor=site+'_editor',slug='qa-lifecycle-'+site+'-'+Date.now(),foreign=site==='gildra'?'riftden':'gildra';
 const en='QA '+site+' original EN',ru='QA '+site+' исходный RU';
 const created=await api('/api/guides?draft=true&locale=en',editor,'POST',{site:fixture.sites[site],slug,title:en,summary:'QA EN summary',content:text('QA EN body'),_status:'draft'});assert(allowed(created));const doc=(created.body.doc??created.body).id;
 let r=await api('/api/guides/'+doc+'?draft=true&locale=ru',editor,'PATCH',{title:ru,summary:'Описание QA RU',content:text('Содержание QA RU')});assert(allowed(r));
 for(const locale of ['en','ru']){
  r=await api('/api/public/'+site+'/articles/'+slug+'?locale='+locale);assert.equal(r.status,404);
  const token=previewToken(site,doc,editor);r=await api('/api/preview-content?token='+token+'&locale='+locale);assert.equal(r.status,200);assert.equal(r.body.doc.title,locale==='en'?en:ru);
  r=await request(qa.origins[site],(site==='gildra'?(locale==='en'?'/cms-preview':'/ru/cms-preview'):(locale==='en'?'/en/preview':'/preview'))+'?token='+token);assert.equal(r.status,200);assert(r.text.includes(locale==='en'?en:ru),'Site preview renders draft');
  r=await request(qa.origins[site],page(site,locale,slug));assert.equal(r.status,404);
 }
 r=await api('/api/guides/'+doc+'?locale=en',editor,'PATCH',{_status:'published'});assert(allowed(r));await flush();
 for(const locale of ['en','ru'])await eventually(async()=>{const r=await request(qa.origins[site],page(site,locale,slug));assert.equal(r.status,200);assert(r.text.includes(locale==='en'?en:ru));});
 for(const locale of ['en','ru'])await eventually(async()=>{const r=await request(qa.origins[site],page(site,locale));assert.equal(r.status,200);assert(r.text.includes('/'+slug),'Article appears in public listing');});
 await eventually(async()=>{const r=await request(qa.origins[site],sitemap(site));assert.equal(r.status,200);assert(r.text.includes('/'+slug),'New article enters sitemap');});
 for(const locale of ['en','ru']){r=await api('/api/public/'+foreign+'/articles/'+slug+'?locale='+locale);assert.equal(r.status,404);}
 const renamed=slug+'-renamed';r=await api('/api/guides/'+doc+'?draft=true&locale=en',editor,'PATCH',{slug:renamed,title:'QA '+site+' updated EN',summary:'Updated EN summary',content:text('Updated EN body')});assert(allowed(r));
 r=await api('/api/public/'+site+'/articles/'+slug+'?locale=en');assert.equal(r.status,200);assert.equal(r.body.title,en);
 r=await api('/api/public/'+site+'/articles/'+renamed+'?locale=en');assert.equal(r.status,404);
 r=await api('/api/guides/'+doc+'?locale=en',editor,'PATCH',{_status:'published'});assert(allowed(r));await flush();
 r=await request(qa.origins[site],page(site,'en',slug));assert.equal(r.status,404,'Old cached slug must disappear after publishing a renamed draft');
 for(const locale of ['en','ru'])await eventually(async()=>{const r=await request(qa.origins[site],page(site,locale,renamed));assert.equal(r.status,200);assert(r.text.includes(locale==='en'?'QA '+site+' updated EN':ru));});
 await eventually(async()=>{const r=await request(qa.origins[site],sitemap(site));assert(r.text.includes('/'+renamed),'Renamed article enters sitemap');assert(!r.text.includes('/'+slug+'</loc>'),'Old slug removed from sitemap');});
 // Prime one URL, then make two renames before a worker runs: no earlier invalidation may be lost.
 const third=slug+'-third',fourth=slug+'-fourth';for(const value of [third,fourth]){r=await api('/api/guides/'+doc,editor,'PATCH',{slug:value,_status:'published'});assert(allowed(r));}await flush();
 r=await request(qa.origins[site],page(site,'en',renamed));assert.equal(r.status,404,'Rapid renames must invalidate every old public slug');
 r=await request(qa.origins[site],page(site,'en',fourth));assert.equal(r.status,200);
 r=await api('/api/guides/'+doc,editor,'PATCH',{_status:'draft'});assert(allowed(r));await flush();
 for(const locale of ['en','ru']){r=await api('/api/public/'+site+'/articles/'+fourth+'?locale='+locale);assert.equal(r.status,404);r=await request(qa.origins[site],page(site,locale,fourth));assert.equal(r.status,404,'Withdrawn article must disappear from cached page');}
 r=await request(qa.origins[site],sitemap(site));assert(!r.text.includes('/'+fourth),'Withdrawal removed from sitemap');
 for(const locale of ['en','ru']){r=await request(qa.origins[site],page(site,locale));assert(!r.text.includes('/'+fourth),'Withdrawal removed from public listing');}
 r=await api('/api/guides/'+doc,editor,'DELETE');assert(allowed(r));
});
}
await stand.stop();
console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length}));if(results.some(r=>!r.passed))process.exitCode=1;
