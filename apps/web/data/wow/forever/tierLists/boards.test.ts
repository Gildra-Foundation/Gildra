import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data=JSON.parse(readFileSync(new URL('./boards.json',import.meta.url),'utf8'));
test('editorial boards retain scope and never invent measured scores',()=>{
 for(const b of data.boards){assert.equal(b.edition,'forever');assert.equal(b.kind,'editorial');assert.equal(b.entries.length,b.sourceTotal);assert.equal(new Set(b.entries.map((e:{classSlug:string})=>e.classSlug)).size,b.entries.length);
  for(const e of b.entries){assert.equal(e.specSlug,null);assert.equal(e.score,null);assert.equal(e.performance,null);assert.equal(e.popularity,null);assert.ok(e.rationale.en&&e.rationale.ru&&e.sourceUrl);}
 }
 const heal=data.boards.find((b:{role:string})=>b.role==='healer');assert.ok(heal.isForecast);assert.equal(heal.levelMax,60);
 assert.ok(!data.boards.some((b:{mode:string})=>b.mode==='raid'||b.mode==='pvp'));
});
