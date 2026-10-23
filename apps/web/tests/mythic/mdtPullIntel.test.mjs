import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMdtPullIntel } from '../../components/wow/mythic/mdtPullIntel.ts';

const node = (name, npcId = 1, id = name) => ({ id, npcId, name, x: 10, y: 20, floor: 1, group: '1', forces: 4, boss: false });
const step = (enemies, abilities, extra = {}) => ({ id: 1, title: 'Draft step', subtitle: '', x: 80, y: 80, floor: 2, kind: 'pull', duration: 60, forces: 10, cumulative: 10, enemies: enemies.map(name => ({ name, count: 9, priority: 'high' })), abilities, callouts: [], summary: '', tank: 'Face the caster away.', healer: 'Dispel its poison.', dps: 'Interrupt Fireball.', ...extra });
const ability = (name, source, action = 'Кик', target = 'ShadowNova') => ({ name, source, action, target });
const intel = (extra = {}) => ({ enemies: {}, abilities: {}, review: { checkedAt: '2026-10-21', facts: [], corrections: [] }, ...extra });

test('pull membership, not ordinal or coordinates, determines casts and actual counts', () => {
 const result = buildMdtPullIntel([node('Caster'), node('Caster', 1, 'clone-2')], [step(['Other'], [ability('Wrong Spell', 'Other')]), step(['Caster'], [ability('Fireball', 'Caster')])], intel());
 assert.deepEqual(result.enemies, [{ name: 'Caster', count: 2, covered: true }]);
 assert.deepEqual(result.mechanics.map(m => m.name), ['Fireball']);
 assert.deepEqual(result.roleNotes.tank, ['Face the caster away.']);
});

test('a matching enemy never imports abilities or whole-step advice for missing neighbours', () => {
 const result = buildMdtPullIntel([node('Caster')], [step(['Caster', 'Boss'], [ability('Fireball', 'Caster'), ability('Boss Only', 'Boss'), ability('No Caster')])], intel());
 assert.deepEqual(result.mechanics.map(m => m.name), ['Fireball']);
 assert.deepEqual(result.roleNotes, { tank: [], healer: [], dps: [] });
});

test('no approximate Guardian matching and no inference for unknown source', () => {
 const result = buildMdtPullIntel([node('Earthbound Guardian')], [step(['Guardian'], [ability('Unrelated', 'Guardian')]), step(['Earthbound Guardian'], [ability('Unknown')])], intel());
 assert.equal(result.mechanics.length, 0);
});

test('verified NPC IDs can bridge a renamed enemy; unverified IDs cannot', () => {
 const members = [node('New Caster', 42)];
 const stops = [step(['Old Caster'], [ability('Fireball', 'Old Caster')])];
 const yes = buildMdtPullIntel(members, stops, intel({ enemies: { 'Old Caster': { media: { npcId: 42, identityVerified: true } } } }));
 assert.equal(yes.mechanics[0].source, 'New Caster');
 const no = buildMdtPullIntel(members, stops, intel({ enemies: { 'Old Caster': { media: { npcId: 42 } } } }));
 assert.equal(no.mechanics.length, 0);
});

test('known source corrections suppress conflicting draft casts and role notes', () => {
 const facts = [{ ru: 'Thunder Stomper — мгновенный урон.', en: 'Thunder Stomper is instant damage around Storm Warrior.', source: 'https://example.test/spell' }];
 const result = buildMdtPullIntel([node('Storm Warrior')], [step(['Storm Warrior'], [ability('Thunder Stomper', 'Storm Warrior', 'Стоп')])], intel({ review: { checkedAt: '2026-10-21', facts, corrections: [{ en: 'Replace the Thunder Stomper stop action with mitigation/healing.', ru: '' }] } }));
 assert.equal(result.mechanics.length, 0);
 assert.deepEqual(result.roleNotes.tank, []);
 assert.equal(result.hasConflicts, true);
 assert.deepEqual(result.facts, facts);
});

test('reuse explicit source metadata, preserve missing coverage and immutable input', () => {
 const members = [node('Caster'), node('Unknown', 2)];
 const stops = [step(['Caster'], [{ name: 'Fireball', action: 'Кик', target: 'ShadowNova' }])];
 const data = intel({ abilities: { Fireball: { source: 'Caster' } } });
 const before = JSON.stringify({ members, stops, data });
 const result = buildMdtPullIntel(members, stops, data);
 assert.equal(result.mechanics[0].name, 'Fireball');
 assert.equal(result.enemies[1].covered, false);
 assert.equal(JSON.stringify({ members, stops, data }), before);
});

test('empty pull is an honest empty result', () => {
 const result = buildMdtPullIntel([], [step(['Caster'], [ability('Fireball', 'Caster')])], intel());
 assert.deepEqual(result.enemies, []);assert.deepEqual(result.mechanics, []);assert.deepEqual(result.facts, []);
});
