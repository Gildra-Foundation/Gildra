import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
const suites = [
  "gear-candidates", "gear-simulation", "gear-farm", "gear-farm-upgrades", "gear-farm-reward-generation",
  "gear-farm-settings", "gear-farm-coverage", "gear-farm-recovery", "gear-farm-api",
  "auction-gear", "auction-gear-exhaustive", "auction-gear-enhancements", "auction-gear-result",
  "auction-shopping-list", "auction-shopping-progress", "auction-shopping-api", "auction-gear-api",
];
for (const suite of suites) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--import", "./tests/auction/resolve.mjs", `scripts/test-${suite}.mjs`], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(`${suite} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`);
    process.exit(result.status || 1);
  }
  console.log(`PASS ${suite}`);
}
console.log(`${suites.length} gear planner suites passed (offline fixtures; no live-account claims).`);
