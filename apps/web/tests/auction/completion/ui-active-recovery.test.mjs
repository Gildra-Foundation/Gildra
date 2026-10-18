import assert from 'node:assert/strict';
import { parseAuctionClientActiveRecovery } from '../../../lib/wow/auctionGearClient.ts';
const job={id:'owned-job',status:'queued',mode:'search',scope:{characterSlug:'eu--synthetic--one',locale:'ru'},result:null,error:null,progress:null};
const formIntent={...job.scope,budgetCopper:3333300,scenario:'aoe',objective:'dps',selectedSlots:['WRIST'],privateFacts:{never:'restore'}};
const recovered=parseAuctionClientActiveRecovery({activeJob:job,formIntent});
assert.deepEqual(recovered.formIntent,{...job.scope,budgetGold:'333.33',scenario:'aoe',objective:'dps',selectedSlots:['WRIST']});
assert.equal(recovered.activeJob.id,job.id);
assert.deepEqual(parseAuctionClientActiveRecovery({activeJob:null,formIntent:null}),{activeJob:null,formIntent:null});
for(const patch of [{budgetCopper:-1},{budgetCopper:1.5},{budgetCopper:Infinity},{scenario:'bad'},{objective:'bad'},{selectedSlots:[]},{selectedSlots:['WRIST','WRIST']},{characterSlug:'different'},{locale:'en'}]) assert.equal(parseAuctionClientActiveRecovery({activeJob:job,formIntent:{...formIntent,...patch}}).formIntent,null);
for(const patch of [{id:''},{status:'completed'},{mode:'bad'},{scope:{characterSlug:'',locale:'ru'}},{scope:{characterSlug:'one',locale:'foreign'}}]) assert.throws(()=>parseAuctionClientActiveRecovery({activeJob:{...job,...patch},formIntent}),/invalid_plan_result/);
assert.throws(()=>parseAuctionClientActiveRecovery({result:job}),/invalid_plan_result/);
console.log('PASS active recovery client: safe original intent, no extra server facts, malformed/incorrect-scope data rejected, explicit active/completed distinction.');

// Missing context may bypass directly to an explicitly owned search job only on
// this precise HTTP404. The transport must preserve status, not just error text.
const { AuctionClientError, fetchAuctionClientResult } = await import('../../../lib/wow/auctionGearClient.ts');
const legacyError = new AuctionClientError('legacy-reconnect', true);
assert.equal(legacyError.reconnect, true);
assert.equal(legacyError.status, undefined, 'Existing two-argument constructor stays compatible');
for (const status of [400, 404]) {
  globalThis.fetch = async () => new Response(JSON.stringify({error:'search_not_found'}), {status});
  await assert.rejects(fetchAuctionClientResult('/synthetic-context', new AbortController().signal, () => {}), error => error instanceof AuctionClientError && error.message === 'search_not_found' && error.status === status && error.reconnect === false);
}
console.log('PASS exact recovery transport status: HTTP400 remains distinct from HTTP404; legacy constructor compatible.');
