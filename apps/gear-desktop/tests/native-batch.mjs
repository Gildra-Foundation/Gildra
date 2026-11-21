import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const runtime = resolve(process.argv[2]);
const extension = process.platform === 'win32' ? '.exe' : '';
const token = randomBytes(32).toString('hex');
const worker = spawn(join(runtime, 'gear-engine' + extension), [], {stdio:['pipe','pipe','inherit'], env: {
  ...process.env, GEAR_ENGINE_KEY: token, SIMC_BINARY: join(runtime,'simc' + extension),
  SIMC_PROFILE_DIR: join(runtime,'profiles'), SIMC_FURY_PROFILE: join(runtime,'profiles','MID2_Warrior_Fury.simc'),
}});
const input = JSON.parse(await readFile(new URL('fury-profile.json', import.meta.url), 'utf8'));
delete input.gearChange;
const slotNames = {FINGER_1:'finger1',FINGER_2:'finger2',TRINKET_1:'trinket1',TRINKET_2:'trinket2',MAIN_HAND:'main_hand',OFF_HAND:'off_hand'};
const changes = input.armory.equipment.equipped_items.map(row => ({
  slot:slotNames[row.slot.type] ?? row.slot.type.toLowerCase(), itemId:row.item.id, bonusIds:[...new Set(row.bonus_list ?? [])]
}));
try {
  const reader = createInterface({input:worker.stdout,crlfDelay:Infinity});
  const line = await reader[Symbol.asyncIterator]().next();
  assert.match(line.value ?? '', /^\d+$/);
  const base = 'http://127.0.0.1:' + line.value;
  assert.equal((await fetch(base + '/healthz')).status, 403);
  const payload = {base:{...input,precision:'auction-candidate'}, mixedSlots:true,
    candidates:Array.from({length:25}, () => ({gearChanges:changes}))};
  const reply = await fetch(base + '/v1/wow/rotation/simulations/batch', {
    method:'POST', headers:{authorization:'Bearer ' + token,'content-type':'application/json'}, body:JSON.stringify(payload),
    signal:AbortSignal.timeout(150000)
  });
  const result = await reply.json();
  assert.equal(reply.status, 201, JSON.stringify(result));
  assert.equal(result.results.length, 25);
  assert.ok(result.results.every(row => row.dps > 0 && row.iterations === 100 && row.engine.includes('18428cd')));
  console.log('25 complete loadouts compared with the pinned native SimulationCraft engine.');
} finally {worker.stdin.end();}
