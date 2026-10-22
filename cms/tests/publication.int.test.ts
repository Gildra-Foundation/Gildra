import type { Payload } from "payload";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { SKIP_REVALIDATION } from "../src/editorial/policy";
import { as, bootPayload, lexical, makeStaff } from "./helpers/payload";
let payload: Payload;
const sites: Record<string, number> = {};
const editors: Record<string, Awaited<ReturnType<typeof makeStaff>>> = {};
beforeAll(async () => {
 ({payload}=await bootPayload("publication"));
 for (const site of (await payload.find({collection:"sites",overrideAccess:true})).docs) sites[site.slug]=site.id;
 await makeStaff(payload,{email:"owner@publication.test",owner:true});
 for(const site of ["gildra","riftden"]) editors[site]=await makeStaff(payload,{email:`${site}@publication.test`,sites:[{site:sites[site],role:"editor"}]});
});
afterAll(async()=>{await payload?.db.destroy?.();});
const pending=async(id:number)=> (await payload.find({collection:"payload-jobs",where:{and:[{taskSlug:{equals:"revalidateSite"}},{"input.docId":{equals:String(id)}}]},overrideAccess:true,depth:0,limit:100,sort:"-createdAt"})).docs;
async function published(site:string,slug:string){return payload.create({collection:"guides",...as(editors[site]),context:{[SKIP_REVALIDATION]:true},data:{site:sites[site],slug,title:slug,summary:"Summary",content:lexical("Body"),_status:"published"}});}
for(const site of ["gildra","riftden"])describe(`${site} publication invalidation`,()=>{
 it("invalidates the real published slug when publishing a renamed draft",async()=>{
  const doc=await published(site,"rename-original");
  await payload.update({collection:"guides",id:doc.id,...as(editors[site]),draft:true,data:{slug:"rename-draft",title:"Changed draft"}});
  expect(await pending(doc.id)).toHaveLength(0);
  await payload.update({collection:"guides",id:doc.id,...as(editors[site]),data:{_status:"published"}});
  const jobs=await pending(doc.id);expect(jobs).toHaveLength(1);
  expect(jobs[0].input).toMatchObject({slug:"rename-draft",previousSlug:"rename-original",action:"change"});
 });
 it("keeps invalidation for every previously published URL across rapid renames",async()=>{
  const doc=await published(site,"burst-first");
  await payload.update({collection:"guides",id:doc.id,...as(editors[site]),data:{slug:"burst-second",_status:"published"}});
  await payload.update({collection:"guides",id:doc.id,...as(editors[site]),data:{slug:"burst-third",_status:"published"}});
  const jobs=await pending(doc.id);const old=jobs.map(j=>(j.input as {previousSlug?:string}).previousSlug);
  expect(old).toContain("burst-first");expect(old).toContain("burst-second");
 });
});
