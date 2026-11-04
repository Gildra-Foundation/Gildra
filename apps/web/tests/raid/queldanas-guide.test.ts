import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { queldanasGuide } from '../../lib/data/wow/raid/queldanasGuide';
import { guideRole, guideSpecs } from '../../components/wow/raid/voidspireGuideCounters';

const beloren = queldanasGuide.bosses.find(boss => boss.id === 'beloren')!;
const lura = queldanasGuide.bosses.find(boss => boss.id === 'midnight-falls')!;

test('both difficulties bind each interrupt to the actual caster, including opposite-colour ember targets', () => {
  for (const heroic of [false, true]) {
    for (const boss of queldanasGuide.bosses) {
      const mechanics = boss.mechanics.filter(item => heroic || !item.heroicOnly);
      for (const mechanic of mechanics.filter(item => item.counters.includes('interrupt'))) {
        const target = boss.adds.find(add => add.id === mechanic.targetId);
        assert.ok(target, `${mechanic.id} must resolve to an enemy`);
        assert.equal(target.cast?.spellId, mechanic.spellId);
        assert.ok(!target.heroicOnly, 'These interrupt targets exist in Normal as well');
      }
    }
  }
  for (const [npc, spell, feather] of [[246729, 1243852, 'Light Feather'], [246728, 1243854, 'Void Feather']] as const) {
    const target = beloren.adds.find(add => add.npcId === npc)!;
    assert.equal(target.cast?.spellId, spell);
    assert.ok(target.cast.action.en.includes(feather), 'The personal interrupt hint must preserve the feather condition');
    assert.ok(target.cast.action.ru.includes(npc === 246729 ? 'Перо Света' : 'Перо Бездны'));
  }
  assert.equal(lura.adds.find(add => add.cast)?.npcId, 264170);
  assert.equal(lura.adds.find(add => add.cast)?.cast?.spellId, 1251392);
  assert.ok(lura.mechanics.every(item => !item.counters.includes('magic')), 'Offensive purge must not suggest a friendly magic dispel');
  for (const npc of [250615, 250616, 251180]) assert.equal(lura.adds.find(add => add.npcId === npc)?.cast, undefined);
});

test('Normal excludes Heroic quills, crystal tears and siphon, while preserving shared phase objectives', () => {
  assert.deepEqual(beloren.mechanics.filter(item => item.heroicOnly).map(item => item.spellId), [1242260]);
  assert.deepEqual(lura.mechanics.filter(item => item.heroicOnly).map(item => item.spellId).sort(), [1254262, 1266897]);
  for (const boss of queldanasGuide.bosses) {
    const normal = boss.mechanics.filter(item => !item.heroicOnly);
    for (const priority of boss.priorities) assert.ok(normal.some(mechanic => mechanic.id === priority.id));
    for (const spec of guideSpecs) {
      const role = boss.roles[guideRole(spec.id)!];
      assert.ok(role.position.ru && role.position.en && role.actions.length);
    }
  }
  const beams = lura.mechanics.find(item => item.spellId === 1284525)!;
  assert.ok(beams.heroic?.ru && beams.heroic.en, 'Heroic beam sharing must remain difficulty-specific');
  assert.deepEqual(lura.mechanics.find(item => item.spellId === 1263970)?.counterRoles, ['tank']);
  assert.ok(!lura.adds.some(add => add.npcId === 260906), 'Mythic Termination Matrix is not the N/H target');
  assert.ok(!lura.mechanics.some(item => [1284931, 1284980, 1274455, 1273158].includes(item.spellId)), 'No Mythic prism, realm split or rune replacement');
});

test('both boss navigation graphs resolve and assets distinguish portraits from ability icons', () => {
  assert.deepEqual(queldanasGuide.bosses.map(boss => boss.id), ['beloren', 'midnight-falls']);
  for (const boss of queldanasGuide.bosses) {
    assert.equal(new Set(boss.mechanics.map(item => item.id)).size, boss.mechanics.length);
    assert.ok(existsSync(new URL(`../../public${boss.image}`, import.meta.url)));
    assert.ok(boss.sources.some(source => source.url.startsWith('https://www.wowhead.com/npc=')));
    for (const mechanic of boss.mechanics) if (mechanic.spellIcon) assert.ok(existsSync(new URL(`../../public${mechanic.spellIcon}`, import.meta.url)));
    for (const add of boss.adds) if (add.portrait) {
      assert.ok(add.portrait.endsWith(`/${add.npcId}.webp`));
      assert.ok(existsSync(new URL(`../../public${add.portrait}`, import.meta.url)));
    }
  }
  assert.equal(beloren.adds.filter(add => add.portrait).length, 2);
  assert.ok(lura.adds.every(add => !add.portrait), 'Rejected transparent thumbnails must not masquerade as portraits');
});
