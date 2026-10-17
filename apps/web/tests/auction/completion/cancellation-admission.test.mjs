import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const child=fileURLToPath(new URL('cancellation-child.mjs',import.meta.url)),launcher=fileURLToPath(new URL('persistence-child-launch.py',import.meta.url)),cwd=fileURLToPath(new URL('../../../',import.meta.url));
async function run(directory,mode,input={}){
 const p=spawn('python3',[launcher,process.execPath,'--experimental-transform-types','--no-warnings','--import','./tests/auction/resolve.mjs',child,mode,JSON.stringify(input)],{cwd,env:{...process.env,GILDRA_AUCTION_STATE_DIR:directory},timeout:20000});let stdout='',stderr='';
 p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);const code=await new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',resolve);});assert.equal(code,0,`${mode}:\n${stderr}\n${stdout}`);return JSON.parse(stdout.trim().split('\n').at(-1));
}
async function isolated(callback){const directory=await mkdtemp(join(tmpdir(),'gildra-cancellation-'));try{await callback(directory);}finally{await rm(directory,{recursive:true,force:true});}}
test('full retained terminal results admit cancellation and preserve both ACKs after restart',()=>isolated(async d=>{const seed=await run(d,'capacity');assert.equal((await run(d,'capacity-read',seed)).status,'passed');}));
test('failed cancellation replacement write or removal preserves old result and leaves no admitted nonce after restart',()=>isolated(async d=>{const seed=await run(d,'replacement-failure');assert.equal((await run(d,'replacement-read',seed)).status,'passed');}));
test('owner cancellation quota is a minute rate; retries and accepted-job cancellation remain available',()=>isolated(async d=>{assert.equal((await run(d,'rate')).status,'passed');}));
test('cancellation minute-rate history and30minute ACKs survive restart',()=>isolated(async d=>{const seed=await run(d,'rate-seed');assert.equal((await run(d,'rate-read',seed)).status,'passed');}));
test('true all-protected global saturation rejects new cancellation and work without evicting acknowledged barriers',()=>isolated(async d=>{assert.equal((await run(d,'protected-full')).status,'passed');}));
test('cancellation scope and owner isolation hold for the same client nonce',()=>isolated(async d=>{assert.equal((await run(d,'scope')).status,'passed');}));
test('crash-window overflow pruning preserves the oldest protected ACK after durable replacement',()=>isolated(async d=>{const seed=await run(d,'crash-seed');assert.equal(seed.count,201);assert.equal((await run(d,'crash-read',seed)).status,'passed');}));
