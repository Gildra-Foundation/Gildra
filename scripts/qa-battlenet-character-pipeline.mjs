import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { attachBattleNetArmory } from "../lib/platform/rotation/battleNetEngineInput.ts";
import { characterStorageScope, withCharacterContext } from "../lib/platform/rotation/characterRequestContext.ts";
import { getBattleNetSimulationSnapshot } from "../lib/wow/battleNetCharacterDetails.ts";

const baseURL = (process.env.CHARACTER_QA_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");
const originalFetch = globalThis.fetch;
const calls = [];
const activeLoadout = "CwQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const character = {
  id: 991, name: "LinkedUser", level: 80,
  realm: { id: 1, name: "Test Realm", slug: "test-realm" },
  playableClass: { id: 1, name: "Warrior" }, playableRace: { id: 1, name: "Human" },
  faction: { type: "ALLIANCE", name: "Alliance" }, region: "eu", accountId: 7, armoryUrl: "https://example.invalid",
};

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, authorization: new Headers(init.headers).get("authorization") });
  if (url.includes("/specializations?")) return Response.json({
    marker: "real-specializations", active_specialization: { id: 72 },
    specializations: [{ specialization: { id: 72 }, loadouts: [{ is_active: true, talent_loadout_code: activeLoadout }] }],
  });
  if (url.includes("/equipment?")) return Response.json({ marker: "real-equipment", equipped_items: [{ item: { id: 19019 } }] });
  return Response.json({ marker: "real-profile", id: character.id, name: character.name });
};

try {
  const snapshot = await getBattleNetSimulationSnapshot("<TEST-TOKEN>", character);
  assert.equal(calls.length, 3, "Battle.net simulation snapshot must request profile, specialization and equipment");
  assert.ok(calls.every((call) => call.authorization === "Bearer <TEST-TOKEN>"), "Every Blizzard request must use the logged-in user's token");
  assert.equal(snapshot.activeSpecializationId, 72);
  assert.equal(snapshot.activeTalentLoadout, activeLoadout);
  assert.equal(snapshot.profile.marker, "real-profile");
  assert.equal(snapshot.specializations.active_specialization.id, 72);
  assert.equal(snapshot.specializations.specializations[0].specialization.id, 72);
  assert.deepEqual(snapshot.specializations.specializations[0].loadouts, [], "Saved loadouts are removed because the selected export is supplied explicitly");
  assert.equal(snapshot.equipment.marker, "real-equipment");

  const engineInput = attachBattleNetArmory({ spec: "fury-warrior", scenario: "single-target", rules: ["rampage"] }, snapshot);
  assert.equal(engineInput.talentLoadout, activeLoadout, "The user's active loadout must reach SimulationCraft");
  assert.equal(engineInput.armory.profile, snapshot.profile, "The user's profile must reach SimulationCraft");
  assert.equal(engineInput.armory.specializations, snapshot.specializations, "The user's specialization must reach SimulationCraft");
  assert.equal(engineInput.armory.equipment, snapshot.equipment, "The user's equipment must reach SimulationCraft");
  const edited = attachBattleNetArmory({ talentLoadout: "EDITED-USER-LOADOUT" }, snapshot);
  assert.equal(edited.talentLoadout, "EDITED-USER-LOADOUT", "An edited user loadout must override only the active loadout");
  assert.equal(edited.armory.equipment, snapshot.equipment, "Editing talents must not replace the user's gear");

  const talentCalculatorRequest = withCharacterContext({ spec: "fury-warrior", candidateLoadout: "CANDIDATE" }, "eu--test-realm--linkeduser", "battle-net");
  const rotationRequest = withCharacterContext({ spec: "fury-warrior", rules: ["rampage"] }, "eu--test-realm--linkeduser", "battle-net");
  assert.equal(talentCalculatorRequest.characterSlug, "eu--test-realm--linkeduser", "Talent calculator must retain the connected character");
  assert.equal(talentCalculatorRequest.dataMode, "battle-net", "Talent calculator must use the authenticated mode");
  assert.equal(rotationRequest.characterSlug, talentCalculatorRequest.characterSlug, "Rotation Lab and talent calculator must use the same character");
  assert.equal(rotationRequest.dataMode, "battle-net", "Rotation Lab must use the authenticated mode");
  assert.notEqual(characterStorageScope("eu--realm--first", "battle-net"), characterStorageScope("eu--realm--second", "battle-net"), "Saved rotations must be isolated per character");
} finally {
  globalThis.fetch = originalFetch;
}

const apiResponse = await originalFetch(`${baseURL}/api/platform/rotation/simulations`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ spec: "fury-warrior", scenario: "single-target", fightLengthSeconds: 60, targets: 1, rules: ["rampage"], characterSlug: "eu--test-realm--linkeduser", dataMode: "battle-net" }),
});
assert.equal(apiResponse.status, 401, "A Battle.net character simulation must reject requests without a user session");

const pageResponse = await originalFetch(`${baseURL}/ru/wow/characters/eu--test-realm--linkeduser`, { redirect: "manual" });
let pageGate = "location";
if (pageResponse.status === 307 || pageResponse.status === 308) {
  assert.equal(pageResponse.headers.get("location"), "/ru/login", "An unstreamed real character page must redirect to login");
} else {
  // Next can begin streaming the route's loading boundary before auth resolves.
  // In that case its redirect is delivered as a refresh meta tag, not an HTTP
  // Location header; accept it only when the target is exactly the RU login.
  assert.equal(pageResponse.status, 200, "A streamed auth redirect uses an HTML response");
  const html = await pageResponse.text();
  const refreshTag = html.match(/<meta\b[^>]*http-equiv=["']refresh["'][^>]*>/i)?.[0] ?? "";
  const refreshTarget = refreshTag.match(/url=([^"';\s]+)/i)?.[1] ?? null;
  assert.equal(refreshTarget, "/ru/login", "A streamed real character page must redirect to login");
  pageGate = "streamed-meta-refresh";
}
const diagnosticResponse = await originalFetch(`${baseURL}/api/wow/characters/eu--test-realm--linkeduser/diagnostics`, { method: "POST" });
assert.equal(diagnosticResponse.status, 401, "Live diagnostics must never expose character data without the user's session");

const pageSource = await readFile(new URL("../app/ru/wow/characters/[slug]/page.tsx", import.meta.url), "utf8");
assert.match(pageSource, /dataMode="battle-net"/, "The authenticated character page must render the Battle.net data mode");
assert.doesNotMatch(pageSource, /furybarFixture/, "The authenticated character page must not import the demo fixture");

console.log(JSON.stringify({
  status: "passed",
  battleNetRequests: calls.map(({ url }) => new URL(url).pathname),
  sessionGate: apiResponse.status,
  pageGate,
  diagnosticGate: diagnosticResponse.status,
  armoryForwarded: ["profile", "specializations", "equipment"],
  activeLoadoutForwarded: true,
  editedLoadoutKeepsUserGear: true,
  characterFunctionsShareContext: true,
  savedRotationsAreCharacterScoped: true,
}, null, 2));
