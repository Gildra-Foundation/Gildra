import assert from 'node:assert/strict';
const completed = [];
function test(name, check) { check(); completed.push(name); }
import { normalizeAuctionBudgetGold } from '../../../lib/wow/auctionGearBudget.ts';
import { goldToCopper } from '../../../lib/wow/auctionMarket.ts';
for (const [locale,input,canonical] of [
 ['en','10,000','10000'],['en','10,000.1234','10000.1234'],['en','0.0001','0.0001'],['en','99,999,999.9999','99999999.9999'],
 ['ru','10 000,1234','10000.1234'],['ru','10\u00a0000,1234','10000.1234'],['ru','10\u202f000,1234','10000.1234'],['ru','0,0001','0.0001'],['ru','10000.1234','10000.1234'],
 ['en','0','0'],['ru','0','0'],['en',' 10000.1234 ','10000.1234'],['ru','99 999 999,9999','99999999.9999'],
]) test(`budget ${locale} ${JSON.stringify(input)} retains exact copper precision`,()=>{
 assert.equal(normalizeAuctionBudgetGold(input,locale),canonical);assert.equal(goldToCopper(normalizeAuctionBudgetGold(input,locale)),goldToCopper(canonical));
});
for(const locale of ['en','ru']) for(const input of ['-1','1e4','1+2','1.00000','100000000','1,000.12345','10,000,12','1 00 000','1\t000','1\n000','']) test(`reject ${locale} ${JSON.stringify(input)}`,()=>assert.throws(()=>normalizeAuctionBudgetGold(input,locale),/invalid_budget/));
for(const [locale,input] of [['en','10,00'],['en','10.000,1234'],['en','10 000'],['ru','10 00'],['ru','10,000.1234'],['ru','1 000,12345']]) test(`reject mixed locale grouping ${locale} ${JSON.stringify(input)}`,()=>assert.throws(()=>normalizeAuctionBudgetGold(input,locale),/invalid_budget/));
console.log(JSON.stringify({ status: 'passed', cases: completed.length, completed }));
