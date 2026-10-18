import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export async function runActiveRecoveryChild(directory, mode, input = {}) {
  const child = fileURLToPath(new URL("active-recovery-child.mjs", import.meta.url));
  const launcher = fileURLToPath(new URL("persistence-child-launch.py", import.meta.url));
  const processChild = spawn("python3", [launcher, process.execPath, "--experimental-transform-types", "--no-warnings", "--import", "./tests/auction/resolve.mjs", child, mode, JSON.stringify(input)],
    { cwd: fileURLToPath(new URL("../../../", import.meta.url)), env: { ...process.env, GILDRA_AUCTION_STATE_DIR: directory }, timeout: 20000 });
  let stdout = "", stderr = "";
  processChild.stdout.on("data", data => { stdout += data; });
  processChild.stderr.on("data", data => { stderr += data; });
  const code = await new Promise((resolve, reject) => { processChild.on("error", reject); processChild.on("close", resolve); });
  assert.equal(code, 0, `${mode} active recovery child failed:\n${stderr}\n${stdout}`);
  return JSON.parse(stdout.trim().split("\n").at(-1));
}
