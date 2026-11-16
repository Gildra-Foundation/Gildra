import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import {supportedAuctionModifiers} from '../../../lib/wow/gearItemModifiers.ts';

// Real parser/cache/pool, synthetic transport only; no requests or credentials.
const source = readFileSync(new URL('../../../lib/wow/auctionItemReference.ts', import.meta.url), 'utf8');
const body = stripTypeScriptTypes(source, {mode: 'strip'}).replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const deferred = () => { let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const raw = id => ({id, required_level: 1, preview_item: {item: {id}, level: {value: 100}, requirements: {level: {value: 1}},
  context: 13, bonus_list: [2], modifiers: [], stats: [{type: {type: 'STRENGTH'}, value: id}], spells: []}});
function fixture(fetch) {
  let now = Date.now();
  const Clock = class extends Date { static now() {return now;} };
  const api = vm.runInNewContext(body + ';({getAuctionItemReferences,parseAuctionItemReference,AUCTION_ITEM_REFERENCE_TTL_MS})',
    {Map, Set, Object, Number, JSON, Buffer, AbortController, AbortSignal, Date: Clock, supportedAuctionModifiers, fetch});
  return {...api, advance: ms => {now += ms;}, get: (ids, signal = new AbortController().signal, region = 'eu', locale = 'en_US', token = 'synthetic') =>
    api.getAuctionItemReferences(ids, region, token, signal, locale)};
}
const values = result => JSON.parse(JSON.stringify([...result].sort(([a], [b]) => a-b)));

test('reference slots refill before an earlier slow request finishes, retaining every exact reference', async () => {
  const held = new Map(), starts = []; let active = 0, peak = 0, free = false;
  const h = fixture(async (url, options) => {
    const id = Number(new URL(url).pathname.split('/').at(-1)); starts.push(id); active++; peak = Math.max(active, peak);
    assert.equal(options.cache, 'no-store'); assert.equal(options.headers.Authorization, 'Bearer synthetic');
    const gate = deferred(); held.set(id, gate);
    try {if (!free) await gate.promise; return Response.json(raw(id));} finally {active--;}
  });
  const pending = h.get([1,2,3,4,5,6,7,8]); await tick(); assert.deepEqual(starts, [1,2,3,4]);
  held.get(2).resolve(); await tick(); assert(starts.includes(5), 'item5 must start while item1 remains held');
  assert.equal(active, 4); free = true; for (const gate of held.values()) gate.resolve();
  const result = await pending; assert.equal(peak, 4); assert.equal(active, 0); assert.equal(starts.length, 8);
  assert.deepEqual(values(result), [1,2,3,4,5,6,7,8].map(id => [id, JSON.parse(JSON.stringify(h.parseAuctionItemReference(raw(id), id)))]));
});

test('failure cancels and drains siblings before rejecting; queued IDs and failed facts are not cached', async () => {
  const drain = deferred(); let fail = true, calls = 0, active = 0, cancelled = 0;
  const h = fixture(async (url, options) => {
    const id = Number(new URL(url).pathname.split('/').at(-1)); calls++; active++;
    try {
      if (!fail) return Response.json(raw(id));
      if (id === 1) return Response.json({}, {status: 429});
      await new Promise(resolve => options.signal.addEventListener('abort', resolve, {once: true}));
      cancelled++; await drain.promise; throw options.signal.reason;
    } finally {active--;}
  });
  let settled = false; const pending = h.get([1,2,3,4,5,6,7,8]);
  const rejected = assert.rejects(pending, /item_reference_unavailable/).finally(() => {settled = true;});
  await tick(); assert.equal(calls, 4); assert.equal(cancelled, 3); assert.equal(settled, false);
  drain.resolve(); await rejected; assert.equal(active, 0);
  fail = false; const result = await h.get([1,2,3,4,5,6,7,8]); assert.equal(result.size, 8); assert.equal(calls, 12);
});

test('caller cancellation drains its pool and does not cancel another caller', async () => {
  const drain = deferred(), controller = new AbortController(); let active = 0, calls = 0;
  const h = fixture(async (url, options) => {
    const id = Number(new URL(url).pathname.split('/').at(-1)); calls++; active++;
    try {
      if (id >= 20) return Response.json(raw(id));
      await new Promise(resolve => options.signal.addEventListener('abort', resolve, {once: true}));
      await drain.promise; throw options.signal.reason;
    } finally {active--;}
  });
  const pending = h.get([1,2,3,4,5,6,7,8], controller.signal); const reason = new DOMException('synthetic cancel', 'AbortError');
  let settled = false; const rejected = assert.rejects(pending, error => error === reason).finally(() => {settled = true;});
  controller.abort(reason); await tick(); assert.equal(calls, 4); assert.equal(settled, false);
  assert.equal((await h.get([20,21])).size, 2); drain.resolve(); await rejected; assert.equal(active, 0); assert.equal(calls, 6);
});

test('public cache keeps its exact TTL, locale/region scope, and current request authorization', async () => {
  const requests = []; let missing = true, level = 100;
  const h = fixture(async (url, options) => {
    requests.push({url, authorization: options.headers.Authorization}); const id = Number(new URL(url).pathname.split('/').at(-1));
    if (id === 99 && missing) return Response.json({}, {status: 404});
    const value = raw(id); value.preview_item.level.value = level; return Response.json(value);
  });
  await h.get([1,99]); assert.equal(requests.length, 2); missing = false; level = 200;
  h.advance(h.AUCTION_ITEM_REFERENCE_TTL_MS-1);
  const cached = await h.get([1,99], undefined, 'eu', 'en_US', 'another-token');
  assert.equal(cached.get(1).itemLevel, 100); assert.equal(cached.has(99), false); assert.equal(requests.length, 2);
  h.advance(1); const refreshed = await h.get([1,99], undefined, 'eu', 'en_US', 'fresh-token');
  assert.equal(refreshed.get(1).itemLevel, 200); assert.equal(refreshed.has(99), true);
  assert(requests.slice(2).every(request => request.authorization === 'Bearer fresh-token'));
  await h.get([1], undefined, 'eu', 'ru_RU', 'russian-token'); await h.get([1], undefined, 'us', 'ru_RU', 'us-token');
  assert.equal(requests.length, 6); assert(requests[4].url.includes('locale=ru_RU')); assert(requests[5].url.includes('namespace=static-us'));
  assert.equal(requests[4].authorization, 'Bearer russian-token'); assert.equal(requests[5].authorization, 'Bearer us-token');
});
