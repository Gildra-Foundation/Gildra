/** Durable offline regression gate. No upstream/native/authenticated requests. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
assert(args.length === 0 || args.length === 2 && args[0] === "--output-dir", "Usage: test-auction-reliability.mjs [--output-dir <directory>]");
const output = args.length ? path.resolve(args[1]) : path.resolve(web, "../../.artifacts/auction-reliability-20261016");
mkdirSync(output, { recursive: true });
const flags = ["--experimental-transform-types", "--no-warnings", "--import", "./tests/auction/resolve.mjs"];
const suites = [
  // Discover versioned completion regressions, including subsequent fixes.
  // Each file has its own process: mocked globals and private state cannot leak.
  ...readdirSync(path.join(web, "tests/auction/completion")).filter(file => file.endsWith(".test.mjs")).sort().map(file =>
    [`completion-${file.slice(0, -".test.mjs".length)}`, [`tests/auction/completion/${file}`]]),
  ...["gear-candidates", "gear-simulation", "auction-gear", "auction-services", "auction-variants", "auction-discovery",
    "auction-gear-equipment", "auction-gear-review-fixes", "auction-gear-search-store", "auction-gear-exhaustive", "auction-gear-recommendations"].map(name =>
    [name, [`scripts/test-${name}.mjs`]]),
  ["market", ["tests/auction/reliability/market-run.mjs", "green"]],
  ["presentation", ["tests/auction/reliability/market-run.mjs", "presentation-green"]],
  ["locale", ["tests/auction/reliability/market-run.mjs", "locale-green"]],
  ["optimizer", ["tests/auction/reliability/optimizer-regressions.mjs", "--report", path.join(output, "optimizer-green.json")]],
  ["root", ["tests/auction/reliability/root-regressions.mjs", "green"]],
  ["fingerprint", ["--test", "tests/auction/reliability/fingerprint.test.mjs"]],
  ["api", ["scripts/test-auction-gear-api.mjs"]],
  ["initial-request-recovery", ["tests/auction/reliability/request-recovery.test.mjs", "green"]],
];
const results = [];
for (const [name, args] of suites) {
  const startedAt = new Date().toISOString();
  const run = await new Promise(resolve => {
    const child = spawn(process.execPath, [...flags, ...args], { cwd: web, timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", error;
    child.stdout.on("data", chunk => { stdout += chunk; });child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", failure => { error = String(failure); });
    child.on("close", status => resolve({ status, stdout, stderr, error }));
  });
  writeFileSync(path.join(output, `${name}-integration.log`), run.stdout + run.stderr);
  const result = { name, startedAt, finishedAt: new Date().toISOString(), status: run.status === 0 && !run.error ? "passed" : "failed", exitCode: run.status,
    ...(run.error ? { error: String(run.error) } : {}) };
  results.push(result);console.log(`${result.status === "passed" ? "PASS" : "FAIL"} auction reliability: ${name}`);
  if (run.status !== 0) console.error((run.stdout ?? "") + (run.stderr ?? ""));
}
writeFileSync(path.join(output, "offline-suite-green.json"), JSON.stringify({ method: "Actual modules with synthetic offline transports; no external/native calls", results }, null, 2) + "\n");
assert(results.every(result => result.status === "passed"), "Auction reliability regression failed");
