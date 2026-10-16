import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Each command runs in a new process against one isolated temporary directory.
if (process.env.AUCTION_TEST_NOW) Date.now = () => Number(process.env.AUCTION_TEST_NOW);
globalThis.fetch = async () => { throw Error("unexpected_network_request_in_restart_test"); };
const modules = process.env.AUCTION_TEST_MODULE_ROOT ? pathToFileURL(process.env.AUCTION_TEST_MODULE_ROOT.replace(/\/$/, "") + "/") : new URL("../../../", import.meta.url);
const store = await import(new URL("lib/wow/auctionGearSearchStore.ts", modules));
const jobs = await import(new URL("lib/wow/auctionGearJobs.ts", modules));
const { createAuctionGearDiscovery } = await import(new URL("lib/wow/auctionGearDiscovery.ts", modules));
const mode = process.argv[2], input = JSON.parse(process.argv[3] ?? "{}");
const owner = createHash("sha256").update("synthetic-restart-owner").digest("hex");
const foreign = createHash("sha256").update("synthetic-foreign-owner").digest("hex");
const clientRequestId = "synthetic-restart-request-identity";
const requestFingerprint = createHash("sha256").update("synthetic-restart-request-fingerprint").digest("hex");
const scope = { characterSlug: "synthetic-restart-character", locale: "en" };
const baseline = { dps: 1000, dpsError: 1, confidence: 95, iterations: 1000, engine: "SimulationCraft synthetic-restart" };
const privateToken = "synthetic-never-persisted-bearer";
const tick = () => new Promise(resolve => setImmediate(resolve));
function context() {
  const market = { id: "synthetic-market", region: "eu", connectedRealmId: 1,
    sourceUpdatedAt: new Date(Date.now()).toISOString(), fetchedAt: new Date(Date.now()).toISOString(), offers: [] };
  const season = { id: "synthetic-season", patch: "synthetic-patch", expansionId: 11, activityNames: [] };
  const input = { ...scope, budgetCopper: 10000, selectedSlots: ["WRIST"], scenario: "single-target" };
  const character = { id: 1, name: "Synthetic", level: 81, region: "eu", playableClass: { id: 1 }, playableRace: { id: 1 },
    faction: { type: "ALLIANCE" }, realm: { id: 1, name: "Synthetic", slug: "synthetic" } };
  const discovery = createAuctionGearDiscovery(market, input.budgetCopper);
  discovery.entities.set(1, { id: "synthetic-entity", externalId: 1 });
  discovery.scannedItems.add(1); discovery.detailedItems.add(1);
  discovery.itemIds = [1, 2]; discovery.itemCursor = 1; discovery.queuedItems.add(1); discovery.queuedItems.add(2);
  discovery.variantKeys = ["synthetic-variant"]; discovery.variantCursor = 0; discovery.queuedVariants.add("synthetic-variant");
  discovery.referenceRetryAt.set(2, Date.now() + 900000);
  discovery.referenceRejectedVariants.set(2, new Set(["synthetic-missing-variant"]));
  const currentBySlot = new Map([["WRIST", { itemId: 999, name: "Synthetic baseline", slotType: "WRIST" }]]);
  return { input, character, season, discoverySeason: season, encounter: { fightLengthSeconds: 120, targets: 1 }, options: [], loadout: [],
    armory: { profile: { id: 1, level: 81, character_class: { id: 1 }, race: { id: 1 } },
      equipment: { equipped_items: [] }, specializations: {}, activeSpecializationId: 72, activeTalentLoadout: "synthetic" },
    specId: 72, specSlug: "fury-warrior", market, currentBySlot, discovery, searchLimited: true,
    coverage: { discoveryComplete: false, dataComplete: false },
    publicMarket: { snapshotId: market.id, region: "eu", realm: "Synthetic", connectedRealmId: 1, updatedAt: market.sourceUpdatedAt, validatedAt: market.fetchedAt },
    profileFingerprint: "synthetic-profile", scenario: input.scenario,
    marketChange: { removedLots: 0, repricedLots: 0, quantityChangedLots: 0, variantsChangedLots: 0 },
    simulate: async () => { void privateToken; throw Error("never_execute_saved_function"); },
    discoveryContext: slotType => ({ classId: 1, specId: 72, characterLevel: 81, raceId: 1, faction: "ALLIANCE", slotType,
      currentItemLevel: 0, anchorItemClassId: -1, anchorItemSubclassId: -1, season, acquisition: { type: "auction", evidence: "auction" } }),
  };
}
function result(entry) {
  return { kind: "search", searchId: entry.id, selectedSlots: ["WRIST"], budgetCopper: 10000, baseline, items: [],
    searchComplete: false, discoveryComplete: false, dataComplete: false, pendingItems: 2, simulations: 7,
    engine: baseline.engine, searchLimited: true, optionsConsidered: 2, market: entry.context.publicMarket,
    profileFingerprint: entry.context.profileFingerprint, scenario: "single-target", coverage: entry.context.coverage };
}
async function seedEntry() {
  const entry = store.createAuctionGearSearch(owner, context());
  entry.knownOptionIds = new Set(["synthetic-one", "synthetic-two"]);
  entry.excludedOptionIds = ["synthetic-two"];
  entry.allowedKey = "synthetic-allowed-key";
  entry.retainedBaseline = baseline;
  entry.retainedSimulationCache = { "synthetic-effect": { ...baseline, dps: 1050 } };
  entry.retainedIncumbents = [{ effects: ["synthetic-effect"], simulation: { ...baseline, dps: 1050 } }];
  entry.searchCheckpoint = { version: 1, inputKey: "synthetic-search-input", nextOption: 1, baseline,
    simulationCache: entry.retainedSimulationCache, simulations: 7 };
  entry.assemblyCheckpoint = { version: 3, inputKey: "synthetic-assembly-input", cursor: [0, 2], pairScores: [1, 2], nextPair: 1,
    seedSelections: [[1, 2]], nextSeed: 1, exhausted: false, baseline, best: { optionIds: ["synthetic-one"], simulation: { ...baseline, dps: 1050 } },
    bestConfirmed: null, simulationCache: entry.retainedSimulationCache, simulations: 7, combinationsChecked: 9, validCombinations: 4 };
  entry.latestSearchResult = result(entry);
  // The pre-fix seed can complete; the next real process must expose the loss.
  if (typeof store.saveAuctionGearSearch === "function") await store.saveAuctionGearSearch(entry);
  return entry;
}
function handles(entry, job) { return { owner, clientRequestId, requestFingerprint, scope, searchId: entry.id, jobId: job.id, now: Date.now(), workAction: input.workAction ?? "search" }; }
let output;
if (mode === "seed-completed" || mode === "seed-interrupted") {
  const entry = await seedEntry();
  const interrupted = mode === "seed-interrupted";
  const action = input.workAction ?? "search";
  const work = action === "search" ? { action, input: entry.context.input } : action === "resume" ? { action, searchId: entry.id }
    : { action, searchId: entry.id, selection: { excludedOptionIds: ["synthetic-two"] } };
  const job = jobs.enqueueAuctionGearJob(owner, async (_signal, progress, hooks) => {
    if (hooks?.searchCreated) hooks.searchCreated(entry.id);
    if (interrupted) { progress({ phase: "simulating", completed: 7, total: 48 }); await new Promise(() => {}); }
    void privateToken;
    return result(entry);
  }, { scope, clientRequestId, requestFingerprint, work, ...(action !== "search" ? { continuation: true, searchId: entry.id } : {}) });
  for (let i = 0; i < 5; i++) await tick();
  const final = jobs.getAuctionGearJob(owner, job.id);
  assert.equal(final.status, interrupted ? "running" : "completed");
  output = handles(entry, job);
} else if (mode === "read-completed") {
  const entry = store.getAuctionGearSearch(owner, input.searchId);
  assert(entry, "A saved search must survive a process restart");
  assert.equal(typeof store.saveAuctionGearSearch, "function", "Search checkpoints must have an explicit durable save boundary");
  assert.equal(entry.busy, false);
  assert(entry.knownOptionIds instanceof Set); assert.deepEqual([...entry.knownOptionIds], ["synthetic-one", "synthetic-two"]);
  assert(entry.context.currentBySlot instanceof Map); assert.equal(entry.context.currentBySlot.get("WRIST").itemId, 999);
  assert(entry.context.discovery.entities instanceof Map); assert.equal(entry.context.discovery.entities.get(1).externalId, 1);
  assert(entry.context.discovery.queuedItems instanceof Set); assert.equal(entry.context.discovery.itemCursor, 1);
  assert.equal(entry.context.discovery.referenceRetryAt.get(2), input.now + 900000);
  assert.deepEqual([...entry.context.discovery.referenceRejectedVariants.get(2)], ["synthetic-missing-variant"]);
  assert.equal(entry.searchCheckpoint.nextOption, 1); assert.deepEqual(entry.assemblyCheckpoint.cursor, [0, 2]);
  assert.equal(entry.assemblyCheckpoint.combinationsChecked, 9); assert.equal(entry.retainedSimulationCache["synthetic-effect"].dps, 1050);
  assert.deepEqual(entry.excludedOptionIds, ["synthetic-two"]); assert.equal(entry.retainedIncumbents.length, 1);
  assert.equal(typeof entry.context.simulate, "function"); assert.equal(typeof entry.context.discoveryContext, "function");
  assert.equal(entry.context.discoveryContext("WRIST").season.id, "synthetic-season");
  assert.equal(store.getAuctionGearSearch(foreign, input.searchId), null);
  const job = jobs.getAuctionGearJob(owner, input.jobId); assert.equal(job.status, "completed");
  assert.equal(job.result.simulations, 7); assert.equal(job.result.searchId, entry.id);
  assert.equal(jobs.getAuctionGearJob(foreign, input.jobId), null);
  assert.equal(jobs.getAuctionGearJobByRequest(owner, clientRequestId, scope).id, input.jobId);
  const replay = jobs.enqueueAuctionGearJob(owner, async () => { throw Error("completed_replay_must_not_run"); },
    { scope, clientRequestId, requestFingerprint, work: { action: "search", input: entry.context.input } });
  assert.equal(replay.id, input.jobId); assert.equal(replay.status, "completed");
  assert.throws(() => jobs.replayAuctionGearJob(owner, clientRequestId, "a".repeat(64)), /invalid_plan_request/);
  output = { status: "passed", preserved: ["owner", "job result", "nonce", "Maps", "Sets", "cursors", "cache", "exclusions", "reconstructed functions"] };
} else if (mode === "resume-interrupted") {
  assert.equal(typeof jobs.getAuctionGearPendingWork, "function"); assert.equal(typeof jobs.resumeAuctionGearJob, "function");
  assert.equal(jobs.getAuctionGearPendingWork(foreign, input.jobId), null);
  const parked = jobs.getAuctionGearJob(owner, input.jobId); assert.equal(parked.status, "queued"); assert.equal(parked.searchId, input.searchId);
  const work = jobs.getAuctionGearPendingWork(owner, input.jobId);
  assert.equal(work.action, input.workAction ?? "search");
  if (work.action === "search") assert.equal(work.input.characterSlug, scope.characterSlug);
  else assert.equal(work.searchId, input.searchId);
  if (work.action === "assemble") assert.deepEqual(work.selection, { excludedOptionIds: ["synthetic-two"] });
  let calls = 0, releases = 0;
  const task = async signal => {
    calls++; signal.throwIfAborted();
    const entry = store.getAuctionGearSearch(owner, input.searchId); assert.equal(entry.searchCheckpoint.nextOption, 1);
    entry.searchCheckpoint.nextOption = 2; await store.saveAuctionGearSearch(entry);
    return result(entry);
  };
  assert.equal(jobs.resumeAuctionGearJob(foreign, input.jobId, task), false);
  assert.equal(jobs.resumeAuctionGearJob(owner, input.jobId, task, { onSettled: () => { releases++; } }), true);
  assert.equal(jobs.resumeAuctionGearJob(owner, input.jobId, task), false);
  assert.equal(jobs.getAuctionGearPendingWork(owner, input.jobId), null);
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(calls, 1); assert.equal(releases, 1); assert.equal(jobs.getAuctionGearJob(owner, input.jobId).status, "completed");
  output = { status: "passed", calls, releases, checkpointAfterResume: 2 };
} else if (mode === "read-resumed") {
  assert.equal(store.getAuctionGearSearch(owner, input.searchId).searchCheckpoint.nextOption, 2);
  assert.equal(jobs.getAuctionGearJob(owner, input.jobId).status, "completed");
  output = { status: "passed" };
} else if (mode === "cancel-restored") {
  let releases = 0;
  const task = async signal => await new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  assert.equal(jobs.resumeAuctionGearJob(owner, input.jobId, task, { onSettled: () => { releases++; } }), true);
  assert.equal(jobs.cancelAuctionGearJob(owner, input.jobId).status, "cancelled");
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(releases, 1); assert.equal(jobs.getAuctionGearPendingWork(owner, input.jobId), null);
  output = { status: "passed", releases };
} else if (mode === "read-cancelled") {
  assert.equal(jobs.getAuctionGearJob(owner, input.jobId).status, "cancelled");
  assert.equal(jobs.getAuctionGearPendingWork(owner, input.jobId), null);
  assert.equal(jobs.replayAuctionGearJob(owner, clientRequestId, requestFingerprint).status, "cancelled");
  output = { status: "passed" };
} else if (mode === "expire-restored-queued") {
  let releases = 0;
  jobs.enqueueAuctionGearJob(foreign, async () => await new Promise(() => {}), {
    scope, work: { action: "search", input: context().input },
  });
  const entry = store.getAuctionGearSearch(owner, input.searchId);
  const release = store.reserveAuctionGearSearch(entry);
  assert.equal(jobs.resumeAuctionGearJob(owner, input.jobId, async () => { throw Error("expired_task_must_not_run"); },
    { onSettled: () => { releases++; release(); } }), true);
  assert.equal(jobs.getAuctionGearJob(owner, input.jobId).status, "queued");
  const later = Date.now() + 31 * 60000;
  Date.now = () => later;
  assert.equal(jobs.getAuctionGearJob(owner, input.jobId), null);
  assert.equal(releases, 1);
  assert.equal(store.getAuctionGearSearch(owner, input.searchId), null, "Expired queued work must release its retained context reservation");
  output = { status: "passed", releases };
} else if (mode === "read-missing") {
  assert.equal(store.getAuctionGearSearch(owner, input.searchId), null);
  assert.equal(jobs.getAuctionGearJob(owner, input.jobId), null);
  assert.equal(jobs.getAuctionGearJobByRequest(owner, clientRequestId, scope), null);
  output = { status: "passed" };
} else if (mode === "foreign-read") {
  assert.equal(store.getAuctionGearSearch(foreign, input.searchId), null);
  assert.equal(jobs.getAuctionGearJob(foreign, input.jobId), null);
  output = { status: "passed" };
} else if (mode === "delete-search") {
  assert.equal(store.deleteAuctionGearSearch(owner, input.searchId), true);
  output = { status: "passed" };
} else if (mode === "evict-search") {
  assert(store.getAuctionGearSearch(owner, input.searchId));
  for (let i = 0; i < 3; i++) store.createAuctionGearSearch(owner, context());
  assert.equal(store.getAuctionGearSearch(owner, input.searchId), null);
  output = { status: "passed" };
} else if (mode === "read-search-missing") {
  assert.equal(store.getAuctionGearSearch(owner, input.searchId), null);
  output = { status: "passed" };
} else throw Error(`unknown_restart_test_mode:${mode}`);
console.log(JSON.stringify(output));
