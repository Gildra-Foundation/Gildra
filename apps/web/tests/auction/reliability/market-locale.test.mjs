import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAuctionItemReferences } from '../../../lib/wow/auctionItemReference.ts';

function raw(itemId, description) {
  return { id: itemId, required_level: 1, preview_item: { item: { id: itemId }, level: { value: 100 },
    requirements: { level: { value: 1 } }, stats: [], spells: [{ description }] } };
}

test('market: locale uses known EU English fallback and separates verified RU descriptions', async () => {
  const original = globalThis.fetch, requests = [];
  const itemId = 98765021, signal = new AbortController().signal;
  try {
    globalThis.fetch = async url => {
      const parsed = new URL(url), locale = parsed.searchParams.get('locale'); requests.push(locale);
      return Response.json(raw(itemId, locale === 'ru_RU' ? 'Синтетический эффект' : 'Synthetic effect'));
    };
    const english = await getAuctionItemReferences([itemId], 'eu', 'unused-synthetic', signal, 'en_US');
    const russian = await getAuctionItemReferences([itemId], 'eu', 'unused-synthetic', signal, 'ru_RU');
    await getAuctionItemReferences([itemId], 'eu', 'unused-synthetic', signal, 'en_GB');
    assert.deepEqual(requests, ['en_GB', 'ru_RU']);
    assert.deepEqual(english.get(itemId).effects, ['Synthetic effect']);
    assert.deepEqual(russian.get(itemId).effects, ['Синтетический эффект']);
  } finally { globalThis.fetch = original; }
});

test('market: locale uses the established US English fallback for a Russian UI', async () => {
  const original = globalThis.fetch, requests = [];
  const itemId = 98765022, signal = new AbortController().signal;
  try {
    globalThis.fetch = async url => {
      const parsed = new URL(url); requests.push(parsed.searchParams.get('locale'));
      assert.equal(parsed.origin, 'https://us.api.blizzard.com');
      return Response.json(raw(itemId, 'Synthetic effect'));
    };
    await getAuctionItemReferences([itemId], 'us', 'unused-synthetic', signal, 'ru_RU');
    assert.deepEqual(requests, ['en_US']);
  } finally { globalThis.fetch = original; }
});

test('classifies a missing summary only for a matching non-equippable Blizzard item, also on cache hits', async () => {
  const original = globalThis.fetch;
  const cases = new Map([
    [8383, { id:8383, is_equippable:false, inventory_type:{ type:'NON_EQUIP' }, item_class:{ id:15 } }],
    [123865, null],
    [900001, { id:8383, is_equippable:false, inventory_type:{ type:'NON_EQUIP' }, item_class:{ id:15 } }],
    [900002, { id:900002, is_equippable:true, inventory_type:{ type:'NECK' }, item_class:{ id:4 } }],
  ]);
  let calls = 0;
  try {
    globalThis.fetch = async url => {
      calls++;
      const raw = cases.get(Number(new URL(url).pathname.split('/').at(-1)));
      return Response.json(raw, { status:raw ? 200 : 404 });
    };
    for (let run = 0; run < 2; run++) {
      const nonEquipment = new Map();
      await getAuctionItemReferences([...cases.keys()], 'eu', 'fixture', new AbortController().signal, 'en_GB', nonEquipment);
      assert.deepEqual([...nonEquipment], [[8383,15]]);
    }
    assert.equal(calls, cases.size);
  } finally { globalThis.fetch = original; }
});
