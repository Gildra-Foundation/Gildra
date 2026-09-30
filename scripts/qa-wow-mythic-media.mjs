import { spawnSync } from "node:child_process";
import process from "node:process";

const checks = [
  ["local inventory", "scripts/audit-wow-mythic-media.mjs", "--strict"],
  ["current dungeon context", "scripts/verify-wow-mythic-npc-context.mjs", "--strict"],
  ["identity and media", "scripts/verify-wow-mythic-media.mjs", "--strict"],
];

const failures = [];
for (const [label, script, ...args] of checks) {
  console.log(`\n[qa:wow:mythic-media] ${label}`);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error);
    failures.push(`${label}:spawn-error`);
  } else if (result.status !== 0) {
    failures.push(`${label}:exit-${result.status ?? "signal"}`);
  }
}

if (failures.length > 0) {
  console.error(`\n[qa:wow:mythic-media] BLOCKED (${failures.join(", ")})`);
  process.exitCode = 1;
} else {
  console.log("\n[qa:wow:mythic-media] PASS");
}
