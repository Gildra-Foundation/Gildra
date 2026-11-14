import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createAuctionGearDiagnostics, logAuctionGearDiagnostics } from '../../../lib/wow/auctionGearDiagnostics.ts';
const path='apps/web/lib/wow/auctionGearRunner.ts';
const sources={before:execFileSync('git',['show',`HEAD:${path}`],{encoding:'utf8'}),after:await readFile(path,'utf8')};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rows=[];
for(const [version,source] of Object.entries(sources)) for(let repeat=0;repeat<5;repeat++) {
 const body=source.slice(source.indexOf('export async function continueAuctionGearSearch('),source.indexOf('/** Refresh actual character'));
 let calls=0, first=null;
 const began=performance.now(), metrics=createAuctionGearDiagnostics();
 const run=vm.runInNewContext(stripTypeScriptTypes(body).replace('export ','')+';continueAuctionGearSearch',{
  Date,logAuctionGearDiagnostics,comparedOptions: new WeakMap(), metricsFor:()=>metrics,publicAuctionResult:(_c,r)=>r,flushAuctionGearSearch:async()=>{},discoverAuctionOptions:async()=>{},
  updateAuctionSearchResult:async(_entry,_signal,_progress,_yield,limit)=>{
   // Fixed synthetic planner/native boundary: useful first comparison 20ms,
   // second comparison 200ms. Legacy batch completes both before returning.
   const count=limit??2;
   for(let i=0;i<count&&calls<2;i++){await pause(calls===0?20:200);calls++;}
   return {kind:'search',searchId:'fixture',pendingItems:2-calls,items:[{comparison:{candidateDps:1000}}]};
  }
 });
 await run({context:{options:[{}]}},new AbortController().signal,()=>{},'fixture',()=>{first??=performance.now()-began;});
 first??=performance.now()-began;
 rows.push({version,repeat,firstResultMs:first,totalMs:performance.now()-began,comparisons:calls});
 assert.equal(calls,2);
 if(version==='after')assert(first<150,'first result must precede held slow second comparison');
}
const summary=Object.keys(sources).map(version=>{const values=rows.filter(r=>r.version===version).map(r=>r.firstResultMs).sort((a,b)=>a-b);return {version,medianMs:values[2],rangeMs:[values[0],values[4]]};});
console.log(JSON.stringify({scope:'Actual Runner orchestration extracted from HEAD/current; synthetic planner boundary with 20ms/200ms fixed delays. Not native/live throughput.',summary,rows},null,2));
