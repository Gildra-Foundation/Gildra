import assert from "node:assert/strict";
import { encodeWoWTalentLoadout, decodeWoWTalentLoadout } from "../lib/wowTalentLoadout.ts";
import { generateTalentCandidates, validateTalentSelection } from "../lib/wow/talentCandidateGenerator.ts";

const choice = (id, name) => ({ externalId: id, name, description: "", iconSource: "fallback", maxRanks: 1, talentType: "passive" });
const node = (kind, nodeId, { prev = [], next = [], requiredPoints = 0, maxRanks = 1, freeNode = false, choices = [choice(nodeId * 10, `Talent ${nodeId}`)], nodeType = "single" } = {}) => ({
  id: `${kind}-${nodeId}`, nodeId, x: nodeId, y: nodeId, row: 1, column: 1, maxRanks, talentType: "passive", nodeType,
  prevNodeIds: prev, nextNodeIds: next, requiresNodeIds: [], requiredPoints, entryNode: freeNode, freeNode, choices,
});

const classNodes = [
  node("class", 100, { next: [101, 104], freeNode: true }),
  node("class", 101, { prev: [100], next: [102] }),
  node("class", 102, { prev: [101], nodeType: "choice", choices: [choice(1020, "Choice A"), choice(1021, "Choice B")] }),
  node("class", 104, { prev: [100], next: [105] }),
  node("class", 105, { prev: [104], maxRanks: 2 }),
];
const heroNodes = [node("hero", 200, { next: [201, 202], freeNode: true }), node("hero", 201, { prev: [200] }), node("hero", 202, { prev: [200] })];
const specNodes = [node("spec", 300, { next: [301, 302], freeNode: true }), node("spec", 301, { prev: [300] }), node("spec", 302, { prev: [300] })];
const allNodes = [...classNodes, ...heroNodes, ...specNodes];
const data = {
  specId: 72, buildId: 120100, buildVersion: "12.1.0.test", buildNumber: 120100, className: "Warrior", specName: "Fury", heroName: "Slayer",
  heroSubtreeId: 60, heroSelectionNodeId: 999, heroSelectionEntryIndex: 0,
  fullNodeOrder: [100, 101, 102, 104, 105, 999, 200, 201, 202, 300, 301, 302],
  loadoutNodes: [...allNodes.map((entry) => ({ nodeId: entry.nodeId, maxRanks: entry.maxRanks, nodeType: entry.nodeType, freeNode: entry.freeNode, choiceEntryIds: entry.choices.map((item) => item.externalId) })), { nodeId: 999, maxRanks: 1, nodeType: "subtree", freeNode: false, choiceEntryIds: [9001] }],
  heroIconUrl: "", trees: { class: { kind: "class", nodes: classNodes }, hero: { kind: "hero", nodes: heroNodes }, spec: { kind: "spec", nodes: specNodes } }, pvpTalents: [],
  source: { kind: "community_snapshot", label: "test", url: "test", observedAt: "2026-01-01" },
};
const ranks = new Map([["class-100", 1], ["class-101", 1], ["class-102", 1], ["hero-200", 1], ["hero-201", 1], ["spec-300", 1], ["spec-301", 1]]);
const choices = new Map([["class-102", 1020]]);
const baseline = encodeWoWTalentLoadout(data, ranks, choices);
assert.ok(decodeWoWTalentLoadout(data, baseline), "Synthetic baseline does not round-trip");

const first = generateTalentCandidates(data, baseline, { maxCandidates: 32, maxEvaluations: 500 });
const second = generateTalentCandidates(data, baseline, { maxCandidates: 32, maxEvaluations: 500 });
assert.ok(first.length > 0 && first.length <= 32, "Bounded generator returned no candidates or exceeded its limit");
assert.deepEqual(first.map((item) => item.loadout), second.map((item) => item.loadout), "Candidate ordering is not deterministic");
assert.equal(new Set(first.map((item) => item.loadout)).size, first.length, "Duplicate candidates were emitted");
for (const candidate of first) {
  const decoded = decodeWoWTalentLoadout(data, candidate.loadout);
  assert.ok(decoded, `Candidate ${candidate.id} does not decode`);
  const validation = validateTalentSelection(data, decoded, candidate.pointBudgets);
  assert.equal(validation.valid, true, `Candidate ${candidate.id} is invalid: ${validation.errors.join("; ")}`);
  assert.ok(candidate.editDistance >= 1 && candidate.editDistance <= 2, `Candidate ${candidate.id} is not adjacent`);
}
const brokenRanks = new Map(ranks);
brokenRanks.delete("class-101");
assert.equal(validateTalentSelection(data, { ranks: brokenRanks, choices }, { class: 2, hero: 1, spec: 1 }).valid, false, "Dangling dependent node was accepted");

console.log(JSON.stringify({ status: "passed", candidateCount: first.length, deterministic: true, unique: true, topologyValidated: true }, null, 2));
