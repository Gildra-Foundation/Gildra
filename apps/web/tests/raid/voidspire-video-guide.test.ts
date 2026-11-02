import test from 'node:test';
import assert from 'node:assert/strict';
import { readGuideSelection, guideHash } from '../../components/wow/raid/voidspireGuideState';
import { guideCounters } from '../../components/wow/raid/voidspireGuideCounters';
import { raidBossGuideHref } from '../../components/wow/raid/raidBossGuideHref';
import { voidspireVideoGuides } from '../../lib/data/wow/raid/voidspireVideoGuide';

test('boss deep links never select a trash pull; malformed state safely falls back', () => {
  for (const boss of voidspireVideoGuides) {
    const selection = readGuideSelection(guideHash({boss:boss.slug, difficulty:'normal', specId:62}));
    assert.equal(selection.boss, boss.slug);
    assert.equal(selection.specId, 62);
    assert.equal(selection.difficulty, boss.heroicOnly ? 'heroic' : 'normal');
  }
  assert.equal(readGuideSelection('#boss=missing&difficulty=mythic&spec=999').boss, 'imperator-averzian');
  assert.equal(readGuideSelection('#spec=999').specId, 0);
  assert.equal(readGuideSelection('#raid-pull=entrance').boss, 'trash');
});
test('healer magic dispels never leak into non-healer kits', () => {
  assert.ok(guideCounters('magic', 270).some(tool => tool.spell.id === 115450));
  assert.deepEqual(guideCounters('magic', 269), []);
  assert.ok(guideCounters('magic', 264).some(tool => tool.spell.id === 77130));
  assert.deepEqual(guideCounters('magic', 262), []);
  assert.deepEqual(guideCounters('magic', 62), []);
});
test('interrupts respect spec and pet restrictions; stuns exclude knockbacks', () => {
  assert.deepEqual(guideCounters('interrupt', 62).map(tool => tool.spell.id), [2139]);
  assert.ok(guideCounters('interrupt', 266).some(tool => tool.spell.id === 89766 && tool.note));
  assert.ok(!guideCounters('stun', 1467).some(tool => tool.spell.id === 357214));
});
test('AoE-only Feint is not offered for a general defensive mechanic', () => {
  assert.ok(!guideCounters('defend', 259).some(tool => tool.spell.id === 1966));
  assert.ok(guideCounters('aoe', 259).some(tool => tool.spell.id === 1966));
});
test('shield, heal absorbs and enemy stuns have distinct answers', () => {
  const vanguard = voidspireVideoGuides.find(item => item.slug === 'lightblinded-vanguard')!;
  assert.deepEqual(vanguard.mechanics.find(item => item.id === 'shield')!.counters, ['interrupt']);
  assert.equal(vanguard.mechanics.find(item => item.id === 'tyr')!.counters, undefined);
  const crown = voidspireVideoGuides.find(item => item.slug === 'crown-of-the-cosmos')!;
  assert.ok(crown.heroicOnly);
  assert.ok(!crown.mechanics.some(item => item.counters?.includes('magic') || item.counters?.includes('interrupt')));
});

test('map and pull boss links remain in the raid document in both locales', () => {
  for (const locale of ['ru', 'en'] as const) {
    const prefix = locale === 'ru' ? '/ru' : '';
    for (const boss of voidspireVideoGuides) assert.equal(raidBossGuideHref('the-voidspire', boss.slug, locale), `${prefix}/wow/raids/the-voidspire#boss=${boss.slug}`);
    assert.equal(raidBossGuideHref('the-dreamrift', 'chimaerus', locale), `${prefix}/wow/raids/the-dreamrift/chimaerus`);
  }
});

test('every specialization has a position role, including ranged Devourer and melee Survival', async () => {
  const {guideRole, guideSpecs} = await import('../../components/wow/raid/voidspireGuideCounters');
  assert.equal(guideSpecs.length, 40);
  assert.equal(guideRole(0), undefined);
  assert.equal(guideRole(1480), 'ranged');
  assert.equal(guideRole(255), 'melee');
  assert.equal(guideRole(1467), 'ranged');
  assert.equal(guideRole(65), 'healer');
  assert.equal(guideRole(66), 'tank');
  for (const spec of guideSpecs) assert.ok(['tank','healer','melee','ranged'].includes(guideRole(spec.id)!));
});
test('every boss covers all four roles and role actions reference actual mechanics', async () => {
  const {voidspireRolePositions, voidspireRoleActions} = await import('../../lib/data/wow/raid/voidspireRoleTactics');
  for (const boss of voidspireVideoGuides) {
    for (const role of ['tank','healer','melee','ranged'] as const) {
      assert.ok(voidspireRolePositions[boss.slug][role].ru);
      assert.ok(voidspireRolePositions[boss.slug][role].en);
    }
    for (const id of Object.keys(voidspireRoleActions[boss.slug])) assert.ok(boss.mechanics.some(m => m.id === id));
  }
});
test('every kick names the caster and correct interruptible cast, not the summon or shield', async () => {
  const {voidspireInterruptTargets: targets} = await import('../../lib/data/wow/raid/voidspireInterruptTargets');
  for (const boss of voidspireVideoGuides) for (const mechanic of boss.mechanics) {
    if (mechanic.counters?.includes('interrupt')) {
      const target = targets[boss.slug][mechanic.id];
      assert.ok(target.enemies.length && target.timing.ru && target.timing.en);
    }
  }
  assert.equal(targets['vaelgor-ezzorak'].adds.spellId, 1245175);
  assert.equal(targets['lightblinded-vanguard'].shield.spellId, 1258514);
  assert.equal(targets['fallen-king-salhadaar'].images.spellId, 1254088);
  const salhadaar = voidspireVideoGuides.find(b => b.slug === 'fallen-king-salhadaar')!;
  assert.equal(salhadaar.mechanics.find(m => m.id === 'marks')!.spellId, 1260835);
});


test('tank-only mitigation advice is scoped to tanks, without hiding shared survival mechanics', () => {
  const boss = (slug: string) => voidspireVideoGuides.find(item => item.slug === slug)!;
  for (const [slug, id] of [['imperator-averzian','wounds'], ['vorasius','tank'], ['fallen-king-salhadaar','swap'], ['vaelgor-ezzorak','swap'], ['lightblinded-vanguard','judgment']]) {
    assert.deepEqual(boss(slug).mechanics.find(m => m.id === id)!.counterRoles, ['tank']);
  }
  assert.equal(boss('vaelgor-ezzorak').mechanics.find(m => m.id === 'gloom')!.counterRoles, undefined);
});

test('all forty spec portraits resolve to distinct existing game assets', async () => {
  const { guideSpecs } = await import('../../components/wow/raid/voidspireGuideCounters');
  const { voidspireSpecIcon } = await import('../../components/wow/raid/voidspireSpecIcons');
  const { existsSync } = await import('node:fs');
  const icons = guideSpecs.map(spec => voidspireSpecIcon(spec.id));
  assert.equal(new Set(icons).size, 40);
  for (const icon of icons) {
    assert.ok(icon?.startsWith('/assets/specs/'), `Expected specialization portrait: ${icon}`);
    assert.ok(existsSync(new URL(`../../public${icon}`, import.meta.url)));
  }
});
