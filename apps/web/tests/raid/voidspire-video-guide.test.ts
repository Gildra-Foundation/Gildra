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
