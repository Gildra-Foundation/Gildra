import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "../../../lib/wow/auctionGearSearchStore.ts";
import * as jobs from "../../../lib/wow/auctionGearJobs.ts";
import { runApiChild } from "./api-process-support.mjs";

const token = "synthetic-admission-token", foreignToken = "synthetic-foreign-admission-token";
const owner = value => createHash("sha256").update(`battle-net:${value}`).digest("hex");
const scope = { characterSlug: "synthetic-admission", locale: "en" };
const moduleURL = source => `data:text/javascript,${encodeURIComponent(source)}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
let session = { battleNetAccessToken: token }, calls = 0, aborts = 0;
globalThis.__cancelAdmission = { auth: () => session, run: async signal => {
  calls++;
  await new Promise((resolve, reject) => {
    const abort = () => { aborts++; reject(signal.reason); };
    if (signal.aborted) abort(); else signal.addEventListener("abort", abort, { once: true });
  });
} };
const runnerStub = moduleURL(`
const s=globalThis.__cancelAdmission;
export const startAuctionGearSearch=(_input,_owner,_token,signal)=>s.run(signal);
export const continueAuctionGearSearch=(_entry,signal)=>s.run(signal);
export const assembleAuctionGearSearch=(_entry,_selection,signal)=>s.run(signal);
export const verifyAuctionGearSearch=async(_entry,_token,signal)=>signal.throwIfAborted();
export const selectedAuctionGearAssemblyOptions=()=>[];`);
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") return { url: moduleURL("export async function auth(){return globalThis.__cancelAdmission.auth()}"), shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner" || (context.parentURL?.endsWith("/auctionGearWork.ts") && specifier === "./auctionGearRunner")) return { url: runnerStub, shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
} });
globalThis.fetch = async () => { throw Error("unexpected_network_in_admission_test"); };
const route = await import("../../../app/api/wow/auction-gear-plans/route.ts");
async function send(method, body, query = {}, signal) {
  const response = await route[method](new Request(`https://gildra.example/api/wow/auction-gear-plans?${new URLSearchParams(query)}`, { method,
    headers: { host: "gildra.example", origin: "https://gildra.example" }, ...(body ? { body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) }));
  return { status: response.status, body: await response.json() };
}
const search = nonce => ({ action: "search", ...scope, budgetGold: "1", selectedSlots: ["WRIST"], clientRequestId: nonce });
const query = nonce => ({ clientRequestId: nonce, ...scope });
const createEntry = () => store.createAuctionGearSearch(owner(token), { input: scope, options: [] });

test("cancelling a nonce before admission prevents a delayed search, resume or assembly from starting", async () => {
  for (const action of ["search", "resume", "assemble"]) {
    const nonce = `synthetic-cancel-before-${action}`;
    const entry = action === "search" ? null : createEntry();
    const body = entry ? { action, searchId: entry.id, clientRequestId: nonce, ...(action === "assemble" ? { excludedOptionIds: [] } : {}) } : search(nonce);
    let stream;
    const request = new Request("https://gildra.example/api/wow/auction-gear-plans", { method: "POST", duplex: "half",
      headers: { host: "gildra.example", origin: "https://gildra.example" }, body: new ReadableStream({ start(controller) { stream = controller; } }) });
    const pending = route.POST(request); await tick();
    const cancelled = await send("DELETE", undefined, query(nonce));
    assert.equal(cancelled.status, 200); assert.equal(cancelled.body.status, "cancelled");
    stream.enqueue(new TextEncoder().encode(JSON.stringify(body))); stream.close();
    const late = await pending; assert.equal(late.status, 202);
    const payload = await late.json(); assert.equal(payload.status, "cancelled"); assert.equal(payload.id, cancelled.body.id);
    assert.equal((await send("GET", undefined, query(nonce))).body.status, "cancelled");
  }
  assert.equal(calls, 0);
});

test("cancellation before admission survives a real web-process restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gildra-auction-cancel-admission-"));
  try {
    const cancelled = await runApiChild(directory, "cancel-before-seed");
    const late = await runApiChild(directory, "cancel-before-recover", cancelled);
    assert.equal(late.status, "passed"); assert.equal(late.tasks, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("nonce cancellation is owner and scope bound and aborts accepted running work once", async () => {
  const nonce = "synthetic-cancel-running-request";
  const accepted = await send("POST", search(nonce)); assert.equal(accepted.status, 202); await tick();
  const before = calls;
  assert.equal((await send("DELETE", undefined, { ...query(nonce), locale: "ru" })).status, 400);
  session = { battleNetAccessToken: foreignToken };
  const foreign = await send("DELETE", undefined, query(nonce)); assert.equal(foreign.status, 200);
  assert.notEqual(foreign.body.id, accepted.body.id);
  session = { battleNetAccessToken: token };
  assert.equal((await send("GET", undefined, { id: accepted.body.id, ...scope })).body.status, "running");
  const first = await send("DELETE", undefined, query(nonce)), again = await send("DELETE", undefined, query(nonce));
  assert.equal(first.body.id, accepted.body.id); assert.equal(again.body.id, first.body.id);
  assert.equal(first.body.status, "cancelled"); assert.equal(again.body.status, "cancelled");
  await tick(); await tick(); assert.equal(calls, before); assert.equal(aborts, 1);
});

test("nonce cancellation removes accepted queued work without executing its task", async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  jobs.enqueueAuctionGearJob("synthetic-global-blocker", async () => { await held; return { kind: "search", searchId: "synthetic-blocker" }; });
  const nonce = "synthetic-cancel-queued-request", before = calls;
  try {
    const accepted = await send("POST", search(nonce)); assert.equal(accepted.status, 202); assert.equal(accepted.body.status, "queued");
    const cancelled = await send("DELETE", undefined, query(nonce)); assert.equal(cancelled.body.status, "cancelled");
  } finally { release(); await tick(); await tick(); }
  assert.equal(calls, before);
});

test("an already aborted POST cannot enqueue a search or continuation", async () => {
  for (const action of ["search", "resume", "assemble"]) {
    const nonce = `synthetic-aborted-before-${action}`, before = calls;
    const entry = action === "search" ? null : createEntry();
    const body = entry ? { action, searchId: entry.id, clientRequestId: nonce, ...(action === "assemble" ? { excludedOptionIds: [] } : {}) } : search(nonce);
    const result = await send("POST", body, {}, AbortSignal.abort());
    assert.notEqual(result.status, 202);
    assert.equal((await send("GET", undefined, query(nonce))).status, 404);
    assert.equal(calls, before);
  }
});

test("a launching POST held beyond the acceptance deadline cannot enqueue any action", async () => {
  const actualNow = Date.now;
  try {
    for (const action of ["search", "resume", "assemble"]) {
      const nonce = `synthetic-deadline-before-${action}`, before = calls;
      const entry = action === "search" ? null : createEntry();
      const body = entry ? { action, searchId: entry.id, clientRequestId: nonce, ...(action === "assemble" ? { excludedOptionIds: [] } : {}) } : search(nonce);
      let stream;
      const started = actualNow(); Date.now = () => started;
      const pending = route.POST(new Request("https://gildra.example/api/wow/auction-gear-plans", { method: "POST", duplex: "half",
        headers: { host: "gildra.example", origin: "https://gildra.example" }, body: new ReadableStream({ start(controller) { stream = controller; } }) }));
      await tick(); Date.now = () => started + 35000;
      stream.enqueue(new TextEncoder().encode(JSON.stringify(body))); stream.close();
      const response = await pending;
      assert.notEqual(response.status, 202); assert.equal((await response.json()).error, "plan_request_expired");
      assert.equal((await send("GET", undefined, query(nonce))).status, 404); assert.equal(calls, before);
      Date.now = actualNow;
    }
  } finally { Date.now = actualNow; }
});

test("at 200 retained jobs a failed replacement preserves the old result and cancellation markers cannot be evicted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gildra-auction-capacity-"));
  try {
    const handles = await runApiChild(directory, "capacity-seed");
    const result = await runApiChild(directory, "capacity-recover", handles);
    assert.equal(result.oldResultSurvivedFailedWriteAndRestart, true);
    assert.equal(result.cancellationSurvived25Replacements, true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("new cancellation identities have a minute rate while acknowledged retries remain available", async () => {
  const previous = session, actualNow = Date.now;
  session = { battleNetAccessToken: "synthetic-marker-cap-token" };
  try {
    let first;
    for (let i = 0; i < 60; i++) {
      const cancelled = await send("DELETE", undefined, query(`synthetic-marker-cap-${i}`));
      assert.equal(cancelled.status, 200);
      if (i === 0) first = cancelled.body.id;
    }
    const full = await send("DELETE", undefined, query("synthetic-marker-cap-overflow"));
    assert.equal(full.status, 429); assert.equal(full.body.error, "plan_rate_limited");
    assert.equal((await send("DELETE", undefined, query("synthetic-marker-cap-0"))).body.id, first);
    const later = actualNow() + 60_001; Date.now = () => later;
    const afterExpiry = await send("DELETE", undefined, query("synthetic-marker-cap-after-expiry"));
    assert.equal(afterExpiry.status, 200); assert.equal(afterExpiry.body.status, "cancelled");
    assert.equal((await send("DELETE", undefined, query("synthetic-marker-cap-0"))).body.id, first, "Minute admission renewal preserves the existing cancellation ACK");
  } finally { session = previous; Date.now = actualNow; }
});

test("failed assembly checkpoint persistence cannot admit orphan work", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gildra-auction-assembly-admission-"));
  try {
    const result = await runApiChild(directory, "assembly-search-save-failure");
    assert.equal(result.postStatus, 503); assert.equal(result.postError, "auction_storage_unavailable");
    assert.equal(result.tasksExecuted, 0, "A failed POST must not launch assembly after its durable search write failed");
    assert.equal(result.recoveredStatus, 404, "A rejected assembly must not leave an accepted durable job behind");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an already active assembly keeps its exclusions when another intent is rejected", async () => {
  const entry = createEntry(), nonce = "synthetic-preserve-active-selection";
  const first = await send("POST", { action: "assemble", searchId: entry.id, excludedOptionIds: ["old"], clientRequestId: nonce });
  assert.equal(first.status, 202); await tick();
  try {
    const rejected = await send("POST", { action: "assemble", searchId: entry.id, excludedOptionIds: ["new"], clientRequestId: `${nonce}-other` });
    assert.equal(rejected.status, 409); assert.deepEqual(entry.excludedOptionIds, ["old"]);
  } finally { await send("DELETE", undefined, query(nonce)); await tick(); }
});
test.after(() => { hook.deregister(); delete globalThis.__cancelAdmission; });
