import { createLocalReq, docAccessOperation, type Payload } from "payload";
import { secureSchedulePublish as schedulePublishHandler, secureUpcomingScheduledPublish } from "../src/jobs/scheduleActions";
import { beforeAll, afterAll, it, expect } from "vitest";
import { as, bootPayload, lexical, makeStaff } from "./helpers/payload";
let payload:Payload;
let g:number,r:number,author:Awaited<ReturnType<typeof makeStaff>>,editor:Awaited<ReturnType<typeof makeStaff>>,foreign:Awaited<ReturnType<typeof makeStaff>>;
beforeAll(async()=>{
 ({payload}=await bootPayload("scheduling_access"));const sites=(await payload.find({collection:"sites",overrideAccess:true})).docs;g=sites.find(s=>s.slug==="gildra")!.id;r=sites.find(s=>s.slug==="riftden")!.id;
 await makeStaff(payload,{email:"owner@schedule.test",owner:true});
 editor=await makeStaff(payload,{email:"editor@schedule.test",sites:[{site:g,role:"editor"}]});
 author=await makeStaff(payload,{email:"author@schedule.test",sites:[{site:g,role:"author"}]});
 foreign=await makeStaff(payload,{email:"foreign@schedule.test",sites:[{site:r,role:"editor"}]});
});
afterAll(async()=>{await payload?.db.destroy?.();});
it("refuses cancelling a publication schedule without publishing rights on its site",async()=>{
 for(const actor of [author,foreign]){
  const doc=await payload.create({collection:"guides",draft:true,...as(editor),data:{site:g,slug:"schedule-"+actor.id,title:"Scheduled",summary:"Summary",content:lexical("Body")}});
  const job=await payload.jobs.queue({task:"schedulePublish",input:{type:"publish",doc:{relationTo:"guides",value:String(doc.id)},user:{relationTo:"admins",value:editor.id}} as never,waitUntil:new Date(Date.now()+86400000)});
  const req=await createLocalReq({user:actor as never},payload);
  try{await schedulePublishHandler({deleteID:job.id,req} as never);}catch{/* denial is the expected outcome */}
  expect((await payload.count({collection:"payload-jobs",where:{id:{equals:job.id}},overrideAccess:true})).totalDocs).toBe(1);
 }
});

it("lets local publishers create and cancel only their own site's schedule",async()=>{
 const doc=await payload.create({collection:"guides",draft:true,...as(editor),data:{site:g,slug:"local-schedule",title:"Local schedule",summary:"Summary",content:lexical("Body")}});
 const req=await createLocalReq({user:editor as never},payload);
 await schedulePublishHandler({doc:{relationTo:"guides",value:String(doc.id)},type:"publish",date:new Date(Date.now()+86400000),req} as never);
 const jobs=(await payload.find({collection:"payload-jobs",where:{taskSlug:{equals:"schedulePublish"}},overrideAccess:true,limit:100})).docs;
 const job=jobs.find(j=>String((j.input as {doc?:{value?:string|number}}).doc?.value)===String(doc.id))!;expect(job).toBeTruthy();
 await expect(secureUpcomingScheduledPublish({collectionSlug:"guides",id:doc.id,req:await createLocalReq({user:author as never},payload)} as never)).rejects.toThrow();
 await schedulePublishHandler({deleteID:job.id,req} as never);
 expect((await payload.count({collection:"payload-jobs",where:{id:{equals:job.id}},overrideAccess:true})).totalDocs).toBe(0);
});
it("keeps the original schedule when a replacement request is invalid",async()=>{
 const doc=await payload.create({collection:"guides",draft:true,...as(editor),data:{site:g,slug:"atomic-schedule",title:"Atomic schedule",summary:"Summary",content:lexical("Body")}});
 const job=await payload.jobs.queue({task:"schedulePublish",input:{type:"publish",doc:{relationTo:"guides",value:String(doc.id)},user:{relationTo:"admins",value:editor.id}} as never,waitUntil:new Date(Date.now()+86400000)});
 await expect(schedulePublishHandler({deleteID:job.id,doc:{relationTo:"guides",value:String(doc.id)},type:"publish",date:new Date("invalid"),req:await createLocalReq({user:editor as never},payload)} as never)).rejects.toThrow();
 expect((await payload.count({collection:"payload-jobs",where:{id:{equals:job.id}},overrideAccess:true})).totalDocs).toBe(1);
});

for(const site of ["gildra","riftden"])it(`${site}: scheduled publishing runs exactly once through the guarded action`,async()=>{
 const actor=site==="gildra"?editor:foreign,siteID=site==="gildra"?g:r;
 const doc=await payload.create({collection:"guides",draft:true,...as(actor),data:{site:siteID,slug:"due-"+site,title:"Due",summary:"Summary",content:lexical("Due body")}});
 await schedulePublishHandler({doc:{relationTo:"guides",value:String(doc.id)},type:"publish",date:new Date(Date.now()-1000),req:await createLocalReq({user:actor as never},payload)} as never);
 await payload.jobs.run({queue:"default"});
 expect((await payload.findByID({collection:"guides",id:doc.id,overrideAccess:true}))._status).toBe("published");
 const before=(await payload.countVersions({collection:"guides",where:{parent:{equals:doc.id}},overrideAccess:true})).totalDocs;
 await payload.jobs.run({queue:"default"});await payload.jobs.run({queue:"default"});
 expect((await payload.countVersions({collection:"guides",where:{parent:{equals:doc.id}},overrideAccess:true})).totalDocs).toBe(before);
});

it("native publish permissions keep an author in draft editing",async()=>{
 const doc=await payload.create({collection:"guides",draft:true,...as(author),data:{site:g,slug:"author-native-permission",title:"Own draft",summary:"Summary",content:lexical("Body")}});
 const req=await createLocalReq({user:author as never},payload);
 const permission=await docAccessOperation({id:doc.id,collection:payload.collections.guides,data:{_status:"published"},req});
 expect(Boolean(permission.update && permission.update.permission)).toBe(false);
 await expect(payload.update({collection:"guides",id:doc.id,...as(author),draft:true,data:{title:"Draft remains editable"}})).resolves.toHaveProperty("title","Draft remains editable");
});
