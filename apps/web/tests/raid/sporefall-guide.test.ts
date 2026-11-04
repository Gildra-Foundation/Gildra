import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { sporefallGuide as guide } from '../../lib/data/wow/raid/sporefallGuide';
import { guideRole, guideSpecs } from '../../components/wow/raid/voidspireGuideCounters';

test('Normal has no caster assignment; Heroic binds Poison Burst to the exact Sporecap', () => {
  const normalAdds = guide.adds.filter(add => !add.heroicOnly);
  const normalMechanics = guide.mechanics.filter(mechanic => !mechanic.heroicOnly);
  assert.ok(!normalAdds.some(add => add.npcId === 238699 || add.cast));
  assert.ok(!normalMechanics.some(mechanic => mechanic.counters.includes('interrupt')));
  const interrupts = guide.mechanics.filter(mechanic => mechanic.counters.includes('interrupt'));
  assert.equal(interrupts.length, 1);
  assert.equal(interrupts[0].heroicOnly, true);
  assert.equal(interrupts[0].spellId, 1221714);
  const casters = guide.adds.filter(add => add.cast?.spellId === interrupts[0].spellId);
  assert.equal(casters.length, 1);
  assert.equal(casters[0].npcId, 238699);
  assert.equal(casters[0].heroicOnly, true);
});

test('mushroom kills do not offer interrupts or the adapter’s AoE defensive category', () => {
  const shroom = guide.adds.find(add => add.npcId === 238853);
  assert.ok(shroom && !shroom.heroicOnly && !shroom.cast);
  for (const spellId of [1221622, 1221965]) {
    const mechanic = guide.mechanics.find(entry => entry.spellId === spellId);
    assert.ok(mechanic);
    assert.deepEqual(mechanic.counters, []);
  }
  assert.deepEqual(guide.mechanics.find(entry => entry.spellId === 1221781)?.counterRoles, ['tank']);
});

test('priority links, all specialization roles and illustrated tooltip targets resolve', () => {
  assert.equal(new Set(guide.mechanics.map(mechanic => mechanic.id)).size, guide.mechanics.length);
  for (const priority of guide.priorities) {
    const target = guide.mechanics.find(mechanic => mechanic.id === priority.id);
    assert.ok(target && !target.heroicOnly, priority.id);
  }
  for (const spec of guideSpecs) {
    const role = guideRole(spec.id);
    assert.ok(role && guide.roles[role].position.ru && guide.roles[role].position.en);
  }
  for (const mechanic of guide.mechanics) {
    if (mechanic.spellIcon) {
      assert.equal(mechanic.spellIcon, `/assets/wow/raids/reviewed-spells/${mechanic.spellId}.jpg`);
      assert.ok(existsSync(new URL(`../../public${mechanic.spellIcon}`, import.meta.url)));
    }
  }
  for (const add of guide.adds) {
    if (add.portrait) {
      assert.ok(add.portrait.endsWith(`/${add.npcId}.webp`));
      assert.ok(existsSync(new URL(`../../public${add.portrait}`, import.meta.url)));
    }
  }
  for (const source of guide.sources) assert.equal(new URL(source.url).protocol, 'https:');
});
