import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAuctionItemReference, nativeMatchesItemReference } from '../../../lib/wow/auctionItemReference.ts';
import { harness, offer, market } from './market-harness.mjs';

function rawReference() {
  return { id: 1, required_level: 1, preview_item: { item: { id: 1 }, level: { value: 100 },
    requirements: { level: { value: 1 } }, bonus_list: [1], context: 13, stats: [],
    weapon: { damage: { min_value: 100, max_value: 200 }, attack_speed: { value: 2500 }, dps: { value: 60 } },
    spells: [{ spell: { id: 123 }, description: 'Equip: Synthetic verified effect.' }] } };
}
const weapon = { minDamage: 100, maxDamage: 200, dps: 60, speedSeconds: 2.5 };
const native = () => ({ key: 'synthetic', itemId: 1, itemLevel: 100, requiredLevel: 1, stats: {} });

test('market: presentation retains exact reference weapon facts with milliseconds converted', () => {
  const reference = parseAuctionItemReference(rawReference(), 1);
  assert(reference);
  assert.deepEqual(reference.weapon, weapon);
});

test('market: presentation retains complete explicit spell descriptions', () => {
  const reference = parseAuctionItemReference(rawReference(), 1);
  assert.equal(reference.effectsVerified, true);
  assert.deepEqual(reference.effects, ['Equip: Synthetic verified effect.']);
});

test('market: presentation explicit empty spell array confirms no listed effects', () => {
  const raw = rawReference(); raw.preview_item.spells = [];
  const reference = parseAuctionItemReference(raw, 1);
  assert.equal(reference.effectsVerified, true);
  assert.deepEqual(reference.effects, []);
});

test('market: presentation absent spell array remains explicitly unverified', () => {
  const raw = rawReference(); delete raw.preview_item.spells;
  const reference = parseAuctionItemReference(raw, 1);
  assert(reference);
  assert.equal(reference.effectsVerified, false);
  assert.deepEqual(reference.effects ?? [], []);
});

test('market: presentation malformed explicit weapon facts fail closed', () => {
  for (const change of [
    value => { value.damage.min_value = -1; },
    value => { value.damage.max_value = 50; },
    value => { value.attack_speed.value = 0; },
    value => { value.dps.value = Number.NaN; },
  ]) {
    const raw = rawReference(); change(raw.preview_item.weapon);
    assert.equal(parseAuctionItemReference(raw, 1), null);
  }
});

test('market: presentation malformed explicit spell array cannot verify effects', () => {
  const raw = rawReference(); raw.preview_item.spells = [{ description: 'One valid effect' }, { description: 42 }];
  const reference = parseAuctionItemReference(raw, 1);
  assert(reference === null || reference.effectsVerified === false);
  if (reference) assert.deepEqual(reference.effects ?? [], [], 'must not present a partial spell list as complete');
});

test('market: presentation native weapon mismatch rejects an item reference', () => {
  const reference = { offer: offer(), itemLevel: 100, requiredLevel: 1, stats: [], weapon };
  assert.equal(nativeMatchesItemReference(reference, { ...native(), weapon: { ...weapon, minDamage: 500, maxDamage: 600 } }), false);
});

test('market: presentation missing optional native weapon remains backwards compatible', () => {
  const reference = { offer: offer(), itemLevel: 100, requiredLevel: 1, stats: [], weapon };
  assert.equal(nativeMatchesItemReference(reference, native()), true);
});

test('market: presentation reference descriptions attach only to the exact confirmed variant', async () => {
  const reference = { offer: offer(), itemLevel: 100, requiredLevel: 1, stats: [],
    effectsVerified: true, effects: ['Equip: Synthetic verified effect.'] };
  const h = await harness({ reference });
  h.state.market = market([offer(), offer(2, 2)]);
  const d = h.discovery.createAuctionGearDiscovery(h.state.market, 1000);
  await h.discovery.advanceAuctionGearDiscovery(d, h.discoveryInput);
  const options = h.discovery.auctionGearDiscoveryOptions(d);
  assert.equal(options.length, 2);
  const exact = options.find(option => option.auctionId === 1).candidate.variants[0].resolution;
  const scaled = options.find(option => option.auctionId === 2).candidate.variants[0].resolution;
  assert.equal(exact.effectsVerified, true);
  assert.deepEqual(exact.effects, reference.effects);
  assert.notEqual(scaled.effectsVerified, true);
  assert.deepEqual(scaled.effects ?? [], [], 'base reference descriptions must not leak to another bonus/context variant');
});

test('market: presentation requests references in the discovery locale', async () => {
  const h = await harness();
  const d = h.discovery.createAuctionGearDiscovery(h.state.market, 1000);
  await h.discovery.advanceAuctionGearDiscovery(d, { ...h.discoveryInput, locale: 'ru_RU' });
  assert.deepEqual(h.state.referenceLocales, ['ru_RU']);
});
