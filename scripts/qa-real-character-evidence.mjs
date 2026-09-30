import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const snapshotSource = await readFile(new URL("../lib/wow/battleNetAuditSnapshot.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../components/wow/audit/CharacterAuditPage.tsx", import.meta.url), "utf8");

assert.doesNotMatch(snapshotSource, /talents:\s*90\b/, "Battle.net snapshots still invent a fixed talent score");
assert.doesNotMatch(snapshotSource, /enchants:\s*85\b/, "Battle.net snapshots still invent a fixed enchant score");
assert.match(snapshotSource, /source:\s*"battle-net"/, "Battle.net snapshots are not marked with real-data provenance");
assert.match(pageSource, /dataMode === "battle-net"[\s\S]{0,4000}realProfileEvidence/, "The real character header does not have a dedicated evidence-only branch");
assert.match(pageSource, /title=.*Battle\.net|aria-label=.*Battle\.net/, "Real profile evidence does not expose its source/method accessibly");

console.log(JSON.stringify({ status: "passed", fixedScoresRemoved: true, realEvidenceBranch: true, accessibleSourceLabels: true }, null, 2));
