import { readFile } from "node:fs/promises";

const workerURL = (process.env.ROTATION_WORKER_URL ?? "http://127.0.0.1:58082").replace(/\/$/, "");
const source = await readFile(new URL("../backend/internal/rotationlab/specs.go", import.meta.url), "utf8");
const rows = [...source.matchAll(/^\s*"([^"]+)":\s+\{"[^"]+",\s*"[^"]+",\s*"[^"]+",\s*"([^"]+)"/gm)]
  .map((match) => ({ slug: match[1], role: match[2] }));
const combatSpecs = rows.filter((entry) => entry.role !== "heal");
const results = [];

for (const { slug } of combatSpecs) {
  const presetResponse = await fetch(`${workerURL}/v1/wow/rotation/${slug}?locale=ru_RU`);
  const preset = await presetResponse.json();
  if (!presetResponse.ok) {
    results.push({ slug, presetStatus: presetResponse.status, error: preset.message });
    continue;
  }
  const simulationResponse = await fetch(`${workerURL}/v1/wow/rotation/simulations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec: slug, scenario: "single-target", fightLengthSeconds: 30, targets: 1, rules: preset.defaultRules, aplRules: preset.defaultAplRules }),
  });
  const simulation = await simulationResponse.json();
  results.push({ slug, presetStatus: presetResponse.status, simulationStatus: simulationResponse.status, dps: simulation.dps, engine: simulation.engine, source: simulation.accuracy?.rotationSource, rules: preset.defaultRules, typedRules: preset.defaultAplRules?.length, error: simulation.message });
}

const failed = results.filter((entry) => entry.presetStatus !== 200 || entry.simulationStatus !== 201 || !(entry.dps > 0) || !String(entry.engine).startsWith("SimulationCraft") || entry.source !== "user-priority-model" || entry.typedRules !== entry.rules?.length);
console.log(JSON.stringify({ status: failed.length ? "failed" : "passed", total: results.length, passed: results.length - failed.length, failed, dps: Object.fromEntries(results.filter((entry) => entry.dps).map((entry) => [entry.slug, entry.dps])) }, null, 2));
if (failed.length) process.exitCode = 1;
