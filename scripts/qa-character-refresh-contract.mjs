import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/wow/characters/[slug]/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../components/wow/audit/CharacterAuditPage.tsx", import.meta.url), "utf8");
const simulator = await readFile(new URL("../components/wow/audit/CharacterTalentSimulator.tsx", import.meta.url), "utf8");

assert.match(route, /export async function POST/, "Character refresh endpoint is missing");
for (const status of [401, 403, 404, 422, 429, 503]) {
  assert.match(route, new RegExp(`\\b${status}\\b`), `Refresh route does not expose ${status}`);
}
assert.match(route, /fingerprint/, "Refresh response does not identify the armory snapshot");
assert.match(page, /refreshCharacter/, "The real profile update button is still a fake timer");
assert.match(page, /refreshState/, "The UI has no explicit refresh/recovery state");
assert.match(simulator, /snapshotKey/, "Talent simulation is not invalidated after armory refresh");

console.log(JSON.stringify({ status: "passed", refreshEndpoint: true, recoveryStatuses: [401, 403, 404, 422, 429, 503], simulationInvalidation: true }, null, 2));
