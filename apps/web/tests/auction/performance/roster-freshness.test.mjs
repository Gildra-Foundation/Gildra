import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleNetProfileError, getBattleNetCharacterBySlug, getBattleNetCharacters } from '../../../lib/wow/battleNetCharacters.ts';

const character = { id: 42, name: 'Synthetic', level: 81,
  realm: { id: 1, name: 'Synthetic', slug: 'synthetic' },
  playable_class: { id: 1, name: 'Warrior' }, playable_race: { id: 1, name: 'Human' },
  faction: { type: 'ALLIANCE', name: 'Alliance' } };
const slug = 'eu--synthetic--synthetic';
function transport(t) {
  const state = { characters: [character], status: 200, calls: 0 };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    state.calls++;
    assert.equal(new URL(url).origin, 'https://eu.api.blizzard.com');
    assert.equal(new URL(url).pathname, '/profile/user/wow');
    assert.equal(init.cache, 'no-store');
    return state.status === 200
      ? Response.json({ wow_accounts: [{ id: 1, characters: state.characters }] })
      : new Response(null, { status: state.status });
  });
  return state;
}

test('default roster cache stays warm while no-store detects removed ownership without replacing UI cache', async t => {
  const state = transport(t), token = 'synthetic-roster-default';
  assert.equal((await getBattleNetCharacterBySlug(token, 'en', slug)).id, 42);
  state.characters = [];
  assert.equal((await getBattleNetCharacterBySlug(token, 'en', slug)).id, 42);
  assert.equal(state.calls, 1, 'UI getter retains normal warm cache');
  assert.equal(await getBattleNetCharacterBySlug(token, 'en', slug, undefined, { cache: 'no-store' }), undefined);
  assert.equal(state.calls, 2, 'Ownership getter fetches despite warm UI cache');
  assert.equal((await getBattleNetCharacterBySlug(token, 'en', slug)).id, 42);
  assert.equal(state.calls, 2, 'No-store response must not replace the separate UI cache');
});

for (const status of [401, 503]) test(`fresh ownership HTTP ${status} rejects instead of using cached ownership`, async t => {
  const state = transport(t), token = `synthetic-roster-error-${status}`;
  await getBattleNetCharacterBySlug(token, 'en', slug);
  state.status = status;
  await assert.rejects(getBattleNetCharacterBySlug(token, 'en', slug, undefined, { cache: 'no-store' }),
    error => error instanceof BattleNetProfileError && error.status === status);
  assert.equal(state.calls, 2);
});

test('already aborted calls reject before warm-cache read or fresh upstream request', async t => {
  const state = transport(t), token = 'synthetic-roster-abort';
  await getBattleNetCharacters(token, 'en', 'eu');
  const controller = new AbortController(); controller.abort();
  for (const options of [undefined, { cache: 'no-store' }]) {
    await assert.rejects(getBattleNetCharacters(token, 'en', 'eu', controller.signal, options), { name: 'AbortError' });
    await assert.rejects(getBattleNetCharacterBySlug(token, 'en', slug, controller.signal, options), { name: 'AbortError' });
  }
  assert.equal(state.calls, 1, 'Cancellation must neither reuse ownership nor spend another request');
});
