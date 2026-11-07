import test from "node:test";
import assert from "node:assert/strict";
import { newDungeons, returningDungeons, foreverRaids } from "../../components/wow/forever/instanceData.ts";

test("catalog preserves official new dungeon bands and raid sizes", () => {
  assert.equal(newDungeons.length, 9);
  assert.equal(returningDungeons.length, 19);
  assert.equal(new Set(newDungeons.map(d => d.name)).size, 9);
  assert.ok(newDungeons.every(d => d.min >= 13 && d.min <= d.max && d.max <= 60));
  assert.deepEqual(foreverRaids.map(r => [r.players, r.bosses]), [[10,8],[20,13],[40,1]]);
});
