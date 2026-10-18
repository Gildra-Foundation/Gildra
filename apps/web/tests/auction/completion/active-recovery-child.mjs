import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import fs from "node:fs";
import * as store from "../../../lib/wow/auctionGearSearchStore.ts";
import * as jobs from "../../../lib/wow/auctionGearJobs.ts";
import { createAuctionGearDiscovery } from "../../../lib/wow/auctionGearDiscovery.ts";
import { selectedAuctionGearAssemblyOptions } from "../../../lib/wow/auctionGearRunner.ts";

const mode = process.argv[2], input = JSON.parse(process.argv[3] ?? "{}");
const isAssembly = input.kind === "assemble" || input.kind === "assemble-allowed";
const variantOne = JSON.stringify([1, "synthetic-exact-one"]), variantTwo = JSON.stringify([2, "synthetic-exact-two"]);
const token = "synthetic-active-recovery-auth-token";
const owner = createHash("sha256").update(`battle-net:${token}`).digest("hex");
const intent = { characterSlug: "eu/eversong/synthetic-active-owner", locale: "en", budgetCopper: 1234567,
  selectedSlots: ["WRIST", "MAIN_HAND"], scenario: "aoe", objective: "value" };
const scope = { characterSlug: intent.characterSlug, locale: intent.locale };
const nonce = "synthetic-active-recovery-original";
const baseline = { dps: 1000, dpsError: 1, confidence: 95, iterations: 1000, engine: "SimulationCraft synthetic-active-recovery" };
const tick = () => new Promise(resolve => setImmediate(resolve));
let session = { battleNetAccessToken: token }, release;
const gate = new Promise(resolve => { release = resolve; });
const calls = [], verified = [];
function createEntry(runInput = intent) {
  const now = new Date().toISOString();
  const market = { id: "synthetic-active", region: "eu", connectedRealmId: 1, sourceUpdatedAt: now, fetchedAt: now, offers: [] };
  const context = { input: { ...runInput },
    character: { id: 1, name: "Synthetic", level: 81, region: "eu", playableClass: { id: 1 }, playableRace: { id: 1 },
      faction: { type: "ALLIANCE" }, realm: { id: 1, name: "Synthetic", slug: "synthetic" } },
    armory: { profile: { id: 1, level: 81 }, equipment: { equipped_items: [] }, specializations: {}, activeSpecializationId: 72, activeTalentLoadout: "synthetic" },
    options: [{ id: "one", candidate: { itemId: 1 }, variantKey: "synthetic-exact-one" },
      { id: "two", candidate: { itemId: 2 }, variantKey: "synthetic-exact-two" }], loadout: [], specId: 72, specSlug: "fury-warrior", market, currentBySlot: new Map(),
    discovery: createAuctionGearDiscovery(market, runInput.budgetCopper), discoverySeason: { id: "synthetic", patch: "synthetic", expansionId: 11, activityNames: [] },
    encounter: { fightLengthSeconds: 120, targets: 5 }, coverage: {}, searchLimited: false,
    publicMarket: { snapshotId: market.id, region: "eu", realm: "Synthetic", connectedRealmId: 1, updatedAt: now, validatedAt: now },
    profileFingerprint: "synthetic-active-profile", scenario: runInput.scenario,
    marketChange: { removedLots: 0, repricedLots: 0, quantityChangedLots: 0, variantsChangedLots: 0 },
    simulate: async () => { throw Error("unexpected_native_call"); }, discoveryContext: () => ({}),
  };
  const entry = store.createAuctionGearSearch(owner, context);
  entry.searchCheckpoint = { version: 1, inputKey: "synthetic-active", nextOption: 7, baseline, simulationCache: {}, simulations: 7 };
  entry.retainedBaseline = baseline; entry.latestSearchResult = result(entry);
  // Deliberately seed a different previous selection. Recovery must expose the
  // accepted active request, not the exclusions from the earlier calculation.
  entry.excludedOptionIds = ["one"]; entry.excludedVariantKeys = [variantTwo];
  entry.knownVariantKeys = new Set([variantOne, variantTwo]); store.saveAuctionGearSearch(entry);
  return entry;
}
function result(entry, kind = "search") {
  return { kind, searchId: entry.id, budgetCopper: entry.context.input.budgetCopper, selectedSlots: entry.context.input.selectedSlots,
    objective: entry.context.input.objective, baseline, items: [], purchases: [], searchComplete: true, exhaustiveComplete: true,
    simulations: 7, pendingItems: 0, engine: baseline.engine, searchLimited: false, optionsConsidered: 2,
    market: entry.context.publicMarket, profileFingerprint: "synthetic-active-profile", scenario: entry.context.input.scenario, coverage: {} };
}
async function run(kind, entry, signal, suppliedToken, selection) {
  assert.equal(suppliedToken, token); signal.throwIfAborted();
  if (mode === "recover") assert(verified.includes(entry.id));
  calls.push({ kind, selection, checkpoint: entry.searchCheckpoint?.nextOption });
  if (mode === "seed" || mode === "race") await gate;
  signal.throwIfAborted(); return result(entry, kind === "assemble" ? "assembly" : "search");
}
globalThis.__activeRecovery = {
  auth: () => session,
  select: selectedAuctionGearAssemblyOptions,
  start: async (runInput, suppliedOwner, suppliedToken, signal, _progress, searchCreated) => {
    assert.equal(suppliedOwner, owner); assert.equal(suppliedToken, token); calls.push({ kind: "start", input: runInput });
    if (mode === "seed" && input.kind === "initial") await gate;
    const entry = createEntry(runInput); searchCreated(entry.id);
    if (mode === "seed" || mode === "race") await gate;
    signal.throwIfAborted(); return result(entry);
  },
  verify: async (entry, suppliedToken, signal) => { assert.equal(suppliedToken, token); signal.throwIfAborted(); verified.push(entry.id); },
  resume: (entry, signal, _progress, suppliedToken) => run("resume", entry, signal, suppliedToken),
  assemble: (entry, selection, signal, _progress, suppliedToken) => run("assemble", entry, signal, suppliedToken, selection),
};
const moduleURL = source => `data:text/javascript,${encodeURIComponent(source)}`;
const runnerStub = moduleURL(`const s=globalThis.__activeRecovery;
export const startAuctionGearSearch=(...a)=>s.start(...a);
export const continueAuctionGearSearch=(...a)=>s.resume(...a);
export const assembleAuctionGearSearch=(...a)=>s.assemble(...a);
export const verifyAuctionGearSearch=(...a)=>s.verify(...a);
export const selectedAuctionGearAssemblyOptions=(...a)=>s.select(...a);`);
const hook = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "@/auth") return { url: moduleURL("export async function auth(){return globalThis.__activeRecovery.auth()}"), shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner" || context.parentURL?.endsWith("/auctionGearWork.ts") && specifier === "./auctionGearRunner") return { url: runnerStub, shortCircuit: true };
  if (specifier === "next/server") return next("next/server.js", context);
  return next(specifier, context);
} });
globalThis.fetch = async () => { throw Error("unexpected_network_in_active_recovery_test"); };
const route = await import("../../../app/api/wow/auction-gear-plans/route.ts");
async function send(method, body, query = {}, headers = {}) {
  const response = await route[method](new Request(`https://gildra.example/api/wow/auction-gear-plans?${new URLSearchParams(query)}`, { method,
    headers: { host: "gildra.example", origin: "https://gildra.example", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  const payload = await response.json(), serialized = JSON.stringify(payload);
  for (const secret of [token, owner, "requestFingerprint", "clientRequestId", "cancelledBeforeAcceptance", '"work"', "controller", "equipment", "activeTalentLoadout"])
    assert(!serialized.includes(secret), `Private field leaked: ${secret}`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return { status: response.status, body: payload };
}
const searchBody = { action: "search", ...scope, budgetGold: "123.4567", selectedSlots: intent.selectedSlots,
  scenario: intent.scenario, objective: intent.objective, clientRequestId: nonce };
const activeQuery = { active: "1" };
function assertDiscovery(response, expectedId) {
  assert.equal(response.status, 200, "A cold tab must discover its owner-bound active handle without knowing an old ID");
  assert.equal(response.body.activeJob?.id, expectedId); assert.deepEqual(response.body.formIntent, intent);
  assert.equal(response.body.activeJob.mode, isAssembly ? "assembly" : "search");
  assert.equal(calls.length, 0, "Discovery must not reattach parked work or spend simulations");
}
try {
  let output;
  if (mode === "seed") {
    const entry = input.kind === "resume" || isAssembly ? createEntry() : null;
    const body = entry ? { action: isAssembly ? "assemble" : "resume", searchId: entry.id, clientRequestId: nonce,
      ...(input.kind === "assemble" ? { excludedOptionIds: ["two"], excludedVariantKeys: [variantOne] }
        : input.kind === "assemble-allowed" ? { allowedOptionIds: ["one"] } : {}) } : searchBody;
    const accepted = await send("POST", body); assert.equal(accepted.status, 202); await tick();
    const job = jobs.getAuctionGearJob(owner, accepted.body.id); assert.equal(job.status, "running");
    output = { kind: input.kind, jobId: job.id, searchId: job.searchId };
  } else if (mode === "recover" || mode === "cancel") {
    session = null; assert.equal((await send("GET", undefined, activeQuery)).status, 401);
    session = { battleNetAccessToken: "synthetic-other-owner" };
    assert.deepEqual((await send("GET", undefined, activeQuery)).body, { activeJob: null, formIntent: null });
    assert.equal((await send("DELETE", undefined, { id: input.jobId })).status, 404);
    session = { battleNetAccessToken: token };
    assert.equal((await send("GET", undefined, activeQuery, { origin: "https://foreign.example" })).status, 403);
    assert.equal((await send("GET", undefined, activeQuery, { "sec-fetch-site": "cross-site" })).status, 403);
    assertDiscovery(await send("GET", undefined, activeQuery), input.jobId);
    const conflict = await send("POST", { ...searchBody, characterSlug: "different-owned-character", clientRequestId: `${nonce}-conflict` });
    assert.equal(conflict.status, 409); assert.equal(conflict.body.activeJob.id, input.jobId); assert.deepEqual(conflict.body.formIntent, intent);
    assert.equal(calls.length, 0, "Rejecting a fresh tab's conflicting POST must not resume parked work");
    assert.equal((await send("GET", undefined, { id: input.jobId, characterSlug: "different-character", locale: "en" })).status, 404);
    assert.equal((await send("GET", undefined, { id: input.jobId, characterSlug: scope.characterSlug, locale: "ru" })).status, 404);
    assert.equal(calls.length, 0);
    if (mode === "cancel") {
      const rename = fs.renameSync;
      fs.renameSync = () => { const error = new Error("synthetic-cancel-write-failure"); error.code = "EIO"; throw error; }; syncBuiltinESMExports();
      try { const failed = await send("DELETE", undefined, { id: input.jobId }); assert.equal(failed.status, 503); assert.equal(failed.body.error, "auction_storage_unavailable"); }
      finally { fs.renameSync = rename; syncBuiltinESMExports(); }
      const acknowledged = await send("DELETE", undefined, { id: input.jobId }); assert.equal(acknowledged.status, 200); assert.equal(acknowledged.body.status, "cancelled");
      assert.deepEqual((await send("GET", undefined, activeQuery)).body, { activeJob: null, formIntent: null });
      output = { tasks: calls.length };
    } else {
      const open = await send("GET", undefined, isAssembly ? { searchId: input.searchId, ...scope } : { id: input.jobId, ...scope });
      assert.equal(open.status, 200);
      if (isAssembly) {
        assert.equal(open.body.kind, "recovery");
        assert.deepEqual(open.body.excludedOptionIds, ["two"], "Explicit opening must recover exact accepted active lot exclusions, including a legacy allowlist complement");
        assert.deepEqual(open.body.excludedVariantKeys, input.kind === "assemble" ? [variantOne] : [], "Active assembly variant exclusions must replace the previous result's selection");
        assert.equal(open.body.activeJob.mode, "assembly");
      }
      await tick(); await tick();
      const completed = await send("GET", undefined, { id: input.jobId, ...scope }); assert.equal(completed.body.status, "completed");
      assert.equal(completed.body.mode, isAssembly ? "assembly" : "search");
      assert.equal(calls.length, 1); assert.equal(calls[0].checkpoint, input.kind === "initial" ? undefined : 7);
      if (input.kind === "initial") assert.deepEqual(calls[0].input, intent);
      if (isAssembly) assert.deepEqual(calls[0].selection, input.kind === "assemble" ? { excludedOptionIds: ["two"], excludedVariantKeys: [variantOne] } : ["one"]);
      assert.deepEqual((await send("GET", undefined, activeQuery)).body, { activeJob: null, formIntent: null });
      output = { tasks: calls.length, kind: calls[0].kind };
    }
  } else if (mode === "after-cancel") {
    assert.deepEqual((await send("GET", undefined, activeQuery)).body, { activeJob: null, formIntent: null });
    assert.equal((await send("GET", undefined, { id: input.jobId, ...scope })).body.status, "cancelled"); assert.equal(calls.length, 0);
    const accepted = await send("POST", { ...searchBody, characterSlug: "different-owned-character", clientRequestId: `${nonce}-new` });
    assert.equal(accepted.status, 202); assert.notEqual(accepted.body.id, input.jobId); await tick();
    output = { cancelled: true };
  } else if (mode === "missing-context") {
    store.deleteAuctionGearSearch(owner, input.searchId);
    const discovered = await send("GET", undefined, activeQuery);
    assert.equal(discovered.status, 200); assert.equal(discovered.body.activeJob.id, input.jobId);
    assert.equal(discovered.body.activeJob.mode, "assembly"); assert.equal(discovered.body.formIntent, null);
    assert.equal(calls.length, 0);
    const cancelled = await send("DELETE", undefined, { id: input.jobId }); assert.equal(cancelled.status, 200); assert.equal(cancelled.body.status, "cancelled");
    output = { cancelled: true };
  } else if (mode === "race") {
    const accepted = await send("POST", searchBody); assert.equal(accepted.status, 202); await tick();
    const detached = jobs.getOwnerActiveAuctionGearJob(owner);
    detached.formIntent.selectedSlots.length = 0; detached.formIntent.budgetCopper = 1;
    detached.activeJob.scope.characterSlug = "mutated-public-copy";
    const discovered = await send("GET", undefined, activeQuery); assert.equal(discovered.status, 200); assert.equal(discovered.body.activeJob.id, accepted.body.id);
    assert.deepEqual(discovered.body.formIntent, intent, "Mutating returned recovery fields must not change the retained server work");
    const conflict = await send("POST", { ...searchBody, characterSlug: "different-owned-character", budgetGold: "5", objective: "dps", clientRequestId: `${nonce}-conflict` });
    assert.equal(conflict.status, 409); assert.equal(conflict.body.error, "plan_already_running");
    assert.equal(conflict.body.activeJob.id, accepted.body.id); assert.deepEqual(conflict.body.formIntent, intent);
    assert.equal(calls.length, 1, "Conflict discovery must not start a second task or relabel it with new input");
    release(); await tick(); await tick();
    const open = await send("GET", undefined, { id: discovered.body.activeJob.id, ...scope }); assert.equal(open.body.status, "completed");
    assert.equal(open.body.result.objective, "value"); assert.equal(open.body.result.budgetCopper, intent.budgetCopper);
    assert.deepEqual((await send("GET", undefined, activeQuery)).body, { activeJob: null, formIntent: null });
    output = { conflictRecoverable: true, completedRacePreserved: true };
  } else if (mode === "empty") {
    assert.deepEqual((await send("GET", undefined, activeQuery)).body, { activeJob: null, formIntent: null });
    for (const query of [{ active: "true" }, { active: "" }, { active: "1", id: "forged" }, { active: "1", searchId: "forged" },
      { active: "1", clientRequestId: nonce }, { active: "1", characterSlug: scope.characterSlug }, { active: "1", locale: "en" }, { active: "1", owner: "forged" }])
      assert.equal((await send("GET", undefined, query)).status, 400);
    assert.equal((await send("GET", undefined, new URLSearchParams([["active", "1"], ["active", "1"]]))).status, 400);
    assert.equal(calls.length, 0); output = { passed: true };
  } else throw Error(`unknown_active_recovery_mode:${mode}`);
  console.log(JSON.stringify(output));
} finally { hook.deregister(); delete globalThis.__activeRecovery; }
