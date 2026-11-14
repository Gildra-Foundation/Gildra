import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const moduleUrl = new URL('../../../lib/wow/auctionGearJobs.ts',import.meta.url).href;
const loader = new URL('../resolve.mjs',import.meta.url).href;
test('explicit comparison scenarios survive restart and detached form recovery', () => {
 const directory=mkdtempSync(join(tmpdir(),'auction-intent-'));
 const input={characterSlug:'synthetic',budgetCopper:100,scenario:'aoe',locale:'en',fightLengthSeconds:90,targets:3,compareScenarios:[{scenario:'single-target',fightLengthSeconds:120,targets:1}]};
 const run=code=>{
  const p=spawnSync(process.execPath,['--experimental-transform-types','--no-warnings','--import',loader,'--input-type=module','-e',`import * as jobs from ${JSON.stringify(moduleUrl)};${code}`],{env:{...process.env,GILDRA_AUCTION_STATE_DIR:directory},encoding:'utf8',timeout:15000});
  assert.equal(p.status,0,p.stderr); return JSON.parse(p.stdout.trim());
 };
 try {
  run(`const input=${JSON.stringify(input)};const j=jobs.enqueueAuctionGearJob('owner',async()=>new Promise(()=>{}),{scope:{characterSlug:input.characterSlug,locale:input.locale},work:{action:'search',input}});console.log(JSON.stringify(j));process.exit(0);`);
  const recovered=run(`const first=jobs.getOwnerActiveAuctionGearJob('owner');first.formIntent.compareScenarios[0].targets=8;console.log(JSON.stringify(jobs.getOwnerActiveAuctionGearJob('owner')));process.exit(0);`);
  assert.deepEqual(recovered.formIntent.compareScenarios,input.compareScenarios);
  assert.equal(recovered.formIntent.fightLengthSeconds,90);
  assert.equal(recovered.formIntent.targets,3);
 } finally { rmSync(directory,{recursive:true,force:true}); }
});
