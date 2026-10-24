import test from "node:test";
import assert from "node:assert/strict";
import { BattleNetCharacterDataError, getBattleNetCharacterDetails } from "../../lib/wow/battleNetCharacterDetails.ts";
import type { BattleNetCharacter } from "../../lib/wow/battleNetCharacters.ts";

const character: BattleNetCharacter = { id: 42, name: "Test", level: 90, realm: { id: 1, name: "Realm", slug: "realm" }, playableClass: { id: 1, name: "Warrior" }, playableRace: { id: 1, name: "Human" }, faction: { type: "ALLIANCE", name: "Alliance" }, region: "eu", accountId: 12, armoryUrl: "https://worldofwarcraft.blizzard.com/en-gb/character/eu/realm/test" };

test("optional Blizzard failures preserve the real profile without synthetic stats or progress", async t => {
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/test")) return Response.json({ id: 42, active_spec: { name: "Arms" }, equipped_item_level: 300, achievement_points: 0 });
    if (path.endsWith("/statistics")) return Response.json({ strength: { effective: 100 }, melee_crit: { value: 0 }, spell_crit: { value: 25 } });
    return new Response("", { status: 503 });
  });
  const result = await getBattleNetCharacterDetails("test-token", character, "en", true);
  assert.equal(result.equippedItemLevel, 300);
  assert.equal(result.activeSpec, "Arms");
  assert.deepEqual(result.equipment, []);
  assert.deepEqual(result.unavailableSections, ["equipment", "talents", "raids"]);
  assert.equal(result.mythicRating, undefined);
  assert.equal(result.activeTalentLoadout, undefined);
  assert.deepEqual(result.stats.map(s => [s.key, s.rawValue]), [["strength", 100], ["crit", 0]]);
});

test("expired, private, missing and rate-limited profiles keep distinct actionable errors", async t => {
  for (const [status, code] of [[401, "expired"], [403, "forbidden"], [404, "not_found"], [429, "rate_limited"]] as const) {
    t.mock.method(globalThis, "fetch", async () => new Response("", { status }));
    await assert.rejects(getBattleNetCharacterDetails("test-token", character, "ru", true), (error: unknown) => error instanceof BattleNetCharacterDataError && error.code === code && error.endpoint === "profile");
    t.mock.restoreAll();
  }
});

test("strict callers still reject absent equipment", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ id: 42 }));
  await assert.rejects(getBattleNetCharacterDetails("test-token", character, "en"), (error: unknown) => error instanceof BattleNetCharacterDataError && error.code === "incomplete");
});
