import assert from "node:assert/strict";
import { analyzeWarcraftLog } from "../lib/wow/warcraftLogsAnalysis.ts";
import { battleSessionBinding, constantTimeEqual, pkceChallenge, safeReturnTo, sealWarcraftLogsValue, unsealWarcraftLogsValue, warcraftLogsAppRedirect } from "../lib/wow/warcraftLogsAuth.ts";
import { characterLogsReturnTo } from "../lib/wow/warcraftLogsRoutes.ts";
import { WarcraftLogsError, warcraftLogsGraphQL } from "../lib/wow/warcraftLogs.ts";
import { analyzableWarcraftLogsFights, resolveWarcraftLogsActor } from "../lib/wow/warcraftLogsReport.ts";
import { resolveRotationAbilitySpellId } from "../lib/platform/rotation/spellIds.ts";

const secret = "task-16-test-secret-longer-than-24-characters";
const session = { accessToken: "private-wcl-access-token", binding: battleSessionBinding("battle-token"), exp: Date.now() + 60_000 };
const sealed = sealWarcraftLogsValue(session, secret);
assert(!sealed.includes(session.accessToken), "sealed cookie exposed access token");
assert.deepEqual(unsealWarcraftLogsValue(sealed, secret), session);
assert.equal(unsealWarcraftLogsValue(`${sealed.slice(0, -1)}x`, secret), null, "tampered cookie accepted");
assert.equal(unsealWarcraftLogsValue(sealWarcraftLogsValue({ ...session, exp: 1 }, secret), secret), null, "expired session accepted");
assert.equal(safeReturnTo("https://evil.example/steal"), "/ru/wow/characters");
assert.equal(safeReturnTo("/ru/wow/characters/eu--realm--hero"), "/ru/wow/characters/eu--realm--hero");
assert(constantTimeEqual("state-123", "state-123")); assert(!constantTimeEqual("state-123", "state-124"));
assert.equal(pkceChallenge("a".repeat(64)).includes("="), false);
const encodedCharacterSlug = "eu--eversong--%D1%8D%D0%BB%D0%BA%D0%B0%D1%80%D0%B4%D0%B8%D1%8F";
assert.equal(characterLogsReturnTo("/ru", encodedCharacterSlug), `/ru/wow/characters/${encodedCharacterSlug}`, "character return path was double encoded");
assert.equal(
  warcraftLogsAppRedirect(`/ru/wow/characters/${encodedCharacterSlug}?logs=connected`, "http://0.0.0.0:5173/api/wow/logs/callback", "http://51.68.180.93:5173").href,
  `http://51.68.180.93:5173/ru/wow/characters/${encodedCharacterSlug}?logs=connected`,
  "OAuth callback used the internal listener origin",
);

let upstreamAuthorization = "";
await assert.rejects(() => warcraftLogsGraphQL("revoked-token", "query{userData{currentUser{id}}}", {}, async (_url, init) => {
  upstreamAuthorization = new Headers(init?.headers).get("authorization") ?? "";
  return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401, headers: { "Content-Type": "application/json" } });
}), (error: unknown) => error instanceof WarcraftLogsError && error.code === "unauthorized");
assert.equal(upstreamAuthorization, "Bearer revoked-token");

const payload = { reportData: { report: {
  code: "AbCdEf1234567890", title: "QA Raid", visibility: "private", startTime: 1_700_000_000_000,
  fights: [{ id: 7, name: "QA Boss", encounterID: 999, startTime: 1000, endTime: 61000, kill: false, friendlyPlayers: [42], friendlySpecs: ["Fury"], talentImportCode: "TALENTS" }],
  masterData: { actors: [{ id: 42, name: "Hero", server: "realm", type: "Player" }], abilities: [{ gameID: 100, name: "Recklessness" }, { gameID: 200, name: "Enrage" }] },
  casts: { data: [{ type: "cast", timestamp: 1000, abilityGameID: 100 }, { type: "cast", timestamp: 12000, abilityGameID: 100 }, { type: "cast", timestamp: 26000, abilityGameID: 100 }] },
  buffs: { data: [
    { type: "applybuff", timestamp: 1000, abilityGameID: 200, sourceID: 42, targetID: 42 },
    { type: "applybuffstack", timestamp: 5000, abilityGameID: 200, sourceID: 42, targetID: 42 },
    { type: "removebuffstack", timestamp: 10000, abilityGameID: 200, sourceID: 42, targetID: 42 },
    { type: "removebuff", timestamp: 31000, abilityGameID: 200, sourceID: 42, targetID: 42 },
    { type: "applybuff", timestamp: 1000, abilityGameID: 300, sourceID: 42, targetID: 99 },
    { type: "applybuff", timestamp: 1000, abilityGameID: 400, sourceID: 42, targetID: 42 },
  ] },
  resources: { data: [{ type: "energize", timestamp: 20000, resourceChange: 80, waste: 20, sourceID: 42 }] },
  damage: { data: [{ type: "damage", timestamp: 2000, amount: 600000, sourceID: 42 }] },
  damageTable: { data: { entries: [
    { name: "Player hit", total: 600000, targets: [{ name: "QA Boss" }] },
    { name: "Pet composite", total: 300000, targets: [{ name: "QA Boss" }] },
  ] } },
  deaths: { data: [] as Array<{ type: string; timestamp: number; targetID: number }> },
} } };
const analysis = analyzeWarcraftLog(payload, { fightID: 7, actorID: 42, specSlug: "fury-warrior", simDps: 18750, simDurationSeconds: 60, simTargets: 1, cooldowns: [{ spellId: 100, name: "Recklessness", expectedIntervalSeconds: 10, expectedFirstUseSeconds: 0, expectedUses: [0, 10, 20, 30] }] });
assert.equal(Math.round(analysis.metrics.dps), 15000, "WCL table total, including pet damage, was not used");
assert.equal(analysis.metrics.simDeltaPercent, -20);
assert.equal(analysis.metrics.buffUptimePercent, 50);
assert.equal(analysis.metrics.driftSeconds, 36, "cooldown drift omitted the missed repeat at the end of the fight");
assert(analysis.findings.some((item) => item.id === "missing-cooldown-100-3"), "missed cooldown repeat at the end of the fight was not reported");
assert.equal(analysis.metrics.overcapPercent, 20);
assert.equal(analysis.metrics.deaths, 0);
assert(analysis.findings.some((item) => item.evidence.includes("spell 100")));
assert(analysis.findings.every((item) => item.sourceURL?.includes("start=")), "finding does not link to its evidence window");
assert.equal(analysis.report.visibility, "private");

const englishAnalysis = analyzeWarcraftLog(payload, { locale: "en", fightID: 7, actorID: 42, specSlug: "fury-warrior", simDps: 18750, simDurationSeconds: 60, simTargets: 1, cooldowns: [{ spellId: 100, name: "Recklessness", expectedIntervalSeconds: 10, expectedFirstUseSeconds: 0, expectedUses: [0, 10, 20, 30] }] });
assert.deepEqual(englishAnalysis.metrics, analysis.metrics, "changing language changed the combat metrics");
assert.deepEqual(englishAnalysis.report, analysis.report, "changing language changed report data");
assert.deepEqual(englishAnalysis.actor, analysis.actor, "changing language changed actor data");
assert.deepEqual(englishAnalysis.findings.map(({ id, severity, timestampMs, sourceURL }) => ({ id, severity, timestampMs, sourceURL })), analysis.findings.map(({ id, severity, timestampMs, sourceURL }) => ({ id, severity, timestampMs, sourceURL })), "changing language changed finding provenance");
assert(englishAnalysis.findings.every((item) => !/[А-Яа-яЁё]/.test(`${item.title} ${item.detail} ${item.evidence}`)), "English findings contain Russian UI copy");
assert(englishAnalysis.findings.some((item) => item.title === "Missed cast of Recklessness"), "the source ability name was not retained");
const namedCooldown = analyzeWarcraftLog(payload, { locale: "en", fightID: 7, actorID: 42, specSlug: "fury-warrior", simDps: 18750, simDurationSeconds: 60, simTargets: 1, cooldowns: [{ spellId: 100, name: "Исходное имя", expectedIntervalSeconds: 10, expectedFirstUseSeconds: 0, expectedUses: [0, 10, 20, 30] }] });
assert(namedCooldown.findings.some((item) => item.title === "Missed cast of Исходное имя"), "localization invented a translation for a source ability name");

const deathPayload = structuredClone(payload);
deathPayload.reportData.report.deaths.data = [{ type: "death", timestamp: 50000, targetID: 42 }];
const deathAnalysis = analyzeWarcraftLog(deathPayload, { fightID: 7, actorID: 42, specSlug: "fury-warrior", simDps: 18750, simDurationSeconds: 60, simTargets: 1, cooldowns: [{ spellId: 100, name: "Recklessness", expectedIntervalSeconds: 10, expectedFirstUseSeconds: 0, expectedUses: [0, 10, 20, 30] }] });
assert.equal(deathAnalysis.metrics.comparison.status, "death");
assert.equal(deathAnalysis.metrics.simDeltaPercent, undefined, "a death produced a misleading SimC percentage");
assert.equal(deathAnalysis.metrics.driftSeconds, null, "cooldown drift continued after the actor died");
assert(deathAnalysis.findings.some((item) => item.timestampLabel === "0:49" && item.evidence.includes("WCL Deaths")));

const missingCooldownPayload = structuredClone(payload);
missingCooldownPayload.reportData.report.casts.data = [];
const missingCooldown = analyzeWarcraftLog(missingCooldownPayload, { fightID: 7, actorID: 42, specSlug: "fury-warrior", simDps: 18750, simDurationSeconds: 60, simTargets: 1, cooldowns: [{ spellId: 100, name: "Recklessness", expectedIntervalSeconds: 10, expectedFirstUseSeconds: 0, expectedUses: [0, 10, 20, 30] }] });
assert(missingCooldown.findings.some((item) => item.id.startsWith("missing-cooldown-")), "an entirely missed cooldown was reported as zero drift");

const incomparable = analyzeWarcraftLog(payload, { fightID: 7, actorID: 42, specSlug: "fury-warrior", simDps: 18750, simDurationSeconds: 300, simTargets: 5, cooldowns: [{ spellId: 100, name: "Recklessness", expectedIntervalSeconds: 10, expectedFirstUseSeconds: 0, expectedUses: [0, 10, 20, 30] }] });
assert.equal(incomparable.metrics.simDeltaPercent, undefined, "mismatched SimC and WCL scenarios produced a fake percentage comparison");

const dynamicTargetsPayload = structuredClone(payload);
dynamicTargetsPayload.reportData.report.damageTable!.data!.entries![1].targets!.push({ name: "QA Add" });
const dynamicTargets = analyzeWarcraftLog(dynamicTargetsPayload, { fightID: 7, actorID: 42, specSlug: "fury-warrior", simDps: 18750, simDurationSeconds: 60, simTargets: 2, cooldowns: [] });
assert.equal(dynamicTargets.metrics.comparison.status, "dynamic_targets");
assert.equal(dynamicTargets.metrics.simDeltaPercent, undefined, "distinct targets across a fight were treated as simultaneous SimC targets");

assert.equal(resolveRotationAbilitySpellId("recklessness"), 1719, "known cooldown could not be linked to WCL");
assert.equal(resolveRotationAbilitySpellId("spell-12345"), 12345, "catalog spell ID could not be linked to WCL");
assert.equal(resolveRotationAbilitySpellId("recklessness", 999), 999, "upstream spell ID was overwritten");

const actorPool = [
  { id: 1, name: "Hero", server: "TarrenMill", type: "Player" },
  { id: 2, name: "Hero", server: "Silvermoon", type: "Player" },
  { id: 3, name: "Hero Pet", server: "TarrenMill", type: "Pet" },
];
assert.deepEqual(resolveWarcraftLogsActor("eu--tarren-mill--hero", actorPool), { actor: actorPool[0] }, "realm normalization selected the wrong same-name actor");
assert.equal(resolveWarcraftLogsActor("eu--unknown--hero", actorPool).error, "character_ambiguous", "ambiguous same-name actors were silently accepted");
assert.equal(resolveWarcraftLogsActor("eu--silvermoon--hero", [actorPool[0]]).error, "character_not_in_report", "a same-name actor from another server was accepted");
const actorWithoutServer = { id: 4, name: "Hero", type: "Player" };
assert.deepEqual(resolveWarcraftLogsActor("eu--tarren-mill--hero", [actorWithoutServer]), { actor: actorWithoutServer }, "unique actor without WCL server metadata was rejected");
assert.equal(resolveWarcraftLogsActor("eu--tarren-mill--hero%ZZ", actorPool).error, "invalid_character_slug", "malformed encoded character slug was accepted");
assert.equal(resolveWarcraftLogsActor("eu--somewhere--hero-pet", actorPool).error, "character_not_in_report", "a pet was accepted as the player actor");
assert.deepEqual(analyzableWarcraftLogsFights([
  { id: 1, startTime: 100, endTime: 100, friendlyPlayers: [1] },
  { id: 2, startTime: 100, endTime: 200, friendlyPlayers: [2] },
  { id: 3, startTime: 100, endTime: 200, friendlyPlayers: [1] },
], 1).map((fight) => fight.id), [3], "zero-duration or non-participating fights were exposed");

console.log(JSON.stringify({ status: "passed", oauth: { encryptedCookie: true, tamperRejected: true, expiryRejected: true, stateAndPkce: true, revokedToken401: true }, analysis: { exactFight: analysis.fight.id, actor: analysis.actor.id, dps: analysis.metrics.dps, drift: analysis.metrics.driftSeconds, overcap: analysis.metrics.overcapPercent, deaths: deathAnalysis.metrics.deaths, timestampEvidence: true } }, null, 2));
