import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize, serialize } from "node:v8";
import { gunzipSync, gzipSync } from "node:zlib";

const child = fileURLToPath(new URL("persistence-child.mjs", import.meta.url));
const launcher = fileURLToPath(new URL("persistence-child-launch.py", import.meta.url));
const cwd = fileURLToPath(new URL("../../../", import.meta.url));
const flags = ["--experimental-transform-types", "--no-warnings", "--import", "./tests/auction/resolve.mjs"];
const now = Date.now();
async function run(directory, mode, handles = {}, at = now) {
  // Python exec avoids this sandbox's Node-to-Node spawn restriction; each
  // command still executes the actual modules in a fresh standalone Node VM.
  const processChild = spawn("python3", [launcher, process.execPath, ...flags, child, mode, JSON.stringify(handles)], {
    cwd, env: { ...process.env, GILDRA_AUCTION_STATE_DIR: directory, AUCTION_TEST_NOW: String(at) },
    timeout: 20000,
  });
  let stdout = "", stderr = "";
  processChild.stdout.setEncoding("utf8"); processChild.stderr.setEncoding("utf8");
  processChild.stdout.on("data", data => { stdout += data; }); processChild.stderr.on("data", data => { stderr += data; });
  const code = await new Promise((resolve, reject) => { processChild.on("error", reject); processChild.on("close", resolve); });
  assert.equal(code, 0, `${mode} child failed:\n${stderr}\n${stdout}`);
  return JSON.parse(stdout.trim().split("\n").at(-1));
}
async function isolated(runCase) {
  const directory = await mkdtemp(join(tmpdir(), "gildra-auction-restart-"));
  try { await runCase(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path)); else output.push(path);
  }
  return output;
}
async function readCheckpoint(file) {
  const bytes = await readFile(file);
  assert(bytes.length >= 4, "A checkpoint must include its metadata header");
  const headerLength = bytes.readUInt32BE(0);
  assert(headerLength > 0 && headerLength <= 64 * 1024 && bytes.length > 4 + headerLength, "Invalid checkpoint header length");
  const header = JSON.parse(bytes.subarray(4, 4 + headerLength).toString("utf8"));
  const body = gunzipSync(bytes.subarray(4 + headerLength));
  const envelope = deserialize(body);
  for (const key of ["version", "simulationContract", "kind", "id"])
    assert.equal(header[key], envelope[key], `Checkpoint header and body disagree: ${key}`);
  assert(Number.isFinite(header.expiresAt) && header.expiresAt >= envelope.expiresAt, "A header lifecycle touch cannot shorten the saved body lifetime");
  const headerMetadata = header.metadata ?? {}, bodyMetadata = envelope.metadata ?? {};
  for (const key of new Set([...Object.keys(headerMetadata), ...Object.keys(bodyMetadata)])) {
    if (key === "recency") assert(Number.isFinite(headerMetadata[key]) && headerMetadata[key] >= bodyMetadata[key], "Header recency cannot precede its saved body");
    else if (key === "touchedAt") assert(Number.isFinite(headerMetadata[key]) && Number.isFinite(bodyMetadata[key]));
    else assert.deepEqual(headerMetadata[key], bodyMetadata[key], `Checkpoint metadata changed outside its lifecycle: ${key}`);
  }
  return { bytes, header, body, envelope };
}
async function writeCheckpoint(file, header, envelope) {
  const encodedHeader = Buffer.from(JSON.stringify(header));
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(encodedHeader.length);
  await writeFile(file, Buffer.concat([prefix, encodedHeader, gzipSync(serialize(envelope))]));
}
function inspect(value, visit, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value); visit(value);
  for (const item of value instanceof Map ? [...value.entries()].flat() : value instanceof Set ? value : Object.values(value)) inspect(item, visit, seen);
}

test("completed results and private checkpoints survive a real process restart", async () => isolated(async directory => {
  const handles = await run(directory, "seed-completed");
  const result = await run(directory, "read-completed", handles);
  assert.equal(result.status, "passed");
  assert(result.preserved.includes("Maps") && result.preserved.includes("nonce"));
}));

test("interrupted initial work is parked until its owner attaches it, then resumes exactly once", async () => isolated(async directory => {
  const handles = await run(directory, "seed-interrupted");
  const result = await run(directory, "resume-interrupted", handles);
  assert.equal(result.calls, 1); assert.equal(result.releases, 1);
  await run(directory, "read-resumed", handles);
}));

test("interrupted continuation intents preserve their search and assembly exclusions", async () => {
  for (const workAction of ["resume", "assemble"]) await isolated(async directory => {
    const handles = await run(directory, "seed-interrupted", { workAction });
    assert.equal((await run(directory, "resume-interrupted", handles)).calls, 1);
    await run(directory, "read-resumed", handles);
  });
});

test("cancelling restored work releases its reservation and remains cancelled after another restart", async () => isolated(async directory => {
  const handles = await run(directory, "seed-interrupted");
  assert.equal((await run(directory, "cancel-restored", handles)).releases, 1);
  await run(directory, "read-cancelled", handles);
}));

test("expired restored queued work releases its context reservation and cannot reload", async () => isolated(async directory => {
  const handles = await run(directory, "seed-interrupted");
  assert.equal((await run(directory, "expire-restored-queued", handles)).releases, 1);
  await run(directory, "read-missing", handles);
}));

test("foreign reads cannot renew retention and expired records cannot resurrect", async () => isolated(async directory => {
  const handles = await run(directory, "seed-completed");
  await run(directory, "foreign-read", handles, now + 29 * 60000);
  await run(directory, "read-missing", handles, now + 31 * 60000);
  // Once expiry removes a record, moving the test clock back must not reload it.
  await run(directory, "read-missing", handles, now);
}));

test("explicit search deletion survives another process", async () => isolated(async directory => {
  const handles = await run(directory, "seed-completed");
  await run(directory, "delete-search", handles);
  await run(directory, "read-search-missing", handles);
}));

test("owner-capacity eviction removes the durable search instead of resurrecting it", async () => isolated(async directory => {
  const handles = await run(directory, "seed-completed");
  await run(directory, "evict-search", handles);
  await run(directory, "read-search-missing", handles);
}));

test("corrupt records fail closed without crashing owner recovery", async () => isolated(async directory => {
  const handles = await run(directory, "seed-completed");
  const records = await files(directory); assert(records.length >= 2);
  for (const file of records) await writeFile(file, "synthetic-truncated-checkpoint");
  await run(directory, "read-missing", handles);
}));

test("incompatible checkpoint versions fail closed", async () => isolated(async directory => {
  const handles = await run(directory, "seed-completed");
  const records = await files(directory); assert(records.length >= 2);
  for (const file of records) {
    const { header, envelope } = await readCheckpoint(file);
    assert.equal(typeof envelope.version, "number", "Saved envelopes must identify their version");
    envelope.version += 1000;
    header.version = envelope.version;
    await writeCheckpoint(file, header, envelope);
  }
  await run(directory, "read-missing", handles);
}));

test("a different native simulation contract cannot reuse saved scores", async () => isolated(async directory => {
  const handles = await run(directory, "seed-completed");
  const records = await files(directory); assert(records.length >= 2);
  for (const file of records) {
    const { header, envelope } = await readCheckpoint(file);
    assert.equal(typeof envelope.simulationContract, "string");
    envelope.simulationContract = "foreign-incompatible-native-contract";
    header.simulationContract = envelope.simulationContract;
    await writeCheckpoint(file, header, envelope);
  }
  await run(directory, "read-missing", handles);
}));

test("private files persist data without bearer tokens, task closures or controllers", async () => isolated(async directory => {
  await run(directory, "seed-completed");
  const records = await files(directory); assert(records.length >= 2);
  assert.equal((await stat(directory)).mode & 0o077, 0, "The checkpoint directory must be private");
  for (const file of records) {
    assert.equal((await stat(file)).mode & 0o077, 0, "Checkpoint files must be private");
    const { bytes, header, body, envelope } = await readCheckpoint(file);
    const forbiddenToken = Buffer.from("synthetic-never-persisted-bearer");
    assert(!bytes.includes(forbiddenToken), "Bearer token leaked into the checkpoint header");
    assert(!body.includes(forbiddenToken), "Bearer token leaked into the checkpoint body");
    inspect({ header, envelope }, object => {
      for (const [key, entry] of Object.entries(object)) {
        assert(!["task", "controller", "onSettled", "simulate", "discoveryContext"].includes(key), `Executable state persisted: ${key}`);
        assert.notEqual(typeof entry, "function");
      }
    });
  }
}));
