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

const { readFileSync, existsSync } = await import('node:fs');
const catalogue = JSON.parse(readFileSync(new URL('../../data/wow/mythic-reviews/combat.json', import.meta.url)));
const maps = JSON.parse(readFileSync(new URL('../../data/wow/mythic-reviews/mdt.json', import.meta.url)));
const publicRoot = new URL('../../public/', import.meta.url);

test('all eight MDT rosters have ID-bound tactics or explicit event instructions and real local media', () => {
 assert.deepEqual(Object.keys(catalogue).sort(), Object.keys(maps).sort());
 for (const [slug, review] of Object.entries(catalogue)) {
  const byId = new Map(review.enemies.map(enemy => [enemy.npcId, enemy]));
  assert.equal(byId.size, review.enemies.length, slug);
  for (const member of maps[slug].nodes) {
   const enemy = byId.get(member.npcId);
   assert(enemy, `${slug}: missing NPC ${member.npcId}`);
   assert(enemy.abilities.length || (enemy.note?.ru && enemy.note?.en), enemy.name.en);
   assert(existsSync(new URL(enemy.portraitUrl.slice(1), publicRoot)), enemy.portraitUrl);
   for (const spell of enemy.abilities) {
    assert(spell.response.ru.length > 8 && spell.response.en.length > 8, spell.name.en);
    assert.equal(spell.url, `https://www.wowhead.com/spell=${spell.spellId}`);
    assert(existsSync(new URL(spell.iconUrl.slice(1), publicRoot)), spell.iconUrl);
   }
  }
 }
});

test('reviewed pulls ignore contradictory legacy steps and never borrow another NPC identity', () => {
 const review = catalogue['ruby-life-pools'];
 const result = buildMdtPullIntel([node('Storm Warrior', 197982)], [step(['Storm Warrior'], [ability('Wrong Stun', 'Storm Warrior', 'Стоп')])], intel({ reviewed: review }), 'en');
 assert(result.mechanics.some(m => m.spellId === 1307476 && m.action === 'Защита'));
 assert(!result.mechanics.some(m => m.name === 'Wrong Stun'));
 assert.deepEqual(result.roleNotes, { tank: [], healer: [], dps: [] });
 const unknown = buildMdtPullIntel([node('Storm Warrior', 999999)], [], intel({ reviewed: review }));
 assert.equal(unknown.enemies[0].covered, false);
 assert.equal(unknown.mechanics.length, 0);
 assert.equal(unknown.checkedAt, undefined);
});

test('important current counters distinguish interrupts, crowd control, dispels and tank soaks', () => {
 const enemy = (slug, id) => catalogue[slug].enemies.find(e => e.npcId === id);
 const spell = (slug, npc, id) => enemy(slug, npc).abilities.find(s => s.spellId === id);
 assert.equal(spell('altar-of-fangs', 261554, 1294569).action, 'dispel');
 assert.equal(spell('altar-of-fangs', 261557, 1306385).action, 'stop');
 assert.equal(spell('altar-of-fangs', 261560, 1294557).action, 'interrupt');
 assert.equal(spell('den-of-nalorakk', 246404, 1297797).role, 'tank');
 assert.match(spell('den-of-nalorakk', 241813, 1241217).response.en, /armor/);
 assert.match(spell('ruby-life-pools', 190207, 373693).response.en, /dispelling prevent/);
 assert.match(spell('the-blinding-vale', 245912, 1241058).response.en, /full health/);
 assert.match(enemy('temple-of-sethraliss', 133392).note.en, /healer heals the Avatar/);
});

test('all authored pulls and Temple spawn groups remain complete in both languages', () => {
 for (const [slug, data] of Object.entries(maps)) {
  const byNode = new Map(data.nodes.map(n => [n.id, n]));
  const groups = data.route.pulls.length ? data.route.pulls.map(ids => ids.map(id => byNode.get(id))) : [...Map.groupBy(data.nodes, n => `${n.floor}:${n.group}`).values()];
  for (const members of groups) for (const locale of ['ru', 'en']) {
   const result = buildMdtPullIntel(members, [], intel({ reviewed: catalogue[slug] }), locale);
   assert.equal(result.enemies.reduce((sum, e) => sum + e.count, 0), members.length);
   assert(result.enemies.every(e => e.covered));
   assert(result.checkedAt);
   assert(result.mechanics.length || result.enemies.some(e => e.note));
   assert(result.mechanics.every(m => m.response && m.iconUrl && members.some(n => n.npcId === m.npcId)));
  }
 }
});
