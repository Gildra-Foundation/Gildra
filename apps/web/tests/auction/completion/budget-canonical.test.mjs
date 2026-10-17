import assert from 'node:assert/strict';
import { normalizeAuctionBudgetGold } from '../../../lib/wow/auctionGearBudget.ts';
import { goldToCopper } from '../../../lib/wow/auctionMarket.ts';
const completed = [];
const failures = [];
for (const [locale, input, canonical] of [
 ['en','10000.0','10000'], ['ru','10000,0','10000'],
 ['en','010000','10000'], ['ru','010000','10000'],
 ['en','00010000.1200','10000.12'], ['ru','00010000,1200','10000.12'],
 ['en','10,000.1200','10000.12'], ['ru','10\u202f000,1200','10000.12'],
 ['en','00000000.0000','0'], ['ru','00000000,0000','0'],
 ['en','00000000.0001','0.0001'], ['ru','00000000,0001','0.0001'],
 ['en','99999999.9999','99999999.9999'], ['ru','99 999 999,9999','99999999.9999'],
]) {
 const name = `canonical exact money ${locale} ${JSON.stringify(input)}`;
 try {
  const normalized=normalizeAuctionBudgetGold(input,locale);
  assert.equal(normalized,canonical);
  assert.equal(goldToCopper(normalized),goldToCopper(input.replace(/[ \u00a0\u202f]/g,'').replaceAll(',',locale==='ru'?'.':'')));
  assert.equal(normalizeAuctionBudgetGold(normalized,'en'),canonical,'Normalization stays idempotent across cached safe intent');
  completed.push(name);
 } catch(error) { failures.push({name,message:String(error)}); }
}
for(const locale of ['en','ru']) for(const input of ['000000000','10000.00000','1e4','-0','100000000','10,00.0']) {
 const name=`reject invalid ${locale} ${JSON.stringify(input)}`;
 try { assert.throws(()=>normalizeAuctionBudgetGold(input,locale),/invalid_budget/); completed.push(name); }
 catch(error) { failures.push({name,message:String(error)}); }
}
console.log(JSON.stringify({status:failures.length?'failed':'passed',cases:completed.length+failures.length,completed,failures},null,2));
if(failures.length) process.exitCode=1;
