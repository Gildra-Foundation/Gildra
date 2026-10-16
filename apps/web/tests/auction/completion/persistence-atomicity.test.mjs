import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cwd = fileURLToPath(new URL("../../../", import.meta.url));
const launcher = fileURLToPath(new URL("persistence-child-launch.py", import.meta.url));
const child = fileURLToPath(new URL("persistence-atomicity-child.mjs", import.meta.url));
async function run(directory, mode, handles = {}) {
  const processChild = spawn("python3", [launcher, process.execPath, "--experimental-transform-types", "--no-warnings", "--import", "./tests/auction/resolve.mjs", child, mode, JSON.stringify(handles)], {
    cwd, env: { ...process.env, GILDRA_AUCTION_STATE_DIR: directory }, timeout: 20000,
  });
  let stdout = "", stderr = "";
  processChild.stdout.setEncoding("utf8"); processChild.stderr.setEncoding("utf8");
  processChild.stdout.on("data", data => { stdout += data; }); processChild.stderr.on("data", data => { stderr += data; });
  const code = await new Promise((resolve, reject) => { processChild.on("error", reject); processChild.on("close", resolve); });
  assert.equal(code, 0, `${mode}: ${stderr}\n${stdout}`);
  return JSON.parse(stdout.trim().split("\n").at(-1));
}
async function isolated(callback) {
  const directory = await mkdtemp(join(tmpdir(), "gildra-auction-atomicity-"));
  try { await callback(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
test("failed replacement writes preserve acknowledged search records", async () => isolated(async directory => {
  assert.equal((await run(directory, "write-failure")).preservedSearches, 3);
}));
test("a transient post-commit eviction failure cannot strand the forty-search capacity", async () => isolated(async directory => {
  assert.equal((await run(directory, "unlink-failure")).status, "passed");
}));
test("failed post-rename durability acknowledgement rolls back an unaccepted new record", async () => isolated(async directory => {
  assert.equal((await run(directory, "post-rename-failure")).status, "passed");
}));
test("logical LRU survives a real process restart with equal wall-clock timestamps", async () => isolated(async directory => {
  const handles = await run(directory, "lru-seed");
  assert.equal((await run(directory, "lru-restore", handles)).status, "passed");
}));
test("owned reads persist their LRU ordering without an explicit checkpoint save", async () => isolated(async directory => {
  const handles = await run(directory, "lru-read-seed");
  assert.equal((await run(directory, "lru-restore", handles)).status, "passed");
}));
test("transient metadata and body read failures preserve acknowledged files", async () => isolated(async directory => {
  assert.equal((await run(directory, "read-failure")).status, "passed");
}));
test("header-only retention renewal survives restart beyond the body snapshot's original expiry", async () => isolated(async directory => {
  const handles = await run(directory, "renewal-seed");
  assert.equal((await run(directory, "renewal-read", handles)).status, "passed");
}));
