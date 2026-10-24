import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../../app/v1/meta/wow/tier-list/route.ts';

function restore(t: TestContext) {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.API_INTERNAL_URL;
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = originalBase;
  });
}

test('browser tier refresh follows the runtime API and forwards only public filters', async t => {
  restore(t);
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const snapshot = { seasonId: 'midnight-season-2', entries: [{ specName: 'Fury', rank: 'A' }] };
  globalThis.fetch = async (url, init) => { calls.push({ url: new URL(String(url)), init }); return Response.json(snapshot); };
  for (const origin of ['http://isolated-api:8080', 'http://release-api:8080']) {
    process.env.API_INTERNAL_URL = origin;
    const response = await GET(new Request('https://site.example/v1/meta/wow/tier-list?activity=raid&role=tank&limit=40&selectionType=raid&selectionId=1&addon=midnight&keyType=all&difficulty=raid_hero&target=https://unexpected.example', { headers: { Cookie: 'private=do-not-forward', Authorization: 'Bearer do-not-forward' } }));
    assert.deepEqual(await response.json(), snapshot);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const call = calls.at(-1)!;
    assert.equal(call.url.origin, origin);
    assert.equal(call.url.pathname, '/v1/meta/wow/tier-list');
    assert.equal(call.url.searchParams.get('role'), 'tank');
    assert.equal(call.url.searchParams.get('difficulty'), 'raid_hero');
    assert.equal(call.url.searchParams.has('target'), false);
    assert.deepEqual(call.init?.headers, { Accept: 'application/json' });
    assert.equal(call.init?.redirect, 'error');
  }
});

test('source failure preserves status/retry guidance without leaking upstream cookies', async t => {
  restore(t);
  globalThis.fetch = async () => Response.json({ code: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '30', 'Set-Cookie': 'upstream=private' } });
  const response = await GET(new Request('https://site.example/v1/meta/wow/tier-list'));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '30');
  assert.equal(response.headers.get('set-cookie'), null);
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await GET(new Request('https://site.example/v1/meta/wow/tier-list'))).status, 503);
  globalThis.fetch = async () => new Response('<html>upstream unavailable</html>', { status: 502 });
  assert.equal((await GET(new Request('https://site.example/v1/meta/wow/tier-list'))).status, 503);
});
