import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../../../", import.meta.url));
const launcher = fileURLToPath(new URL("persistence-child-launch.py", import.meta.url));
const child = fileURLToPath(new URL("durable-recovery-child.mjs", import.meta.url));
async function run(directory, mode, input = {}) {
  const p = spawn("python3", [launcher, process.execPath, "--experimental-transform-types", "--no-warnings", "--import", "./tests/auction/resolve.mjs", child, mode, JSON.stringify(input)],
    { cwd, env: { ...process.env, GILDRA_AUCTION_STATE_DIR: directory }, timeout: 20000 });
  let stdout = "", stderr = "";
  p.stdout.on("data", value => { stdout += value; }); p.stderr.on("data", value => { stderr += value; });
  const code = await new Promise((resolve, reject) => { p.on("error", reject); p.on("close", resolve); });
  assert.equal(code, 0, `${mode}:\n${stderr}\n${stdout}`);
  return JSON.parse(stdout.trim().split("\n").at(-1));
}
async function isolated(callback) {
  const directory = await mkdtemp(join(tmpdir(), "gildra-durable-recovery-"));
  try { await callback(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
for (const repair of ["delete", "id", "get", "replay"]) {
  test(`a ${repair} retry durably acknowledges a cancelled queued job after its first write fails`, () => isolated(async directory => {
    const seed = await run(directory, "cancel-seed", { repair });
    assert.equal((await run(directory, "cancel-read", seed)).tasks, 0);
  }));
}
test("owned reads and request replays cannot acknowledge cancellation while its durable write still fails", () => isolated(async directory => {
  const seed = await run(directory, "cancel-seed", { repair: "get", checkPending: true });
  assert.equal((await run(directory, "cancel-read", seed)).status, "cancelled");
}));
for (const action of ["resume", "assemble"]) {
  test(`a ${action} replay preserves retryable storage failure until cancellation is durable`, () => isolated(async directory => {
    const seed = await run(directory, "cancel-seed", { action, repair: "replay", checkPending: true });
    assert.equal((await run(directory, "cancel-read", seed)).tasks, 0);
  }));
}
test("running work settling after a failed cancel write cannot clear the pending durable barrier", () => isolated(async directory => {
  const seed = await run(directory, "cancel-seed", { running: true, repair: "delete", checkPending: true });
  assert.equal((await run(directory, "cancel-read", seed)).tasks, 0);
}));
test("crash overflow retains the oldest parked search and resumes its actual checkpoint", () => isolated(async directory => {
  const first = await run(directory, "search-initial");
  const crash = await run(directory, "search-fill", { ...first, crash: true });
  assert.equal(crash.files, 41); assert.notEqual(crash.selectedVictim, first.searchId);
  const recovered = await run(directory, "search-read", first);
  assert.equal(recovered.retained, true); assert.equal(recovered.resumed, true);
}));
test("normal replacement retains the parked search without expanding the forty-search bound", () => isolated(async directory => {
  const first = await run(directory, "search-initial");
  assert.equal((await run(directory, "search-fill", first)).files, 40);
  assert.equal((await run(directory, "search-read", first)).retained, true);
}));
test("completed work and another owner's job cannot pin an otherwise obsolete search", async () => {
  for (const variant of ["completed", "foreign"]) await isolated(async directory => {
    const first = await run(directory, "search-initial", { variant });
    await run(directory, "search-fill", { ...first, crash: true });
    assert.equal((await run(directory, "search-read", { ...first, expectMissing: true })).retained, false);
  });
});
test("a job-header read error during overflow fails closed without deleting search checkpoints", () => isolated(async directory => {
  const first = await run(directory, "search-initial");
  await run(directory, "search-fill", { ...first, crash: true });
  assert.equal((await run(directory, "search-read-error", first)).preserved, 41);
  assert.equal((await run(directory, "search-read", first)).retained, true);
}));
test("precision checkpoint contracts reject legacy searches and remain incompatible with the old reader", () => isolated(async directory => {
  const seed = await run(directory, "precision-search-seed");
  assert.equal((await run(directory, "precision-search-read", seed)).legacySearchRejected, true);
}));
test("legacy completed results fail closed while nonce, cancellation ACK and search rate survive restart", () => isolated(async directory => {
  const seed = await run(directory, "precision-results-seed");
  assert.equal((await run(directory, "precision-results-read", seed)).status, "passed");
}));
test("an interrupted initial job without a result marker runs new work and publishes the current measurement contract", () => isolated(async directory => {
  const seed = await run(directory, "precision-queued-seed");
  assert.equal((await run(directory, "precision-queued-read", seed)).tasks, 1);
}));
