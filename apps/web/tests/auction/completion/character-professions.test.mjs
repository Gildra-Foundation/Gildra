import assert from 'node:assert/strict';
import test from 'node:test';
import { getBattleNetSimulationSnapshot } from '../../../lib/wow/battleNetCharacterDetails.ts';
import { characterProfessions, professionEligibility } from '../../../lib/wow/characterProfessions.ts';
import { restoreAuctionGearContext, snapshotAuctionGearContext } from '../../../lib/wow/auctionGearRunner.ts';
import { harness, record } from '../reliability/market-harness.mjs';

const character = { id: 17, region: 'eu', name: 'Test', realm: { id: 8, slug: 'realm' } };
const profile = {
  character: { id: 17, realm: { id: 8 } },
  primaries: [{ profession: { id: 202 }, tiers: [
    { tier: { id: 2504 }, skill_points: 2, max_skill_points: 75 },
    { tier: { id: 2827 }, skill_points: 55, max_skill_points: 100 },
  ] }],
  secondaries: [{ profession: { id: 794 }, skill_points: 32, max_skill_points: 950 }],
};
const facts = characterProfessions(profile, character);

test('only rank evidence from the exact skill line and character is accepted', () => {
  assert.deepEqual(facts, { ranks: { 202: null, 2504: 2, 2827: 55, 794: 32 }, complete: true });
  assert.equal(professionEligibility(facts, 2504, 2), 'eligible');
  assert.equal(professionEligibility(facts, 2504, 3), 'insufficient');
  assert.equal(professionEligibility(facts, 202, 0), 'eligible');
  assert.equal(professionEligibility(facts, 202, 1), 'unknown');
  assert.equal(professionEligibility(facts, 123, 1), 'insufficient');
  assert.equal(professionEligibility(characterProfessions({...profile, primaries: undefined}, character), 2504, 1), 'unknown');
  for (const invalid of [null, {}, { ...profile, character: {id: 18, realm:{id: 8}} },
    { ...profile, character: {id: 17, realm:{id: 9}} },
    { ...profile, secondaries: [{profession: {id: 794}, skill_points: '32'}] },
    { ...profile, secondaries: [{profession: {id: 794}, skill_points: 101, max_skill_points: 100}] }]) {
    assert.equal(characterProfessions(invalid, character), undefined);
  }
});

test('auction snapshots read the authenticated profession endpoint, preserve unrelated gear when it is unavailable', async t => {
  const requested = [];
  let available = true;
  t.mock.method(globalThis, 'fetch', async (address, options) => {
    const url = new URL(address); requested.push(url.pathname);
    assert.equal(url.host, 'eu.api.blizzard.com');
    assert.equal(url.searchParams.get('namespace'), 'profile-eu');
    assert.equal(options.headers.Authorization, 'Bearer synthetic');
    assert.equal(options.cache, 'no-store');
    if (url.pathname.endsWith('/professions')) return available ? Response.json(profile) : new Response(null, {status: 503});
    if (url.pathname.endsWith('/specializations')) return Response.json({active_specialization: {id: 72}, specializations: [
      {specialization: {id: 72}, loadouts: [{is_active: true, talent_loadout_code: 'test'}]},
    ]});
    return Response.json({id: character.id});
  });
  const get = () => getBattleNetSimulationSnapshot('synthetic', character, new AbortController().signal, {professions: true});
  assert.deepEqual((await get()).professions, facts);
  available = false;
  assert.equal((await get()).professions, undefined);
  assert.equal(requested.filter(path => path === '/profile/wow/character/realm/test/professions').length, 2);
});

test('catalog and native equipment requirements gate ordinary searches, restore and refresh use the same facts', async () => {
  for (const nativeOnly of [false, true]) {
    for (const [professions, expected, gap] of [[facts, 1, false], [undefined, 0, true], [{complete: true, ranks: {2504: 1}}, 0, false]]) {
      const item = record();
      if (!nativeOnly) item.tooltip.blocks.push({type: 'item_requirements', required_skill_id: 2504, required_skill_rank: 2});
      const h = await harness({entity: item});
      h.state.armory.professions = professions;
      if (nativeOnly) h.state.nativeMetadata = {metadataVersion: 3, enhancements: {
        status: 'verified', socketColors: [0,0,0], socketCount: 0, socketBonusId: 0, requiredProfessionId: 2504, requiredProfessionRank: 2,
      }};
      const {entry} = await h.start();
      assert.equal(entry.context.options.length, expected);
      assert.equal(entry.context.discovery.eligibilityUnverifiedItems.has(item.externalId), gap);
      const restored = restoreAuctionGearContext(structuredClone(snapshotAuctionGearContext(entry.context)));
      assert.deepEqual(restored.discoveryContext('WRIST').professions, professions);
      assert.equal(restored.options.length, expected);
      if (expected && nativeOnly) {
        const legacy = structuredClone(snapshotAuctionGearContext(entry.context));
        delete legacy.armory.professions;
        const migrated = restoreAuctionGearContext(legacy);
        assert.notEqual(migrated.discovery, legacy.discovery);
        assert.equal(migrated.options.length, 0);
        assert.equal(migrated.coverage.discoveryComplete, false);
      }
      if (expected) {
        h.state.armory = {...h.state.armory, professions: {complete: true, ranks: {2504: 1}}};
        await assert.rejects(h.runner.verifyAuctionGearSearch(entry, 'synthetic', h.signal(), false), /character_snapshot_changed/);
      }
    }
  }
});

test('checkpoint repeats verification once for previously accepted weapon references', async () => {
  const h = await harness();
  const {entry} = await h.start();
  const legacy = structuredClone(snapshotAuctionGearContext(entry.context));
  delete legacy.discovery.weaponReferenceRevision;
  const id = 327;
  legacy.discovery.references.set(id, { weapon: { minDamage: 1, maxDamage: 1, dps: 0.4, speedSeconds: 2.5 } });
  const unaffected = structuredClone(legacy);
  assert.equal(restoreAuctionGearContext(unaffected).discovery, unaffected.discovery);
  legacy.discovery.verifiedReferences.add(id);
  const restored = restoreAuctionGearContext(legacy);
  assert.notEqual(restored.discovery, legacy.discovery);
  assert.equal(restored.discovery.verifiedReferences.size, 0);
  assert.equal(restored.coverage.discoveryComplete, false);
  assert.equal(restoreAuctionGearContext(snapshotAuctionGearContext(restored)).discovery, restored.discovery);
});

test('purchased and retained belts quote and simulate an engineering enchant only for its exact skill tier', async () => {
  const {evaluateAuctionEnhancementStage} = await import('../../../lib/wow/auctionGearEnhancementStage.ts');
  const {prepareGearLoadout} = await import('../../../lib/wow/gearSimulation.ts');
  const {auctionEnhancementCatalogInfo: info} = await import('../../../lib/wow/auctionEnhancementCatalog.ts');
  const engine = 'SimulationCraft ' + info.simcRevision.slice(0, 7) + ' profession fixture';
  const baseline = {engine, dps: 1000, dpsError: 1, confidence: 95, iterations: 750};
  const candidate = {itemId: 55, name: 'Fixture belt', slotType: 'WAIST', inventoryType: 6, itemClassId: 4, itemSubclassId: 4,
    eligible: true, compatibility: {specId: 72}, constraints: {requiredLevel: 1}, variants: [{key: 'exact', itemLevel: 150,
      contextId: 0, bonusIds: [], resolution: {effectsVerified:true, effects:[], metadataVersion: 3, enhancements: {
        status: 'verified', socketColors: [0,0,0], socketCount: 0, socketBonusId: 0, requiredProfessionId: 0, requiredProfessionRank: 0,
      }}}]};
  const option = {id: 'belt', auctionId: 12, quantity: 1, costCopper: 1, variantKey: 'exact', candidate};
  const loadout = [{slotType: 'WAIST', itemId: 50, inventoryType: 6, itemSubclassId: 4}];
  const equipment = {equipped_items: [{item: {id: 50}, spells:[], slot: {type: 'WAIST'}, level: {value: 150}, item_class: {id: 4}}]};
  for (const owned of [true, false]) for (const professions of [facts, {ranks: {2504: 0}, complete: true}, undefined]) {
    const qualified = professions === facts;
    const quoted = new Set(), simulated = new Set();
    const input = {finalists: [{label: 'belt', options: owned ? [] : [option]}], loadout, equipment, selectedSlots: ['WAIST'],
      exhaustive: true, engine, level: 90, specId: 72, professions, region: 'eu', profileFingerprint: 'profession-fixture', objective: 'dps',
      encounter: {scenario: 'single-target', fightLengthSeconds: 120, targets: 1}, baseline, budgetCopper: 1000,
      shouldYield: () => false, signal: new AbortController().signal, state: {checkpoints: {}},
      quote: async (_region, ids) => {
        ids.forEach(id => quoted.add(id));
        const now = new Date().toISOString();
        return {prices: {40776: {ladder: [[8,1]]}}, sourceUpdatedAt: now, fetchedAt: now};
      },
      simulate: async (selections, _signal, changes) => {
        const [change] = owned ? changes : prepareGearLoadout({selections, equipment, loadout, specId: 72}).changes;
        simulated.add(change?.enchantId ?? 0);
        return {...baseline, dps: change?.enchantId ? 1200 : 1000};
      }};
    let result;
    for (let slice = 0; slice < 8 && !result?.complete; slice++) result = await evaluateAuctionEnhancementStage(input);
    assert.equal(result.complete, true);
    assert.equal(quoted.has(40776), qualified, 'Only qualified characters may buy the engineering consumable');
    assert.equal(simulated.has(3599), qualified);
    assert.equal(result.reasons.includes('profession_unverified'), professions === undefined);
  }
});
