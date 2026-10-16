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
