import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dreamriftGuide as guide } from '../../lib/data/wow/raid/dreamriftGuide';
import { guideRole, guideSpecs } from '../../components/wow/raid/voidspireGuideCounters';

test('both difficulties bind the interrupt to Haunting Essence, not the Horror or shield', () => {
  for (const heroic of [false, true]) {
    const mechanics = guide.mechanics.filter(item => heroic || !item.heroicOnly);
    const kicks = mechanics.filter(item => item.counters.includes('interrupt'));
    assert.equal(kicks.length, 1);
    assert.equal(kicks[0].spellId, 1249017);
    const target = guide.adds.find(add => add.id === kicks[0].targetId);
    assert.equal(target?.npcId, 256803);
    assert.equal(target?.cast?.spellId, kicks[0].spellId);
    for (const npc of [257691, 256804]) assert.equal(guide.adds.find(add => add.npcId === npc)?.cast, undefined);
    assert.deepEqual(mechanics.find(item => item.spellId === 1245727)?.counters, []);
  }
});

test('pool-clearing dispels are Heroic and healer only; tank mitigation stays tank only', () => {
  const miasma = guide.mechanics.find(item => item.spellId === 1257087)!;
  assert.equal(miasma.heroicOnly, true);
  assert.deepEqual(miasma.counters, ['magic']);
  assert.deepEqual(miasma.counterRoles, ['healer']);
  assert.deepEqual(guide.mechanics.find(item => item.spellId === 1262020)?.counterRoles, ['tank']);
  for (const spec of guideSpecs) {
    const role = guideRole(spec.id)!;
    assert.ok(guide.roles[role].position.ru && guide.roles[role].position.en);
  }
  assert.ok(!guide.mechanics.some(item => [1264780, 1264756].includes(item.spellId)), 'No Mythic realm-swap mechanic in the N/H guide');
});

test('realm and priority navigation resolve, and exact NPC portraits and spell art exist', () => {
  assert.deepEqual(guide.realmPlan.realms.map(realm => realm.id), ['aln', 'reality']);
  assert.equal(guide.realmPlan.rotation.length, 2);
  for (const priority of guide.priorities) assert.ok(guide.mechanics.some(mechanic => mechanic.id === priority.id && !mechanic.heroicOnly));
  assert.equal(new Set(guide.mechanics.map(item => item.id)).size, guide.mechanics.length);
  assert.deepEqual(guide.adds.map(add => add.npcId).sort(), [256803, 256804, 257691]);
  for (const add of guide.adds) {
    assert.ok(add.portrait?.endsWith(`/${add.npcId}.webp`));
    assert.ok(existsSync(new URL(`../../public${add.portrait}`, import.meta.url)));
  }
  for (const mechanic of guide.mechanics) if (mechanic.spellIcon) assert.ok(existsSync(new URL(`../../public${mechanic.spellIcon}`, import.meta.url)));
});
