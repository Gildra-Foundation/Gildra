import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { syncBuiltinESMExports } from "node:module";
import fs from "node:fs";
import * as store from "../../../lib/wow/auctionGearSearchStore.ts";
import * as jobs from "../../../lib/wow/auctionGearJobs.ts";
import { createAuctionGearDiscovery } from "../../../lib/wow/auctionGearDiscovery.ts";
import { selectedAuctionGearAssemblyOptions } from "../../../lib/wow/auctionGearRunner.ts";

const mode = process.argv[2], input = JSON.parse(process.argv[3] ?? "{}");
const token = "synthetic-current-authenticated-owner-token";
const owner = createHash("sha256").update(`battle-net:${token}`).digest("hex");
const scope = { characterSlug: "synthetic-http-restart", locale: "en" };
const nonce = "synthetic-http-restart-request";
const baseline = { dps: 1000, dpsError: 1, confidence: 95, iterations: 1000, engine: "SimulationCraft synthetic-restart" };
const tick = () => new Promise(resolve => setImmediate(resolve));
let session = { battleNetAccessToken: token }, seededEntry;
const calls = [], verified = [];
function context() {
  const season = { id: "synthetic", patch: "synthetic", expansionId: 11, activityNames: [] };
  const market = { id: "synthetic", region: "eu", connectedRealmId: 1, sourceUpdatedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), offers: [] };
  return { input: { ...scope, budgetCopper: 10000, selectedSlots: ["WRIST"], scenario: "single-target" },
    character: { id: 1, name: "Synthetic", level: 81, region: "eu", playableClass: { id: 1 }, playableRace: { id: 1 },
      faction: { type: "ALLIANCE" }, realm: { id: 1, name: "Synthetic", slug: "synthetic" } },
    armory: { profile: { id: 1, level: 81 }, equipment: { equipped_items: [] }, specializations: {}, activeSpecializationId: 72, activeTalentLoadout: "synthetic" },
    options: [{ id: "one" }, { id: "two" }], loadout: [], specId: 72, specSlug: "fury-warrior", market,
    currentBySlot: new Map(), discovery: createAuctionGearDiscovery(market, 10000), discoverySeason: season,
    encounter: { fightLengthSeconds: 120, targets: 1 }, coverage: {}, searchLimited: false,
    publicMarket: { snapshotId: market.id, region: "eu", realm: "Synthetic", connectedRealmId: 1, updatedAt: market.sourceUpdatedAt, validatedAt: market.fetchedAt },
    profileFingerprint: "synthetic-profile", scenario: "single-target", marketChange: { removedLots: 0, repricedLots: 0, quantityChangedLots: 0, variantsChangedLots: 0 },
    simulate: async () => { throw Error("unexpected_native_call"); }, discoveryContext: () => ({}),
  };
}
function result(entry, kind = "search") {
  return { kind, searchId: entry.id, budgetCopper: 10000, selectedSlots: ["WRIST"], baseline, items: [], purchases: [],
    searchComplete: true, exhaustiveComplete: true, simulations: 7, pendingItems: 0, engine: baseline.engine,
    searchLimited: false, optionsConsidered: 2, market: entry.context.publicMarket, profileFingerprint: "synthetic-profile", scenario: "single-target", coverage: {} };
}
function createEntry() {
  const entry = store.createAuctionGearSearch(owner, context());
  entry.searchCheckpoint = { version: 1, inputKey: "synthetic", nextOption: 7, baseline, simulationCache: {}, simulations: 7 };
  entry.retainedBaseline = baseline; entry.latestSearchResult = result(entry); entry.excludedOptionIds = ["two"];
  store.saveAuctionGearSearch(entry);
  return entry;
}
async function runEntry(kind, entry, signal, suppliedToken, selection) {
  signal.throwIfAborted();
  assert.equal(suppliedToken, token, "The route must supply this process's authenticated token");
  if (mode === "recover") assert(verified.includes(entry.id), "A restored checkpoint must be verified before continuing it");
  calls.push({ kind, checkpoint: entry.searchCheckpoint?.nextOption, selection });
  if (mode === "seed") await new Promise(() => {});
  return result(entry, kind === "assemble" ? "assembly" : "search");
}
globalThis.__apiRestart = {
  auth: () => session,
  select: selectedAuctionGearAssemblyOptions,
  start: async (_input, _owner, suppliedToken, signal, _progress, searchCreated) => {
    assert.equal(suppliedToken, token); calls.push({ kind: "start" });
    if (mode === "seed" && input.kind === "initial") await new Promise(() => {});
    const entry = seededEntry = createEntry(); searchCreated?.(entry.id);
    if (mode === "seed") await new Promise(() => {});
    signal.throwIfAborted(); return result(entry);
  },
  verify: async (entry, suppliedToken, signal) => { assert.equal(suppliedToken, token); signal.throwIfAborted(); verified.push(entry.id); },
  resume: (entry, signal, _progress, suppliedToken) => runEntry("resume", entry, signal, suppliedToken),
  assemble: (entry, selection, signal, _progress, suppliedToken) => runEntry("assemble", entry, signal, suppliedToken, selection),
};
const moduleURL = source => `data:text/javascript,${encodeURIComponent(source)}`;
const runnerStub = moduleURL(`
const s=globalThis.__apiRestart;
export const startAuctionGearSearch=(...args)=>s.start(...args);
export const continueAuctionGearSearch=(...args)=>s.resume(...args);
export const assembleAuctionGearSearch=(...args)=>s.assemble(...args);
export const verifyAuctionGearSearch=(...args)=>s.verify(...args);
export const selectedAuctionGearAssemblyOptions=(...args)=>s.select(...args);`);
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") return { url: moduleURL("export async function auth(){return globalThis.__apiRestart.auth()}"), shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner" || (context.parentURL?.endsWith("/auctionGearWork.ts") && specifier === "./auctionGearRunner")) return { url: runnerStub, shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
} });
globalThis.fetch = async () => { throw Error("unexpected_network_in_http_restart_test"); };
const route = await import("../../../app/api/wow/auction-gear-plans/route.ts");
async function send(method, body, query = {}, headers = {}) {
  const response = await route[method](new Request(`https://gildra.example/api/wow/auction-gear-plans?${new URLSearchParams(query)}`, { method,
    headers: { host: "gildra.example", origin: "https://gildra.example", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  const payload = await response.json(), serialized = JSON.stringify(payload);
  for (const secret of [token, owner, "requestFingerprint", "cancelledBeforeAcceptance", "work", "controller"]) assert(!serialized.includes(secret));
  return { status: response.status, body: payload };
}
const query = { clientRequestId: nonce, ...scope };
let output;
try {
  if (mode === "seed") {
    const entry = ["resume", "assemble"].includes(input.kind) ? createEntry() : null;
    const body = entry ? { action: input.kind, searchId: entry.id, clientRequestId: nonce, ...(input.kind === "assemble" ? { excludedOptionIds: ["two"] } : {}) }
      : { action: "search", ...scope, budgetGold: "1", selectedSlots: ["WRIST"], clientRequestId: nonce };
    const accepted = await send("POST", body); assert.equal(accepted.status, 202);
    assert.equal(accepted.body.mode, input.kind === "assemble" ? "assembly" : "search");
    await tick();
    const job = jobs.getAuctionGearJob(owner, accepted.body.id); assert.equal(job.status, "running");
    if (input.kind !== "initial") assert.equal(job.searchId, (entry ?? seededEntry).id);
    output = { kind: input.kind, jobId: job.id, searchId: job.searchId, body };
  } else if (mode === "recover") {
    const expectedMode = input.kind === "assemble" ? "assembly" : "search";
    session = { battleNetAccessToken: "synthetic-foreign-token" };
    assert.equal((await send("GET", undefined, query)).status, 404);
    session = null; assert.equal((await send("GET", undefined, query)).status, 401);
    session = { battleNetAccessToken: token };
    assert.equal((await send("GET", undefined, { ...query, characterSlug: "wrong" })).status, 404);
    assert.equal((await send("GET", undefined, { ...query, locale: "ru" })).status, 404);
    assert.equal((await send("GET", undefined, query, { origin: "https://foreign.example" })).status, 403);
    assert.equal(calls.length, 0, "Unauthenticated, foreign and wrong-scope reads must not attach work");
    if (input.searchId) {
      const restoredSearch = await send("GET", undefined, { searchId: input.searchId, ...scope });
      assert.equal(restoredSearch.status, 200); assert.equal(restoredSearch.body.kind, "recovery");
      assert.equal(restoredSearch.body.activeJob.mode, expectedMode, "A restored active job must identify its public mode independently of the tab cache");
    }
    const attached = await send("GET", undefined, query); assert.equal(attached.status, 200); assert.equal(attached.body.id, input.jobId);
    assert.equal(attached.body.mode, expectedMode);
    await tick(); await tick();
    const completed = await send("GET", undefined, { id: input.jobId, ...scope });
    assert.equal(completed.body.status, "completed"); assert.equal(calls.length, 1);
    assert.equal(completed.body.mode, expectedMode);
    assert.equal(calls[0].kind, input.kind === "initial" ? "start" : input.kind === "assemble" ? "assemble" : "resume");
    assert.equal(verified.length, input.kind === "initial" ? 0 : 1);
    if (input.kind !== "initial") assert.equal(calls[0].checkpoint, 7);
    if (input.kind === "assemble") assert.deepEqual(calls[0].selection, { excludedOptionIds: ["two"] });
    const replay = await send("POST", input.body); assert.equal(replay.status, 202); assert.equal(replay.body.id, input.jobId);
    assert.equal(replay.body.mode, expectedMode, "Completed nonce replay must preserve the public intent mode");
    await tick(); assert.equal(calls.length, 1);
    output = { status: "passed", kind: input.kind, tasks: calls.length, resumedKind: calls[0].kind };
  } else if (mode === "cancel-before-seed") {
    const cancelled = await send("DELETE", undefined, query); assert.equal(cancelled.status, 200); assert.equal(cancelled.body.status, "cancelled");
    output = { jobId: cancelled.body.id };
  } else if (mode === "cancel-before-recover") {
    const body = { action: "search", ...scope, budgetGold: "1", selectedSlots: ["WRIST"], clientRequestId: nonce };
    const late = await send("POST", body); assert.equal(late.status, 202); assert.equal(late.body.id, input.jobId); assert.equal(late.body.status, "cancelled");
    const existing = await send("GET", undefined, query); assert.equal(existing.body.id, input.jobId); assert.equal(existing.body.status, "cancelled");
    assert.equal(calls.length, 0); output = { status: "passed", tasks: 0 };
  } else if (mode === "capacity-seed") {
    const marker = await send("DELETE", undefined, query); assert.equal(marker.status, 200);
    const completed = [];
    const enqueue = (actor, ordinal) => jobs.enqueueAuctionGearJob(actor, async () => ({ kind: "search", searchId: `synthetic-capacity-${ordinal}` }), { scope });
    for (let i = 0; i < 199; i++) {
      const actor = `synthetic-capacity-owner-${i}`, job = enqueue(actor, i);
      await tick(); assert.equal(jobs.getAuctionGearJob(actor, job.id).status, "completed");
      completed.push({ actor, id: job.id });
    }
    const oldest = completed[0], originalRename = fs.renameSync;
    fs.renameSync = () => { const error = new Error("synthetic-write-failure"); error.code = "EIO"; throw error; };
    syncBuiltinESMExports();
    try { assert.throws(() => enqueue("synthetic-failed-replacement", 200), /auction_storage_unavailable/); }
    finally { fs.renameSync = originalRename; syncBuiltinESMExports(); }
    assert.equal(jobs.getAuctionGearJob(oldest.actor, oldest.id).status, "completed", "A failed replacement must preserve the old result");
    assert.equal(jobs.getAuctionGearJob(owner, marker.body.id).status, "cancelled");
    output = { oldest, markerId: marker.body.id };
  } else if (mode === "capacity-recover") {
    assert.equal(jobs.getAuctionGearJob(input.oldest.actor, input.oldest.id).status, "completed", "Failed replacement must preserve the durable old result after restart");
    for (let i = 0; i < 25; i++) {
      const actor = `synthetic-new-capacity-owner-${i}`;
      const job = jobs.enqueueAuctionGearJob(actor, async () => ({ kind: "search", searchId: `synthetic-new-capacity-${i}` }), { scope });
      await tick(); assert.equal(jobs.getAuctionGearJob(actor, job.id).status, "completed");
    }
    const late = await send("POST", { action: "search", ...scope, budgetGold: "1", selectedSlots: ["WRIST"], clientRequestId: nonce });
    assert.equal(late.status, 202); assert.equal(late.body.id, input.markerId); assert.equal(late.body.status, "cancelled");
    assert.equal(calls.length, 0);
    output = { status: "passed", oldResultSurvivedFailedWriteAndRestart: true, cancellationSurvived25Replacements: true };
  } else if (mode === "assembly-search-save-failure") {
    const entry = createEntry(), originalRename = fs.renameSync;
    let searchWrites = 0;
    fs.renameSync = (from, to) => {
      if (String(to).split("/").at(-1).startsWith("search-") && ++searchWrites === 3) { const error = new Error("synthetic-search-save-failure"); error.code = "EIO"; throw error; }
      return originalRename(from, to);
    };
    syncBuiltinESMExports();
    let response;
    try { response = await send("POST", { action: "assemble", searchId: entry.id, excludedOptionIds: ["two"], clientRequestId: nonce }); }
    finally { fs.renameSync = originalRename; syncBuiltinESMExports(); }
    await tick(); await tick();
    const recovered = await send("GET", undefined, query);
    output = { status: "observed", postStatus: response.status, postError: response.body.error,
      recoveredStatus: recovered.status, recoveredJobStatus: recovered.body.status, tasksExecuted: calls.length };
  } else throw Error(`unknown_http_restart_mode:${mode}`);
  console.log(JSON.stringify(output));
} finally { hook.deregister(); delete globalThis.__apiRestart; }
