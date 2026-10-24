import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBuildLibrary, mergeBuildLibraries, parseBuildLibrary, recoverLegacyCharacterBuilds } from '../../lib/wow/talentBuildLibrary.ts';
import { decodeWoWTalentLoadout } from '../../lib/wowTalentLoadout.ts';
import type { TalentCalculatorData } from '../../lib/talentCalculatorData.ts';
const build = (id: string, savedAt = '2026-10-19T09:00:00.000Z') => ({ id, savedAt, name: id, loadout: 'code', buildVersion: '12.1.5', scenario: 'raid' });
test('legacy migration keeps every existing build, including libraries above the new creation limit', () => {
  assert.equal(parseBuildLibrary(Array.from({length: 15}, (_, i) => build(String(i)))).builds.length, 15);
});
test('deletion wins against stale offline updates, even with a later device clock', () => {
  const a = { ...emptyBuildLibrary(), deleted: { one: '2026-10-19T09:01:00Z' } };
  const b = { ...emptyBuildLibrary(), builds: [build('one', '2027-01-01T00:00:00Z'), build('two')] };
  assert.deepEqual(mergeBuildLibraries(a, b).builds.map(b => b.id), ['two']);
  assert.deepEqual(mergeBuildLibraries(a, b), mergeBuildLibraries(b, a));
});
test('concurrent edits converge and independent additions are preserved', () => {
  const a = { ...emptyBuildLibrary(), builds: [build('one'), build('two')] };
  const b = { ...emptyBuildLibrary(), builds: [{...build('one', '2026-10-19T09:02:00.000Z'), name:'Renamed'}, build('three')] };
  const merged = mergeBuildLibraries(a, b);
  assert.equal(merged.builds.length, 3); assert.equal(merged.builds[0].name, 'Renamed');
  assert.deepEqual(merged, mergeBuildLibraries(b, a));
});
test('truncated talent headers and malformed codes are rejected before reading a tree', () => {
  const headerOnly = {specId: 72} as TalentCalculatorData;
  assert.equal(decodeWoWTalentLoadout(headerOnly, 'CgE'), null);
  assert.equal(decodeWoWTalentLoadout(headerOnly, 'bad code!'), null);
});
test('legacy recovery preserves versions and only reads the selected real character and spec', () => {
  const prefix = 'gildra:character-talents:build-library:v2:';
  const values = new Map([
    [prefix + 'battle-net:eu--realm--name:fury-warrior:12.1', JSON.stringify([build('old')])],
    [prefix + 'battle-net:eu--realm--name:fury-warrior:12.1.5', JSON.stringify(Array.from({ length: 13 }, (_, i) => build(String(i))))],
    [prefix + 'battle-net:us--realm--name:fury-warrior:12.1', JSON.stringify([build('other-region')])],
    [prefix + 'fixture:eu--realm--name:fury-warrior:12.1', JSON.stringify([build('fixture')])],
    [prefix + 'battle-net:eu--realm--name:arms-warrior:12.1', JSON.stringify([build('other-spec')])],
    [prefix + 'battle-net:eu--realm--name:fury-warrior:broken', '{bad'],
  ]);
  const storage = { length: values.size, key: (i: number) => [...values.keys()][i], getItem: (key: string) => values.get(key) ?? null };
  const recovered = recoverLegacyCharacterBuilds(storage, 'eu--realm--name', 'fury-warrior');
  assert.equal(recovered.length, 14);
  assert.ok(recovered.some(record => record.id === 'old'));
  assert.equal(values.size, 6);
});
