import { createHash } from "node:crypto";

import { talentSpecThemes } from "../lib/talentSpecThemes.ts";

const baseURL = (process.env.CHARACTER_TALENTS_BASE_URL ?? "http://127.0.0.1:5173").replace(/\/$/, "");

async function request(body, qa = false) {
  const response = await fetch(`${baseURL}/api/wow/talent-candidates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(qa ? { "x-gildra-qa-mode": "talent-candidates" } : {}) },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${body.spec}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const furyRequest = { characterSlug: "furybar", spec: "fury-warrior", dataMode: "fixture", maxCandidates: 64 };
const first = await request(furyRequest);
const second = await request(furyRequest);
if (!first.baselineValid || !first.candidateCount) throw new Error("Live Fury topology produced no valid candidates");
if (first.candidateCount > 64) throw new Error("Candidate limit was exceeded");
if (new Set(first.candidates.map((candidate) => candidate.loadout)).size !== first.candidateCount) throw new Error("Live Fury topology emitted duplicates");
if (JSON.stringify(first.candidates.map((candidate) => candidate.id)) !== JSON.stringify(second.candidates.map((candidate) => candidate.id))) throw new Error("Live Fury candidate order changed between identical requests");
const furySnapshot = createHash("sha256")
  .update(first.candidates.map((candidate) => candidate.id).join("\n"))
  .digest("hex");
const expectedFurySnapshot = {
  buildVersion: "12.1.0.69875",
  candidateCount: 64,
  digest: "fe66a2083eb640fc2edefbcfa36d54c5a958c0ec73c44ec2d60a787730da4c45",
};
if (
  first.buildVersion !== expectedFurySnapshot.buildVersion
  || first.candidateCount !== expectedFurySnapshot.candidateCount
  || furySnapshot !== expectedFurySnapshot.digest
) {
  throw new Error(`Fury candidate snapshot changed: ${JSON.stringify({ buildVersion: first.buildVersion, candidateCount: first.candidateCount, digest: furySnapshot })}`);
}

const topologySpecs = talentSpecThemes.map((theme) => theme.slug);
const matrix = {};
for (const spec of topologySpecs) {
  const result = await request({ characterSlug: "__topology_test__", spec, dataMode: "fixture", maxCandidates: 12, topologyTest: true }, true);
  if (!result.baselineValid || !result.candidateCount) throw new Error(`${spec}: property seed produced no valid neighbors`);
  matrix[spec] = result.candidateCount;
}

console.log(JSON.stringify({ status: "passed", fury: { buildVersion: first.buildVersion, candidateCount: first.candidateCount, snapshot: furySnapshot }, specCount: topologySpecs.length, specializationMatrix: matrix, deterministic: true, unique: true, bounded: true }, null, 2));
