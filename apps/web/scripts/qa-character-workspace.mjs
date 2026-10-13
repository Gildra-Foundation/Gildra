import { chromium } from "playwright";

const baseURL=(process.env.CHARACTER_WORKSPACE_BASE_URL??"http://127.0.0.1:5173").replace(/\/$/,"");
const browser=await chromium.launch({headless:true});
const documents=new Map(); const migrations=new Set(); const versions=[]; let migrationRequests=0; const errors=[];
const scopeKey=(url)=>`${url.searchParams.get("character")}:${url.searchParams.get("specialization")}`;
const keyFor=(url,kind)=>`${scopeKey(url)}:${kind}`;
const docsFor=(url)=>[...documents.entries()].filter(([key])=>key.startsWith(`${scopeKey(url)}:`)).map(([,value])=>value);
const waitFor=async(test,message)=>{for(let i=0;i<80;i+=1){if(test())return;await new Promise(r=>setTimeout(r,100));}throw new Error(message);};

async function installRoutes(context){
  await context.route("**/api/wow/workspace**",async route=>{
    const request=route.request(),url=new URL(request.url()),parts=url.pathname.split("/").filter(Boolean),tail=parts.at(-1);
    if(request.method()==="GET")return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({documents:docsFor(url)})});
    const body=request.postDataJSON();
    if(request.method()==="POST"&&tail==="migrate"){
      migrationRequests+=1;const ledger=`${scopeKey(url)}:${body.migrationKey}`;let imported=0;
      if(!migrations.has(ledger)){migrations.add(ledger);for(const incoming of body.documents){const key=keyFor(url,incoming.kind);if(!documents.has(key)){const document={kind:incoming.kind,payload:incoming.payload,revision:1,updatedAt:new Date().toISOString()};documents.set(key,document);versions.push(structuredClone(document));imported+=1;}}}
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({alreadyImported:imported===0,importedDocuments:imported,documents:docsFor(url)})});
    }
    const kind=tail,key=keyFor(url,kind),current=documents.get(key);
    if(request.method()==="PUT"){
      if((current?.revision??0)!==body.expectedRevision)return route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({code:"revision_conflict",current})});
      const document={kind,payload:body.payload,revision:(current?.revision??0)+1,updatedAt:new Date().toISOString()};documents.set(key,document);versions.push(structuredClone(document));
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(document)});
    }
    return route.fulfill({status:405,contentType:"application/json",body:"{}"});
  });
  await context.route("**/api/wow/talent-simulation",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({singleTargetDelta:0,aoeDelta:0,baselineSingleTargetDps:100000,candidateSingleTargetDps:100000,baselineAoeDps:200000,candidateAoeDps:200000,engine:"SimulationCraft QA",iterations:750,encounter:{duration:60,aoeTargets:5},uncertainty:{confidence:95,singleTargetDps:0,singleTargetPercent:0,aoeDps:0,aoePercent:0},statDeltas:{primary:0,crit:0,haste:0,mastery:0,versatility:0}})}));
  await context.route("**/api/wow/gear-candidates",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({candidates:[{entityId:"qa-head",itemId:910001,name:"Корона синхронизации",iconUrl:"https://wow.zamimg.com/images/wow/icons/large/inv_helmet_96.jpg",itemLevel:540,slotType:"HEAD",eligible:true,variants:[{key:"verified",itemLevel:540,bonusIds:[13668]}],source:{type:"encounter",evidence:"catalog",name:"QA boss",location:"The Venomous Abyss"},season:{id:"midnight-season-2",patch:"12.1",status:"current"},constraints:{uniqueEquipped:false,crafted:false,requiredLevel:90},provenance:{build:"12.1.0.69814"}}],rejectedByReason:{}})}));
}

function watch(page){page.on("pageerror",error=>errors.push(String(error)));page.on("console",message=>{const text=message.text();if(message.type()==="error"&&!text.startsWith("Failed to load resource:")&&!text.includes("A tree hydrated"))errors.push(text);});}

const contextOne=await browser.newContext({viewport:{width:1440,height:1050},extraHTTPHeaders:{"x-gildra-qa-mode":"battle-net-evidence"}});await installRoutes(contextOne);
await contextOne.addInitScript(()=>{try{localStorage.setItem("gildra:gear-owned:furybar",JSON.stringify([910001]));localStorage.setItem("gildra:rotation-trainer:fury-warrior:battle-net:furybar:v3",JSON.stringify({slots:[{abilityId:"recklessness",key:"1"},{abilityId:"rampage",key:"2"},{abilityId:"bloodthirst",key:"3"},{abilityId:"raging-blow",key:"4"}],drill:"priority",duration:60}));}catch{}});
const pageOne=await contextOne.newPage();watch(pageOne);
await pageOne.goto(`${baseURL}/ru/wow/demo/furybar`,{waitUntil:"domcontentloaded",timeout:120000});
const managerOne=pageOne.getByRole("region",{name:"Выберите, где будете играть"});await managerOne.waitFor({timeout:120000});
await managerOne.getByLabel("Название билда").fill("Аккаунтный рейд");await managerOne.getByRole("button",{name:/^Сохранить$/}).click();
await waitFor(()=>documents.has("furybar:fury-warrior:talent-builds"),"talent document was not saved");
await waitFor(()=>documents.has("furybar:fury-warrior:gear-owned"),"gear document was not migrated");
await pageOne.getByRole("button",{name:"Что это?"}).click();
await pageOne.getByRole("button",{name:/Открыть тренировку/}).click();
await pageOne.locator("#rotation-trainer").waitFor();
await waitFor(()=>documents.has("furybar:fury-warrior:trainer-settings"),"trainer document was not migrated");
await pageOne.getByRole("button",{name:"Назад к выбору прокаста"}).click();

const rotation=pageOne.getByRole("region",{name:"Настрой бой. Получи последовательность."});await rotation.waitFor();await rotation.getByRole("button",{name:"Вставить строку"}).click();
await rotation.getByLabel("Название билда").fill("Аккаунтный Fury");await rotation.getByLabel("Строка талантов из WoW").fill("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");await rotation.getByRole("button",{name:"Сохранить билд"}).click();
await waitFor(()=>documents.has("furybar:fury-warrior:rotation-studio"),"rotation studio was not saved");

const talentKey="furybar:fury-warrior:talent-builds",serverTalent=documents.get(talentKey);
documents.set(talentKey,{...serverTalent,revision:serverTalent.revision+1,payload:[...serverTalent.payload,{id:"remote-build",name:"Билд со второго устройства",loadout:"CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",scenario:"pve-raid",savedAt:new Date().toISOString(),buildVersion:"qa"}]});
await managerOne.getByLabel("Название билда").fill("Аккаунтный рейд обновлён");await managerOne.getByRole("button",{name:/^Обновить$/}).click();
await waitFor(()=>documents.get(talentKey)?.revision>=3,"conflict was not retried");
const mergedBuilds=documents.get(talentKey).payload;
if(!mergedBuilds.some(build=>build.id==="remote-build")||!mergedBuilds.some(build=>build.name==="Аккаунтный рейд обновлён"))throw new Error("concurrent talent builds were not merged");

const contextTwo=await browser.newContext({viewport:{width:1024,height:900},extraHTTPHeaders:{"x-gildra-qa-mode":"battle-net-evidence"}});await installRoutes(contextTwo);const pageTwo=await contextTwo.newPage();watch(pageTwo);
await pageTwo.goto(`${baseURL}/ru/wow/demo/furybar`,{waitUntil:"domcontentloaded",timeout:120000});
const managerTwo=pageTwo.getByRole("region",{name:"Выберите, где будете играть"});await managerTwo.getByRole("button",{name:/^Аккаунтный рейд обновлён/}).waitFor({timeout:120000});await managerTwo.getByRole("button",{name:/^Билд со второго устройства/}).waitFor();
await pageTwo.getByRole("region",{name:"Какая вещь действительно усилит персонажа"}).getByRole("button",{name:"Уже получен"}).waitFor();
await pageTwo.getByRole("region",{name:"Настрой бой. Получи последовательность."}).locator("option",{hasText:"Аккаунтный Fury"}).waitFor({state:"attached"});
if(migrations.size<2||migrations.size>3)throw new Error(`unexpected migration keys: ${JSON.stringify([...migrations])}`);
if(versions.length<6)throw new Error("confirmed version history was not retained");
if(errors.length)throw new Error(errors.join(" | "));
console.log(JSON.stringify({status:"passed",documents:[...documents.keys()],secondBrowser:true,oneTimeMigrationKeys:migrations.size,migrationRequests,conflictMerged:true,confirmedVersions:versions.length,browserErrors:errors},null,2));
await contextOne.close();await contextTwo.close();await browser.close();
