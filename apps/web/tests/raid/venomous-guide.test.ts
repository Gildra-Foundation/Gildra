import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { venomousGuide } from '../../lib/data/wow/raid/venomousGuide';
import { guideRole, guideSpecs } from '../../components/wow/raid/voidspireGuideCounters';

const boss = (id: string) => venomousGuide.bosses.find(item => item.id === id)!;

test('all eight Normal/Heroic guide graphs resolve with real assets and every specialization role', () => {
  assert.deepEqual(venomousGuide.bosses.map(item => item.id), [
    'nekzali-the-soulcoiler', 'entombed-sentinels', 'the-lost-explorers', 'vashnik-the-malignant',
    'sszorak', 'the-twin-fangs', 'the-coiled-altar', 'ulatek',
  ]);
  for (const item of venomousGuide.bosses) {
    assert.equal(new Set(item.mechanics.map(mechanic => mechanic.id)).size, item.mechanics.length);
    assert.equal(item.priorities.length, 3);
    for (const priority of item.priorities) assert.ok(item.mechanics.some(mechanic => mechanic.id === priority.id && !mechanic.heroicOnly), `${item.id}/${priority.id} must be reachable in Normal`);
    for (const spec of guideSpecs) {
      const role = item.roles[guideRole(spec.id)!];
      assert.ok(role.position.ru && role.position.en && role.actions.length);
    }
    assert.ok(item.sources.some(source => /^https:\/\/(www\.)?wowhead\.com\/(npc=|spell=|dungeon-journal\/)/.test(source.url)), `${item.id} needs primary journal evidence`);
    if (item.image) assert.ok(existsSync(new URL(`../../public${item.image}`, import.meta.url)));
    for (const mechanic of item.mechanics) {
      if (mechanic.spellIcon) assert.ok(existsSync(new URL(`../../public${mechanic.spellIcon}`, import.meta.url)));
      if (mechanic.targetId) assert.ok(item.adds.some(add => add.id === mechanic.targetId));
    }
    for (const add of item.adds) if (add.portrait) {
      assert.ok(add.portrait.endsWith(`/${add.npcId}.webp`));
      assert.ok(existsSync(new URL(`../../public${add.portrait}`, import.meta.url)));
    }
  }
});

test('personal interrupt buttons resolve actual casters in the selected difficulty, never kill-only slimes', () => {
  for (const heroic of [false, true]) for (const item of venomousGuide.bosses) {
    for (const mechanic of item.mechanics.filter(value => (heroic || !value.heroicOnly) && value.counters.includes('interrupt'))) {
      const target = item.adds.find(add => add.id === mechanic.targetId);
      assert.ok(target, `${item.id}/${mechanic.id} requires an exact target`);
      assert.equal(target.cast?.spellId, mechanic.spellId);
      assert.ok(heroic || !target.heroicOnly, 'Normal must not offer interrupts against Heroic-only adds');
    }
  }
  const iku = boss('the-lost-explorers').adds.find(add => add.id === 'iku')!;
  assert.equal(iku.npcId, 262173, 'Use the current encounter NPC, not the older 261843 variant');
  assert.equal(iku.cast?.spellId, 1286921);
  for (const id of ['nekzali-the-soulcoiler', 'entombed-sentinels', 'vashnik-the-malignant']) {
    assert.ok(boss(id).mechanics.every(mechanic => !mechanic.counters.includes('interrupt')));
  }
  assert.deepEqual(boss('vashnik-the-malignant').mechanics.find(item => item.spellId === 1291530)?.counters, [], 'Large blood slimes are immune to crowd control');
  const dispels = venomousGuide.bosses.slice(0, 4).flatMap(item => item.mechanics).filter(item => item.counters.includes('magic'));
  assert.deepEqual(dispels.map(item => item.spellId).sort(), [1284471, 1287426, 1295173].sort());
  assert.ok(dispels.every(item => item.counterRoles.length === 1 && item.counterRoles[0] === 'healer'));
});

test('current journal difficulty flags keep Heroic additions and Mythic mechanics out of Normal', () => {
  for (const [slug, spell] of [
    ['nekzali-the-soulcoiler', 1289875], ['entombed-sentinels', 1284207],
    ['the-lost-explorers', 1297646], ['vashnik-the-malignant', 1282525],
  ] as const) assert.equal(boss(slug).mechanics.find(item => item.spellId === spell)?.heroicOnly, true);
  assert.ok(!boss('nekzali-the-soulcoiler').mechanics.find(item => item.spellId === 1289855)?.heroicOnly, 'The shared pyre exists in Normal');
  assert.ok(!boss('the-lost-explorers').mechanics.some(item => item.spellId === 1313126), 'Shared explorer health belongs to LFR, not Normal/Heroic');
  assert.ok(!boss('entombed-sentinels').mechanics.some(item => item.spellId === 1296878), 'Shifting Protovenom belongs to Mythic');
  assert.ok(!venomousGuide.bosses.slice(0, 4).flatMap(item => item.adds).some(add => [268204, 269430].includes(add.npcId)), 'Do not introduce Mythic Drowned Echo or malignant totems');
});

test('later encounters retain current hotfix conditions and difficulty-specific interrupt targets', () => {
  const altar = boss('the-coiled-altar');
  const wail = altar.mechanics.find(item => item.spellId === 1286399)!;
  assert.equal(wail.heroicOnly, true);
  const soulcoiler = altar.adds.find(add => add.id === wail.targetId)!;
  assert.equal(soulcoiler.npcId, 261521);
  assert.equal(soulcoiler.heroicOnly, true);
  const ulatek = boss('ulatek');
  for (const [npcId, spellId] of [[264045, 1290779], [269200, 1305650], [273577, 1310764]]) {
    const add = ulatek.adds.find(item => item.npcId === npcId)!;
    assert.equal(add.cast?.spellId, spellId);
    assert.ok(!add.heroicOnly);
    assert.ok(ulatek.mechanics.some(item => item.targetId === add.id && item.spellId === spellId && !item.heroicOnly));
  }
  const claws = boss('sszorak').mechanics.find(item => item.spellId === 1305998)!;
  assert.equal(claws.heroicOnly, true);
  assert.match(claws.response.en, /no longer leave.*pools/i, 'September 15 removed lingering Heroic claw pools');
  const venom = boss('the-twin-fangs').mechanics.find(item => item.spellId === 1290336)!;
  assert.match(venom.heroic?.en ?? '', /10 stacks/i, 'Heroic lethal threshold is 10, not an outdated lower count');
  const fangs = ulatek.mechanics.find(item => item.spellId === 1301117)!;
  assert.match(fangs.heroic?.en ?? '', /4 seconds/i, 'October 6 shortened Heroic Blight Vein');
  const bite = ulatek.mechanics.find(item => item.spellId === 1295905)!;
  assert.match(bite.response.en, /no more than three/i, 'October 6 reduced required helpers to at most three');
});
