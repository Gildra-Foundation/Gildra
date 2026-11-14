import test from "node:test";
import assert from "node:assert/strict";
import { matchesSearch, matchesLevel } from "../../components/wow/forever/foreverFilters.ts";
import { instanceName } from "../../components/wow/forever/instanceLocalization.ts";
import { newDungeons, returningDungeonDetails } from "../../components/wow/forever/instanceData.ts";

test("all 28 dungeons remain unique and searchable by English and verified Russian names", () => {
  const rows = [...newDungeons, ...returningDungeonDetails];
  assert.equal(new Set(rows.map(row => row.slug)).size, 28);
  for (const row of returningDungeonDetails) {
    const ru = instanceName(row.name, "ru");
    assert.notEqual(ru, row.name);
    assert.ok(matchesSearch(row.name, [row.name, ru]));
    assert.ok(matchesSearch(ru, [row.name, ru]));
  }
});
test("search tolerates apostrophe and ё variants, multiple terms and empty input", () => {
  assert.ok(matchesSearch("zul'farrak", ["Zul’Farrak"]));
  assert.ok(matchesSearch("черной глубины", ["Глубины Чёрной горы"]));
  assert.ok(matchesSearch("", ["Hall of Thanes"]));
  assert.equal(matchesSearch("not a dungeon", ["The Deadmines"]), false);
});
test("recommended level boundaries are inclusive and never replaced with entrance requirements", () => {
  assert.ok(matchesLevel("13", 13, 18)); assert.ok(matchesLevel("18", 13, 18));
  assert.equal(matchesLevel("12", 13, 18), false); assert.equal(matchesLevel("19", 13, 18), false);
  assert.ok(matchesLevel("", 13, 18));
});
test("unverified names stay English; locations use verified segments", () => {
  assert.equal(instanceName("Shaper’s Terrace", "ru"), "Shaper’s Terrace");
  assert.equal(instanceName("Ironforge · Dun Morogh", "ru"), "Стальгорн · Дун Морог");
  assert.equal(instanceName("The Deadmines", "en"), "The Deadmines");
});
