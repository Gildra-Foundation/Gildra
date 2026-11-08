import test from "node:test";
import assert from "node:assert/strict";
import { currentRealm, realmsFor, linksFor } from "../../components/platform/navigation/navigationMap.ts";
import { newDungeons, returningDungeons, foreverRaids } from "../../components/wow/forever/instanceData.ts";

test("Forever menus stay within their portal, including localized detail routes", () => {
  for (const path of ["/wow/forever", "/ru/wow/forever/raids", "/wow/forever/dungeons/hall-of-thanes"]) {
    const realms = realmsFor("ru", path);
    assert.equal(realms.length, 2);
    assert.ok(realms.every(realm => linksFor(realm, "ru").every(link => link.href.startsWith("/wow/forever/"))));
  }
  assert.ok(realmsFor("en", "/wow/mythic-plus").some(realm => realm.id === "mythic"));
  assert.equal(currentRealm("/wow/forever/raids")?.realm.id, "forever-raids");
  assert.equal(currentRealm("/wow/forever/dungeons")?.realm.id, "forever-dungeons");
});
test("catalog preserves official new dungeon bands and raid sizes", () => {
  assert.equal(newDungeons.length, 9);
  assert.equal(returningDungeons.length, 19);
  assert.equal(new Set(newDungeons.map(d => d.name)).size, 9);
  assert.ok(newDungeons.every(d => d.min >= 13 && d.min <= d.max && d.max <= 60));
  assert.deepEqual(foreverRaids.map(r => [r.players, r.bosses]), [[10,8],[20,13],[40,1]]);
});
