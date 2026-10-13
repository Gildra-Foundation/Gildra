import assert from "node:assert/strict";

const workerURL = (process.env.GEAR_SIM_WORKER_URL ?? process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");
const clientId = process.env.BATTLENET_CLIENT_ID;
const clientSecret = process.env.BATTLENET_CLIENT_SECRET;
assert(clientId && clientSecret, "Battle.net client credentials are required");

const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
const tokenResponse = await fetch("https://oauth.battle.net/token", {
  method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials",
});
assert.equal(tokenResponse.status, 200, "Battle.net token request failed");
const token = (await tokenResponse.json()).access_token;
const root = "https://eu.api.blizzard.com/profile/wow/character/eversong/%D1%8D%D0%BB%D0%BA%D0%B0%D1%80%D0%B4%D0%B8%D1%8F";
const get = async (suffix = "") => {
  const response = await fetch(`${root}${suffix}?namespace=profile-eu&locale=en_GB`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200, `Battle.net ${suffix || "profile"} request failed`);
  return response.json();
};
const [profile, specializations, equipment] = await Promise.all([get(), get("/specializations"), get("/equipment")]);
assert.equal(specializations.active_specialization?.id, 72, "Elkardia is not in Fury specialization");
const active = specializations.specializations.find((entry) => entry.specialization?.id === 72);
const talentLoadout = active?.loadouts?.find((entry) => entry.is_active)?.talent_loadout_code;
assert(talentLoadout, "Active Battle.net talent loadout is missing");
const armory = {
  profile,
  specializations: { _links: specializations._links, character: specializations.character, active_specialization: specializations.active_specialization, active_hero_talent_tree: specializations.active_hero_talent_tree, specializations: [{ ...active, loadouts: [] }] },
  equipment,
};
const currentNeck = equipment.equipped_items.find((entry) => entry.slot?.type === "NECK");
assert(currentNeck?.item?.id && currentNeck.item.id !== 268251, "A distinct equipped neck is required for comparison");
const presetResponse = await fetch(`${workerURL}/v1/wow/rotation/fury-warrior?locale=en_US`);
assert.equal(presetResponse.status, 200, "worker preset unavailable");
const preset = await presetResponse.json();
const common = { spec: "fury-warrior", scenario: "single-target", fightLengthSeconds: 30, targets: 1, rules: preset.defaultRules, talentLoadout, armory };

async function run(body) {
  const response = await fetch(`${workerURL}/v1/wow/rotation/simulations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.equal(response.headers.get("x-gildra-engine"), "simulationcraft");
  assert(String(payload.engine).startsWith("SimulationCraft") && payload.dps > 0 && payload.iterations > 0, "invalid SimulationCraft result");
  return payload;
}

const baseline = await run(common);
const baselineRepeat = await run(common);
const gearChange = { slot: "neck", itemId: 268251, bonusIds: [13668] };
const candidate = await run({ ...common, gearChange });
const candidateRepeat = await run({ ...common, gearChange });
assert.equal(baseline.dps, baselineRepeat.dps, "fixed baseline snapshot is not repeatable");
assert.equal(candidate.dps, candidateRepeat.dps, "fixed candidate snapshot is not repeatable");
assert.notEqual(candidate.combatStats?.primary, undefined, "candidate combat stats missing");
const deltaDps = candidate.dps - baseline.dps;
const invalid = await fetch(`${workerURL}/v1/wow/rotation/simulations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...common, gearChange: { slot: "neck", itemId: 268251, bonusIds: [] } }) });
assert.equal(invalid.status, 400, "unversioned item reached SimulationCraft");

console.log(JSON.stringify({
  status: "passed", character: "eu/eversong/элкардия", engine: candidate.engine,
  scenario: { id: "single-target", duration: 30, targets: 1 },
  replacement: { slot: "neck", currentItemId: currentNeck.item.id, candidateItemId: 268251, bonusIds: [13668] },
  baselineDps: baseline.dps, candidateDps: candidate.dps, deltaDps, deltaPercent: deltaDps / baseline.dps * 100,
  confidence: Math.min(baseline.confidence, candidate.confidence), iterations: Math.min(baseline.iterations, candidate.iterations),
  repeatable: true, invalidCombinationBlocked: true,
}, null, 2));
