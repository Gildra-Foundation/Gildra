import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as jobs from "../../../lib/wow/auctionGearJobs.ts";

// Actual API and Jobs modules; only auth and expensive Runner transports are
// replaced. No network, account credentials, database or native worker is used.
const digest = value => createHash("sha256").update(value).digest("hex");
const paths = ["app/api/wow/auction-gear-plans/route.ts", "lib/wow/auctionGearJobs.ts"];
const sourceHashes = async () => Object.fromEntries(await Promise.all(paths.map(async path =>
  ["apps/web/" + path, digest(await readFile(new URL("../../../" + path, import.meta.url)))])));
const beforeSources = await sourceHashes();
const syntheticResult = index => ({ kind: "search", searchId: `synthetic-nonce-search-${index}`, selectedSlots: ["HEAD", "WRIST"],
  budgetCopper: 10000, baseline: { dps: 1000, dpsError: .1, confidence: 95, iterations: 750, engine: "SimulationCraft synthetic-request-recovery" },
  items: [], searchComplete: true, pendingItems: 0, simulations: 1, engine: "SimulationCraft synthetic-request-recovery",
  searchLimited: false, optionsConsidered: 0 });
let session = null, currentHarness, sequence = 0;
globalThis.__gildraRequestRecoveryTest = { auth: () => session, start: async (...args) => currentHarness.start(...args) };
const dataModule = value => `data:text/javascript,${encodeURIComponent(value)}`;
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") return { url: dataModule("export async function auth(){return globalThis.__gildraRequestRecoveryTest.auth()}"), shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner") return { url: dataModule(`
export const startAuctionGearSearch=(...args)=>globalThis.__gildraRequestRecoveryTest.start(...args);
export const continueAuctionGearSearch=async()=>{throw Error('unexpected_expensive_resume')};
export const assembleAuctionGearSearch=async()=>{throw Error('unexpected_expensive_assembly')};
export const selectedAuctionGearAssemblyOptions=()=>{throw Error('unexpected_assembly_selection')};
export const verifyAuctionGearSearch=async()=>{throw Error('unexpected_expensive_verify')};`), shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
} });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error("unexpected_network_request"); };
const route = await import("../../../app/api/wow/auction-gear-plans/route.ts");
const tick = () => new Promise(resolve => setImmediate(resolve));
const base = () => ({ action: "search", characterSlug: "synthetic-request-character", locale: "en", budgetGold: "1",
  selectedSlots: ["HEAD", "WRIST"], scenario: "single-target" });
const clientId = number => `synthetic-client-request-${number}`;
async function harness(callback, { hold = true } = {}) {
  const token = `synthetic-request-owner-${++sequence}`, owner = digest(`battle-net:${token}`);
  let release;
  const held = hold ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const state = { token, owner, calls: [], start: async (input, _owner, _token, signal) => {
    state.calls.push(structuredClone(input)); await held; signal.throwIfAborted(); return syntheticResult(sequence);
  } };
  currentHarness = state; session = { battleNetAccessToken: token };
  try { return await callback(state); }
  finally {
    release?.(); await tick();
    for (const job of globalThis.__gildraAuctionJobs?.values() ?? []) if (job.owner === owner)
      jobs.cancelAuctionGearJob(owner, job.id);
    await tick(); session = null;
  }
}
async function request(method, query = {}, body, headers = {}) {
  const response = await route[method](new Request(`https://gildra.example/api/wow/auction-gear-plans?${new URLSearchParams(query)}`, {
    method, headers: { host: "gildra.example", origin: "https://gildra.example", ...(body ? { "content-type": "application/json" } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json(), serialized = JSON.stringify(payload);
  for (const privateField of ["requestFingerprint", "clientRequestId", "controller", "expires", "battleNetAccessToken"])
    assert(!serialized.includes(privateField), `private job field leaked: ${privateField}`);
  if (currentHarness) { assert(!serialized.includes(currentHarness.token)); assert(!serialized.includes(currentHarness.owner)); }
  return { status: response.status, payload };
}
const recoveryQuery = id => ({ clientRequestId: id, characterSlug: base().characterSlug, locale: "en" });
const tests = [], test = (name, run, control = false) => tests.push({ name, run, control });

test("accepted initial search is recoverable when its 202 response is lost", async () => harness(async h => {
  const posted = await request("POST", {}, { ...base(), clientRequestId: clientId(1) });
  assert.equal(posted.status, 202);
  const recovered = await request("GET", recoveryQuery(clientId(1)));
  assert.equal(recovered.status, 200); assert.equal(recovered.payload.id, posted.payload.id);
  assert.deepEqual(recovered.payload.scope, { characterSlug: base().characterSlug, locale: "en" });
  assert.equal(h.calls.length, 1, "GET recovery must not start another expensive task");
}));
test("an identical repeated POST returns the same active job before owner and quota checks", async () => harness(async h => {
  const body = { ...base(), clientRequestId: clientId(2) }, first = await request("POST", {}, body);
  assert.equal(first.status, 202);
  const again = await request("POST", {}, body);
  assert.equal(again.status, 202); assert.equal(again.payload.id, first.payload.id); assert.equal(h.calls.length, 1);
}));
test("canonical budget slots and default scenario produce the same request fingerprint", async () => harness(async h => {
  const first = await request("POST", {}, { ...base(), clientRequestId: clientId(3) }); assert.equal(first.status, 202);
  const equivalent = { ...base(), clientRequestId: clientId(3), budgetGold: "1.0000", selectedSlots: ["WRIST", "HEAD"] };
  delete equivalent.scenario;
  const second = await request("POST", {}, equivalent);
  assert.equal(second.status, 202); assert.equal(second.payload.id, first.payload.id); assert.equal(h.calls.length, 1);
}));
test("reusing one request ID for any changed validated input rejects with 400", async () => harness(async h => {
  const body = { ...base(), clientRequestId: clientId(4) };
  assert.equal((await request("POST", {}, body)).status, 202);
  for (const patch of [{ budgetGold: "2" }, { selectedSlots: ["HEAD"] }, { scenario: "aoe" },
    { characterSlug: "other-character" }, { locale: "ru" }]) {
    const conflicting = await request("POST", {}, { ...body, ...patch });
    assert.equal(conflicting.status, 400); assert.equal(conflicting.payload.error, "invalid_plan_request");
  }
  assert.equal(h.calls.length, 1);
}));
test("completed replay consumes neither a fourth search quota nor a new expensive task", async () => harness(async h => {
  const firstBody = { ...base(), clientRequestId: clientId(5) }, first = await request("POST", {}, firstBody);
  assert.equal(first.status, 202); await tick();
  for (const id of [6, 7]) { assert.equal((await request("POST", {}, { ...base(), clientRequestId: clientId(id) })).status, 202); await tick(); }
  const repeated = await request("POST", {}, firstBody);
  assert.equal(repeated.status, 202); assert.equal(repeated.payload.id, first.payload.id); assert.equal(repeated.payload.status, "completed");
  assert.equal(h.calls.length, 3);
  const fourth = await request("POST", {}, { ...base(), clientRequestId: clientId(8) }); assert.equal(fourth.status, 429);
}, { hold: false }));
test("request lookup is owner character and locale bound", async () => harness(async h => {
  const id = clientId(9);
  jobs.enqueueAuctionGearJob(h.owner, async () => syntheticResult(sequence), { scope: { characterSlug: base().characterSlug, locale: "en" },
    clientRequestId: id, requestFingerprint: digest("synthetic-private-fingerprint") });
  const good = await request("GET", recoveryQuery(id)); assert.equal(good.status, 200);
  assert.equal((await request("GET", { ...recoveryQuery(id), characterSlug: "wrong-character" })).status, 404);
  assert.equal((await request("GET", { ...recoveryQuery(id), locale: "ru" })).status, 404);
  session = { battleNetAccessToken: "synthetic-foreign-request-owner" };
  assert.equal((await request("GET", recoveryQuery(id))).status, 404);
}));
test("mixed recovery identifiers are rejected instead of selecting another lookup", async () => harness(async h => {
  const job = jobs.enqueueAuctionGearJob(h.owner, async () => syntheticResult(sequence), { scope: { characterSlug: base().characterSlug, locale: "en" } });
  for (const mixed of [{ id: job.id }, { searchId: "synthetic-search" }, { id: job.id, searchId: "synthetic-search" }])
    assert.equal((await request("GET", { ...recoveryQuery(clientId(10)), ...mixed })).status, 400);
}));
test("malformed request IDs and missing lookup scope are rejected with 400", async () => harness(async h => {
  for (const id of ["", "short", "a".repeat(101), "invalid client request id", "request_unsafe_!@"]) {
    assert.equal((await request("GET", recoveryQuery(id))).status, 400);
    assert.equal((await request("POST", {}, { ...base(), clientRequestId: id })).status, 400);
  }
  for (const query of [{ clientRequestId: clientId(11) }, { clientRequestId: clientId(11), characterSlug: base().characterSlug },
    { ...recoveryQuery(clientId(11)), locale: "xx" }, { ...recoveryQuery(clientId(11)), characterSlug: "" }])
    assert.equal((await request("GET", query)).status, 400);
  assert.equal(h.calls.length, 0);
}));
test("guest and cross-site nonce recovery remain blocked without starting work", async () => harness(async h => {
  session = null; assert.equal((await request("GET", recoveryQuery(clientId(12)))).status, 401);
  session = { battleNetAccessToken: h.token };
  assert.equal((await request("GET", recoveryQuery(clientId(12)), undefined, { origin: "https://foreign.example" })).status, 403);
  assert.equal((await request("POST", {}, { ...base(), clientRequestId: clientId(12) }, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal(h.calls.length, 0);
}), true);
test("invalid POST request ID types are rejected before enqueue", async () => harness(async h => {
  for (const value of [null, 123, [], {}, true]) assert.equal((await request("POST", {}, { ...base(), clientRequestId: value })).status, 400);
  assert.equal(h.calls.length, 0);
}), true);
test("legacy POST and job ID polling keep their existing semantics", async () => harness(async h => {
  const first = await request("POST", {}, base()); assert.equal(first.status, 202);
  assert.equal((await request("POST", {}, base())).status, 409);
  const polled = await request("GET", { id: first.payload.id }); assert.equal(polled.status, 200); assert.equal(polled.payload.id, first.payload.id);
  assert.equal(h.calls.length, 1);
}), true);
test("identical client IDs belonging to distinct owners create distinct jobs", async () => harness(async h => {
  const body = { ...base(), clientRequestId: clientId(13) }, first = await request("POST", {}, body); assert.equal(first.status, 202);
  session = { battleNetAccessToken: "synthetic-second-valid-owner" };
  const second = await request("POST", {}, body); assert.equal(second.status, 202); assert.notEqual(second.payload.id, first.payload.id);
  jobs.cancelAuctionGearJob(digest("battle-net:synthetic-second-valid-owner"), second.payload.id);
  assert.equal(h.calls.length, 1, "second task stays queued while first owner's task is held");
}));
test("job replay is found before the full shared queue capacity check", async () => harness(async h => {
  const nonce = clientId(14), fingerprint = digest("synthetic-job-request"), gate = new Promise(resolve => { h.releaseQueue = resolve; });
  const first = jobs.enqueueAuctionGearJob(h.owner, async () => { await gate; return syntheticResult(sequence); },
    { scope: { characterSlug: base().characterSlug, locale: "en" }, clientRequestId: nonce, requestFingerprint: fingerprint });
  const queued = [];
  try {
    for (let index = 0; index < 8; index++) queued.push({ owner: `synthetic-queue-owner-${index}`, job: jobs.enqueueAuctionGearJob(
      `synthetic-queue-owner-${index}`, async () => syntheticResult(sequence)) });
    const repeated = jobs.enqueueAuctionGearJob(h.owner, async () => { throw Error("must_not_run_replayed_task"); },
      { scope: { characterSlug: base().characterSlug, locale: "en" }, clientRequestId: nonce, requestFingerprint: fingerprint });
    assert.equal(repeated.id, first.id);
  } finally { for (const entry of queued) jobs.cancelAuctionGearJob(entry.owner, entry.job.id); h.releaseQueue(); await tick(); }
}));

const phase = process.argv[2] ?? "green"; assert(["red", "green"].includes(phase));
const rows = [];
try {
  for (const { name, run, control } of tests) {
    try { await run(); rows.push({ name, control, status: "passed" }); }
    catch (error) { rows.push({ name, control, status: "failed", error: { name: error.name, message: error.message } }); }
  }
} finally { hook.deregister(); globalThis.fetch = originalFetch; delete globalThis.__gildraRequestRecoveryTest; }
const afterSources = await sourceHashes(); assert.deepEqual(afterSources, beforeSources, "product source changed during request recovery evidence run");
const report = { phase, status: rows.some(value => value.status === "failed") ? "failed" : "passed", sourceRevision: process.env.RELIABILITY_SOURCE_REVISION ?? null,
  method: "Actual API/Jobs modules; synthetic auth and expensive Runner tasks only; zero network/native/service calls.",
  sourceFilesSHA256AtStart: beforeSources, sourceFilesSHA256AtEnd: afterSources,
  testSHA256: digest(await readFile(fileURLToPath(import.meta.url))),
  cases: rows, passed: rows.filter(value => value.status === "passed").length, failed: rows.filter(value => value.status === "failed").length };
const output = process.env.AUCTION_REGRESSION_OUTPUT_DIR ? resolve(process.env.AUCTION_REGRESSION_OUTPUT_DIR, `request-${phase}.json`)
  : fileURLToPath(new URL(`../../../../../.artifacts/auction-reliability-20261016/request-${phase}.json`, import.meta.url));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: phase === "red" ? "wx" : "w" });
for (const row of rows) console.log(`${row.status === "passed" ? "PASS" : "FAIL"} ${row.name}${row.error ? `: ${row.error.message.split("\n")[0]}` : ""}`);
console.log(JSON.stringify({ phase, passed: report.passed, failed: report.failed }));
if (phase === "red") {
  assert(report.failed >= 8, "RED must reproduce the missing desired recovery/idempotency behavior");
  assert(rows.filter(value => value.control).every(value => value.status === "passed"), "RED controls must pass");
} else assert.equal(report.failed, 0, "request recovery regressions must all pass");
