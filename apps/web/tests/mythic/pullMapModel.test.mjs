import test from 'node:test';
import assert from 'node:assert/strict';
import { pullMapModel, pullPosition } from '../../components/wow/mythic/pullMapModel.ts';
const node = (id, floor = 1, group = 1, x = 10, y = 20, boss = false) => ({ id, floor, group, x, y, boss, npcId: 1, name: 'Enemy', forces: 4 });
const data = (nodes, pulls, status = 'dataset-matched') => ({ nodes, route: { status, pulls } });
test('a matched route preserves authored membership/order without mutating source coordinates', () => {
 const input = data([node('a'), node('b', 2, 1, 80, 60)], [['b'], ['a']]);
 const before = JSON.stringify(input); const model = pullMapModel(input);
 assert.equal(model.authored, true); assert.deepEqual(model.pulls.map(p => p.map(n => n.id)), [['b'], ['a']]);
 assert.deepEqual(model.floors, [1,2]); assert.equal(JSON.stringify(input), before);
});
test('an incompatible import never presents its order or combines spawn groups across floors', () => {
 const model = pullMapModel(data([node('a'), node('b', 2), node('c')], [['b','a']], 'incompatible'));
 assert.equal(model.authored, false); assert.deepEqual(model.pulls.map(p => p.map(n => n.id)), [['a','c'], ['b']]);
});
test('empty route uses honest spawn groups and unknown route IDs produce no empty choices', () => {
 assert.equal(pullMapModel(data([node('a')], [])).authored, false);
 assert.deepEqual(pullMapModel(data([node('a')], [['missing'], ['a']])).pulls.map(p => p.map(n => n.id)), [['a']]);
 assert.deepEqual(pullMapModel(data([], [])).pulls, []);
});
test('each floor retains its original centroid, local count and boss marker', () => {
 const members = [node('a', 1, 1, 10, 20, true), node('b', 1, 1, 30, 40, true), node('c', 2, 1, 90, 90)];
 assert.deepEqual(pullPosition(members, 1), { x:20, y:30, count:2, boss:true });
 assert.deepEqual(pullPosition(members, 2), { x:90, y:90, count:1, boss:false });
 assert.equal(pullPosition(members, 3), null);
});
