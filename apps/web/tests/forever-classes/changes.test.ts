import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchesChanges, pageNumber, classSpellPath, type ClassChange } from '../../data/wow/forever/classes/model.ts';
import { diffWords } from '../../data/wow/forever/classes/diff.ts';
import { foreverClasses } from '../../data/wow/forever/classes/roster.ts';
import { classHighlights } from '../../data/wow/forever/classes/highlights.ts';
const snapshot = JSON.parse(readFileSync(new URL('../../data/wow/forever/classes/changes.json', import.meta.url), 'utf8'));
const rows: ClassChange[] = snapshot.records;
const evidence = JSON.parse(readFileSync(new URL('../../data/wow/forever/classes/evidence.json', import.meta.url), 'utf8'));

test('nine Classic classes only, isolated Forever snapshot and versioned spell baseline', () => {
  assert.equal(snapshot.edition, 'forever'); assert.equal(snapshot.build, '1.60.1.70862');
  assert.equal(snapshot.spellBaselineBuild, '1.15.9.69722');
  assert.deepEqual(foreverClasses.map(c => c.id).sort((a,b) => a-b), [1,2,3,4,5,7,8,9,11]);
  assert.equal(new Set(rows.map(r => r.key)).size, rows.length);
  for (const c of foreverClasses) {
    const own = rows.filter(r => r.classSlug === c.slug);
    for (const kind of ['talent', 'spellbook']) assert.ok(own.some(r => r.kind === kind), `${c.slug}: ${kind}`);
    for (const status of ['added', 'changed', 'removed']) assert.ok(own.some(r => r.status === status), `${c.slug}: ${status}`);
    assert.equal(evidence.inventory[c.slug].missingSpells.length, 0);
  }
});
test('Classic talent baselines are first rank only; removed talents never link to a current spell', () => {
  for (const row of rows) for (const rank of row.ranks) {
    if (rank.before) assert.ok(rank.baseline, row.key);
    if (row.kind === 'talent' && rank.before) {
      assert.equal(rank.rank, 1, row.key);
      assert.equal(rank.baseline, 'classic-era-rank1');
    }
    if (row.status === 'removed') {
      assert.equal(row.kind, 'talent'); assert.equal(rank.after, undefined); assert.equal(classSpellPath(rank.spellId), null);
    }
    if (row.status === 'added') assert.equal(rank.before, undefined, row.key);
  }
});
test('all current spell references are positive native IDs; no Retail fallback', () => {
  for (const row of rows.filter(r => r.status !== 'removed')) for (const rank of row.ranks) {
    assert.ok(rank.spellId && rank.spellId > 0);
    assert.match(classSpellPath(rank.spellId)!, /^\/wow\/forever\/library\/spell\/[1-9]\d*$/);
    assert.ok(rank.after, row.key);
  }
  for (const id of [undefined, 0, -1, NaN, Infinity, 1.5]) assert.equal(classSpellPath(id), null);
});
test('rank-specific native baseline: Shadow Bolt1 scales14→48.6%, not max-rank comparison', () => {
  const rank = rows.find(r => r.classSlug === 'warlock' && r.kind === 'spellbook' && r.name.en === 'Shadow Bolt')?.ranks.find(r => r.spellId === 686);
  assert.deepEqual(rank?.coefficient, { before: 0.14, after: 0.486 });
  assert.match(rank!.before!.en, /12 to 16/); assert.match(rank!.after!.en, /11 to 15/);
  assert.match(rank!.after!.ru, /11–15/);
});
test('existing Classic abilities are not mislabeled new because an added rank reused a name', () => {
  for (const row of rows.filter(r => r.kind === 'spellbook' && ['Holy Light','Flash of Light','Slam'].includes(r.name.en))) assert.equal(row.status, 'changed', row.name.en);
});
test('bilingual search, combined filters and empty results preserve class isolation', () => {
  const en = matchesChanges(rows, 'warrior', { q: 'Improved Rend', kind: 'talent' });
  const ru = matchesChanges(rows, 'warrior', { q: 'улучшенное кровопускание', kind: 'talent' });
  assert.ok(en.length); assert.deepEqual(en, ru);
  assert.equal(matchesChanges(rows, 'warrior', { q: 'zzzzzzz' }).length, 0);
  assert.ok(matchesChanges(rows, 'mage', { status: 'changed' }).every(r => ['changed','moved'].includes(r.status) && r.classSlug === 'mage'));
});
test('page inputs clamp safely and never produce an empty out-of-range page', () => {
  for (const v of ['-8','0','Infinity','1.1','nope',undefined]) assert.equal(pageNumber(v, 40), 1);
  assert.equal(pageNumber('999999',40), 3); assert.equal(pageNumber('9',0), 1);
});
test('word diff preserves both exact texts and isolates changed numbers', () => {
  const d = diffWords('Deals 12 to 16 damage.', 'Deals 11 to 15 damage.');
  assert.equal(d.before.map(t=>t.text).join(''), 'Deals 12 to 16 damage.');
  assert.equal(d.after.map(t=>t.text).join(''), 'Deals 11 to 15 damage.');
  assert.deepEqual(d.before.filter(t=>t.changed).map(t=>t.text), ['12','16']);
  assert.ok(diffWords('same','same').before.every(t=>!t.changed));
});
test('every original combat explanation resolves to a current talent with EN/RU gameplay text', () => {
  for (const c of foreverClasses) for (const h of classHighlights[c.slug]) {
    const row = rows.find(r => r.classSlug === c.slug && r.kind === 'talent' && r.name.en === h.talent && r.status !== 'removed');
    assert.ok(row, `${c.slug}: ${h.talent}`);
    assert.ok(h.text.ru && h.text.en && h.text.ru !== h.text.en);
  }
});

test('no identical before/after text is presented as a difference and every moved talent has a structural delta', () => {
  for (const row of rows) {
    for (const rank of row.ranks) {
      if (rank.before && rank.after) assert.notEqual(rank.before.en, rank.after.en, row.key);
      for (const text of Object.values(rank.after ?? {})) assert.doesNotMatch(text, /\$[a-zA-Z{]/, row.key);
    }
    if (row.status === 'moved') assert.ok(row.previousRow !== row.row || row.previousColumn !== row.column || row.previousTree !== row.tree.en || row.previousMaxRank !== row.ranks.length, row.key);
  }
});
