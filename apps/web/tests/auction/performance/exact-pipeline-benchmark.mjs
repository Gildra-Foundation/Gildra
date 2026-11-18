import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { exactPipeline } from './exact-pipeline-fixture.mjs';

const baselineRef=process.env.AUCTION_EXACT_BASELINE_REF??'30280ff234453a8d8f61ec9c75b14302deff7693';
const repeats=Number(process.env.AUCTION_EXACT_REPEATS??3), rows=[];
const nativeKey=request=>JSON.stringify([request.actionListMode,request.scenario,request.targets,request.fightLengthSeconds,request.gearChanges]);
let expected;
for(let repeat=0;repeat<repeats;repeat++) for(const version of repeat%2?['current','baseline']:['baseline','current']) {
  const run=await exactPipeline({items:1,ref:version==='baseline'?baselineRef:undefined});
  assert.equal(run.final.status,'completed',run.summary.taskError);
  const facts={requests:run.requests.map(nativeKey),equipmentChecked:run.summary.equipmentChecked,
    recommendations:run.final.result.enhancementOptimization.recommendations.map(row=>[row.optionIds,row.configuration.totalCopper,row.simulation])};
  if(expected)assert.deepEqual(structuredClone(facts),structuredClone(expected),'Optimization must retain every native measurement, priced leader and complete equipment domain');else expected=facts;
  rows.push({repeat,version,...run.summary});console.log(JSON.stringify(rows.at(-1)));
}
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const summary=Object.fromEntries(['baseline','current'].map(version=>[version,{elapsedMs:median(rows.filter(row=>row.version===version).map(row=>row.elapsedMs)),
  searchWritesMs:median(rows.filter(row=>row.version===version).map(row=>row.times.searchWrites)),jobWritesMs:median(rows.filter(row=>row.version===version).map(row=>row.times.jobWrites)),
  counts:rows.find(row=>row.version===version).counts}]));
console.log(JSON.stringify({summary}));
if(process.env.AUCTION_EXACT_OUTPUT)await writeFile(process.env.AUCTION_EXACT_OUTPUT,JSON.stringify({baselineRef,scope:'Local synthetic transport; actual full-task/Runner/planners/Jobs/SearchStore and disk persistence; native precision750/95 unchanged; no live latency claim',summary,rows},null,2));
