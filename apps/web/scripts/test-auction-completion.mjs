/** Full offline auction regression gate; every run preserves separate evidence. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert(process.argv.length === 2 || process.argv.length === 4 && process.argv[2] === "--output-dir", "Usage: node scripts/test-auction-completion.mjs [--output-dir <new-directory>]");
const index = process.argv.indexOf("--output-dir");
if (index !== -1) assert(process.argv[index + 1], "--output-dir needs a new directory");
const output = path.resolve(index === -1 ? path.join(web, "../../.artifacts/auction-completion-20261016", `offline-${Date.now()}`) : process.argv[index + 1]);
mkdirSync(path.dirname(output), { recursive: true }); mkdirSync(output);
const flags = ["--experimental-transform-types", "--no-warnings", "--import", "./tests/auction/resolve.mjs"];
const focused = readdirSync(path.join(web, "tests/auction/completion")).filter(name => name.endsWith(".test.mjs")).sort();
const scripts = ["gear-candidates", "gear-simulation", "auction-gear", "auction-services", "auction-variants", "auction-discovery",
  "auction-gear-equipment", "auction-gear-review-fixes", "auction-gear-search-store", "auction-gear-exhaustive", "auction-gear-recommendations", "auction-gear-api"];
const suites = [
  ...focused.map(file => [`completion-${file.replace(/\.test\.mjs$/, "")}`, [`tests/auction/completion/${file}`]]),
  ...scripts.map(name => [name, [`scripts/test-${name}.mjs`]]),
  ...["green", "presentation-green", "locale-green"].map(mode => [`reliability-market-${mode}`, ["tests/auction/reliability/market-run.mjs", mode]]),
  ["reliability-optimizer", ["tests/auction/reliability/optimizer-regressions.mjs", "--report", path.join(output, "optimizer.json")]],
  ["reliability-root", ["tests/auction/reliability/root-regressions.mjs", "green"]],
  ["reliability-fingerprint", ["tests/auction/reliability/fingerprint.test.mjs"]],
  ["reliability-request-recovery", ["tests/auction/reliability/request-recovery.test.mjs", "green"]],
];
const results = [];
for (const [name, args] of suites) {
  const startedAt = new Date().toISOString();
  // The Python bridge avoids the host sandbox's Node-to-Node child restriction.
  // Each suite still executes in a real independent Node process with a deadline.
  const run = await new Promise(resolve => {
    const bridge = "import subprocess,sys; r=subprocess.run(sys.argv[1:],capture_output=True,timeout=180); sys.stdout.buffer.write(r.stdout); sys.stderr.buffer.write(r.stderr); sys.exit(r.returncode)";
    const child = spawn("python3", ["-c", bridge, process.execPath, ...flags, ...args], { cwd: web,
      env: { ...process.env, AUCTION_REGRESSION_OUTPUT_DIR: output, AUCTION_RECOMMENDATIONS_OUTPUT: path.join(output, "recommendations.json") },
      timeout: 190_000, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", error;
    child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", failure => { error = String(failure); });
    child.on("close", status => resolve({ status, stdout, stderr, error }));
  });
  writeFileSync(path.join(output, `${name}.log`), run.stdout + run.stderr, { flag: "wx" });
  const passed = run.status === 0 && !run.error && run.stdout.trim().length > 0;
  results.push({ name, startedAt, finishedAt: new Date().toISOString(), status: passed ? "passed" : "failed", exitCode: run.status,
    ...(run.error ? { error: run.error } : {}) });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}`);
  if (!passed) console.error((run.stdout + run.stderr).slice(-10000));
}
writeFileSync(path.join(output, "summary.json"), JSON.stringify({ method: "Actual modules; offline synthetic transports; no production/native/authenticated jobs", results }, null, 2) + "\n", { flag: "wx" });
assert(results.every(result => result.status === "passed"), "Auction completion regression gate failed");
