import test from 'node:test';
import assert from 'node:assert/strict';
import { readDungeonLocation } from './navigation.ts';

test('floor and encounter are independent URL state', () => {
  assert.deepEqual(readDungeonLocation('?q=kept&mapFloor=2#encounter-4'), { floor: 2, encounter: 4, mapFloor: undefined, route: undefined });
  assert.equal(readDungeonLocation('?mapFloor=1#map-floor-2').mapFloor, 2);
  assert.equal(readDungeonLocation('?mapFloor=2#route-3').route, 3);
});
test('malformed and zero anchors cannot select content', () => {
  for (const value of ['#encounter-0', '#encounter--1', '#encounter-2x', '#encounter-1%20', '#encounter-01']) assert.equal(readDungeonLocation(value).encounter, undefined);
  for (const value of ['?mapFloor=-1', '?mapFloor=0', '?mapFloor=1.5', '?mapFloor=NaN']) assert.equal(readDungeonLocation(value).floor, undefined);
  assert.equal(readDungeonLocation('#unrelated').encounter, undefined);
});
