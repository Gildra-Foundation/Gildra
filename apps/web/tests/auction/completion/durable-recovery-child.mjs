import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { deserialize, serialize } from "node:v8";
import { gunzipSync, gzipSync } from "node:zlib";
import { join } from "node:path";

assert(process.env.GILDRA_AUCTION_STATE_DIR?.includes("gildra-durable-recovery-"), "Only isolated test state is allowed");
const mode = process.argv[2], input = JSON.parse(process.argv[3] ?? "{}");
const token = "synthetic-durable-owner", owner = createHash("sha256").update(`battle-net:${token}`).digest("hex");
const scope = { characterSlug: "synthetic-durable", locale: "en" }, nonce = "synthetic-durable-request";
const tick = () => new Promise(resolve => setImmediate(resolve));
const moduleURL = text => `data:text/javascript,${encodeURIComponent(text)}`;
let tasks = 0, aborts = 0, currentToken = token;
globalThis.__durableRecovery = { auth: () => ({ battleNetAccessToken: currentToken }), run: async signal => {
  tasks++;
  if (input.running) await new Promise((resolve, reject) => {
    const abort = () => { aborts++; reject(signal.reason); };
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
  return { kind: "search", searchId: "synthetic-unexpected-fresh-search" };
} };
const runner = moduleURL(`const s=globalThis.__durableRecovery;
export const startAuctionGearSearch=(_input,_owner,_token,signal)=>s.run(signal);
export const continueAuctionGearSearch=async entry=>({kind:'search',searchId:entry.id,preserved:entry.searchCheckpoint.nextOption});
export const assembleAuctionGearSearch=async()=>{throw Error('unexpected_assembly')};
export const selectedAuctionGearAssemblyOptions=()=>[];export const verifyAuctionGearSearch=async()=>{};`);
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/auth") return { url: moduleURL("export async function auth(){return globalThis.__durableRecovery.auth()}"), shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner" || context.parentURL?.endsWith("/auctionGearWork.ts") && specifier === "./auctionGearRunner") return { url: runner, shortCircuit: true };
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
} });
globalThis.fetch = async () => { throw Error("unexpected_network_in_durable_recovery"); };
const jobs = await import("../../../lib/wow/auctionGearJobs.ts");
const store = await import("../../../lib/wow/auctionGearSearchStore.ts");
const persistence = await import("../../../lib/wow/auctionGearPersistence.ts");
const { createAuctionGearDiscovery } = await import("../../../lib/wow/auctionGearDiscovery.ts");
const route = await import("../../../app/api/wow/auction-gear-plans/route.ts");
const { resumeOwnedAuctionGearWork } = await import("../../../lib/wow/auctionGearWork.ts");
async function send(method, body, query = { clientRequestId: nonce, ...scope }) {
  const response = await route[method](new Request("https://gildra.example/api/wow/auction-gear-plans?" + new URLSearchParams(query), { method,
    headers: { host: "gildra.example", origin: "https://gildra.example" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  const result = { status: response.status, body: await response.json() };
  assert(!JSON.stringify(result).includes("cancellationPending"));
  return result;
}
function context() {
  const market = { id: "synthetic", sourceUpdatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), offers: [] };
  const season = { id: "synthetic", patch: "synthetic", expansionId: 11, activityNames: [] };
  return { input: { ...scope, budgetCopper: 1, scenario: "single-target", selectedSlots: ["HEAD"] },
    character: { id: 1, level: 90, playableClass: { id: 1 }, playableRace: { id: 1 }, faction: { type: "ALLIANCE" } },
    armory: { equipment: { equipped_items: [] }, profile: {}, specializations: {}, activeTalentLoadout: "synthetic" },
    options: [], loadout: [], specId: 72, specSlug: "fury-warrior", market, currentBySlot: new Map(), discovery: createAuctionGearDiscovery(market, 1),
    discoverySeason: season, encounter: { fightLengthSeconds: 120, targets: 1 }, coverage: {}, searchLimited: true, publicMarket: {},
    profileFingerprint: "synthetic", scenario: "single-target", marketChange: {}, simulate: async () => {}, discoveryContext: () => {} };
}
const countSearches = () => fs.readdirSync(process.env.GILDRA_AUCTION_STATE_DIR).filter(name => /^search-.*\.bin$/.test(name)).length;
function rawRecord(kind, id) {
  const path = join(process.env.GILDRA_AUCTION_STATE_DIR, `${kind}-${id}.bin`), raw = fs.readFileSync(path), length = raw.readUInt32BE(0);
  return { path, header: JSON.parse(raw.subarray(4, 4 + length)), body: deserialize(gunzipSync(raw.subarray(4 + length))) };
}
function rewrite(record) {
  const header = Buffer.from(JSON.stringify(record.header)), prefix = Buffer.alloc(4); prefix.writeUInt32BE(header.length);
  fs.writeFileSync(record.path, Buffer.concat([prefix, header, gzipSync(serialize(record.body))]));
}
const fingerprint = "d".repeat(64);
const precisionInput = () => context().input;
let output;
if (mode === "cancel-seed") {
  if (!input.running) jobs.enqueueAuctionGearJob("synthetic-blocker", async () => new Promise(() => {}));
  const action = input.action ?? "search";
  const entry = action === "search" ? null : store.createAuctionGearSearch(owner, context());
  const body = entry ? { action, searchId: entry.id, clientRequestId: nonce, ...(action === "assemble" ? { excludedOptionIds: [] } : {}) }
    : { action, ...scope, budgetGold: "1", selectedSlots: ["HEAD"], clientRequestId: nonce };
  const accepted = await send("POST", body); assert.equal(accepted.status, 202); assert.equal(accepted.body.status, "queued");
  assert.equal(jobs.getAuctionGearJob(owner, accepted.body.id).status, input.running ? "running" : "queued");
  const original = fs.renameSync;
  fs.renameSync = (from, to) => { if (String(to).endsWith(`job-${accepted.body.id}.bin`)) { const error = Error("synthetic_write_failure"); error.code = "EIO"; throw error; } return original(from, to); };
  syncBuiltinESMExports();
  try {
    assert.equal((await send("DELETE")).status, 503);
    await tick(); await tick();
    if (input.running) { assert.equal(tasks, 1); assert.equal(aborts, 1); }
    if (input.checkPending) {
      assert.equal((await send("GET")).status, 503, "An undurable memory cancellation must not be returned as an acknowledged terminal result");
      assert.equal((await send("POST", body)).status, 503);
      currentToken = "synthetic-foreign-owner";
      assert.equal((await send("GET")).status, 404);
      currentToken = token;
    }
  } finally { fs.renameSync = original; syncBuiltinESMExports(); }
  const repaired = input.repair === "replay" ? await send("POST", body) : input.repair === "get" ? await send("GET")
    : input.repair === "id" ? await send("DELETE", undefined, { id: accepted.body.id }) : await send("DELETE");
  assert.equal(repaired.status, input.repair === "replay" ? 202 : 200); assert.equal(repaired.body.status, "cancelled"); assert.equal(repaired.body.error, "cancelled");
  const disk = persistence.readAuctionState("job", accepted.body.id);
  assert.equal(disk.data.status, "cancelled", "A successful retry must have committed cancellation before acknowledging it");
  assert(!Object.hasOwn(disk.data, "cancellationPending")); assert(!Object.hasOwn(disk.metadata, "cancellationPending"));
  output = { id: accepted.body.id };
} else if (mode === "cancel-read") {
  const recovered = await send("GET"); await tick(); await tick();
  assert.equal(recovered.status, 200); assert.equal(recovered.body.id, input.id); assert.equal(recovered.body.status, "cancelled");
  assert.equal(tasks, 0, "A previously acknowledged cancellation must not execute after restart");
  output = { status: recovered.body.status, tasks };
} else if (mode === "search-initial") {
  const entry = store.createAuctionGearSearch(owner, context());
  entry.searchCheckpoint = { version: 1, nextOption: 73 }; store.saveAuctionGearSearch(entry);
  const jobOwner = input.variant === "foreign" ? "synthetic-foreign-owner" : owner;
  const job = jobs.enqueueAuctionGearJob(jobOwner, async () => input.variant === "completed" ? { kind: "search", searchId: entry.id } : await new Promise(() => {}),
    { scope, searchId: entry.id, continuation: true, work: { action: "resume", searchId: entry.id } });
  await tick(); output = { searchId: entry.id, jobId: job.id, variant: input.variant };
} else if (mode === "search-fill") {
  assert(jobs.getAuctionGearJob(input.variant === "foreign" ? "synthetic-foreign-owner" : owner, input.jobId));
  for (let i = 0; i < 39; i++) {
    const actor = "synthetic-serialized-owner-" + i;
    const job = jobs.enqueueAuctionGearJob(actor, async () => ({ kind: "search", searchId: store.createAuctionGearSearch(actor, context()).id }));
    await tick(); assert.equal(jobs.getAuctionGearJob(actor, job.id).status, "completed");
  }
  if (input.crash) {
    const unlink = fs.unlinkSync;
    fs.unlinkSync = path => {
      if (String(path).includes("/search-")) {
        console.log(JSON.stringify({ files: countSearches(), selectedVictim: String(path).split("/").at(-1).slice(7, -4) }));
        process.exit(0); // Real process exit between durable replacement and obsolete unlink.
      }
      return unlink(path);
    };
    syncBuiltinESMExports();
  }
  const actor = "synthetic-replacement-owner";
  const job = jobs.enqueueAuctionGearJob(actor, async () => ({ kind: "search", searchId: store.createAuctionGearSearch(actor, context()).id }));
  await tick(); assert.equal(jobs.getAuctionGearJob(actor, job.id).status, "completed");
  output = { files: countSearches() };
} else if (mode === "search-read") {
  const entry = store.getAuctionGearSearch(owner, input.searchId);
  assert.equal(Boolean(entry), !input.expectMissing, "Overflow recovery must protect active searches and only evict inactive/foreign records");
  let resumed = false;
  if (entry) {
    assert.equal(entry.searchCheckpoint.nextOption, 73);
    resumeOwnedAuctionGearWork(owner, input.jobId, token); await tick(); await tick();
    const job = jobs.getAuctionGearJob(owner, input.jobId);
    assert.equal(job.status, "completed"); assert.equal(job.result.preserved, 73); resumed = true;
  }
  assert.equal(countSearches(), 40); output = { retained: Boolean(entry), resumed };
} else if (mode === "search-read-error") {
  const original = fs.readSync;
  fs.readSync = (fd, ...args) => { if (fs.readlinkSync(`/proc/self/fd/${fd}`).includes("/job-")) { const error = Error("synthetic_job_read_failure"); error.code = "EIO"; throw error; } return original(fd, ...args); };
  syncBuiltinESMExports();
  try { assert.throws(() => store.getAuctionGearSearch(owner, input.searchId), /auction_storage_unavailable/); }
  finally { fs.readSync = original; syncBuiltinESMExports(); }
  assert.equal(countSearches(), 41, "Failure to establish active ownership cannot delete an acknowledged checkpoint");
  output = { preserved: countSearches() };
} else if (mode === "precision-search-seed") {
  const entry = store.createAuctionGearSearch(owner, context());
  const record = rawRecord("search", entry.id);
  // The deployed legacy reader accepts exactly native-apl-v1 for every kind.
  assert.notEqual(record.header.simulationContract, "native-apl-v1", "An old web must reject new precision checkpoints on rollback");
  assert.equal(record.header.simulationContract, record.body.simulationContract);
  record.header.simulationContract = record.body.simulationContract = "native-apl-v1"; rewrite(record);
  const ack = jobs.cancelAuctionGearRequest(owner, nonce, scope);
  assert.equal(rawRecord("job", ack.id).header.simulationContract, "native-apl-v1", "Cancellation barriers keep the legacy-compatible job envelope");
  output = { searchId: entry.id, ackId: ack.id };
} else if (mode === "precision-search-read") {
  assert.equal(store.getAuctionGearSearch(owner, input.searchId), null);
  assert.equal(fs.existsSync(join(process.env.GILDRA_AUCTION_STATE_DIR, `search-${input.searchId}.bin`)), false);
  assert.equal(jobs.getAuctionGearJob(owner, input.ackId).status, "cancelled");
  output = { legacySearchRejected: true };
} else if (mode === "precision-results-seed") {
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const job = jobs.enqueueAuctionGearJob(owner, async () => ({ kind: "search", searchId: `synthetic-legacy-${i}`, baseline: { dps: 100, dpsError: 0.1 } }),
      { scope, clientRequestId: `${nonce}-${i}`, requestFingerprint: fingerprint, work: { action: "search", input: precisionInput() } });
    await tick(); assert.equal(jobs.getAuctionGearJob(owner, job.id).status, "completed");
    const record = rawRecord("job", job.id);
    delete record.header.metadata.resultMeasurementContract; delete record.body.metadata.resultMeasurementContract; delete record.body.data.resultMeasurementContract;
    rewrite(record); ids.push(job.id);
  }
  const ack = jobs.cancelAuctionGearRequest(owner, nonce, scope);
  output = { ids, ackId: ack.id };
} else if (mode === "precision-results-read") {
  for (const id of input.ids) {
    const job = jobs.getAuctionGearJob(owner, id);
    assert.equal(job.status, "failed"); assert.equal(job.error, "simulation_version_changed"); assert.equal(job.result, null);
  }
  const replay = jobs.enqueueAuctionGearJob(owner, async () => { throw Error("legacy_replay_must_not_run"); },
    { scope, clientRequestId: `${nonce}-0`, requestFingerprint: fingerprint, work: { action: "search", input: precisionInput() } });
  assert.equal(replay.id, input.ids[0]); assert.equal(replay.status, "failed"); assert.equal(replay.result, null);
  assert.throws(() => jobs.enqueueAuctionGearJob(owner, async () => ({})), /plan_rate_limited/, "Invalidated legacy results do not erase their rate history");
  assert.equal(jobs.cancelAuctionGearRequest(owner, nonce, scope).id, input.ackId);
  assert.equal(jobs.getAuctionGearJob(owner, input.ackId).status, "cancelled"); output = { status: "passed" };
} else if (mode === "precision-queued-seed") {
  const job = jobs.enqueueAuctionGearJob(owner, async () => await new Promise(() => {}),
    { scope, clientRequestId: nonce, requestFingerprint: fingerprint, work: { action: "search", input: precisionInput() } });
  output = { id: job.id };
} else if (mode === "precision-queued-read") {
  assert.equal((await send("GET")).status, 200); await tick(); await tick();
  const job = jobs.getAuctionGearJob(owner, input.id); assert.equal(job.status, "completed"); assert.equal(tasks, 1);
  const record = rawRecord("job", job.id);
  assert.equal(record.header.metadata.resultMeasurementContract, "native-dps-mean-v1");
  assert.equal(record.body.data.resultMeasurementContract, "native-dps-mean-v1"); output = { tasks };
} else throw Error("unknown_durable_recovery_fixture");
console.log(JSON.stringify(output));
