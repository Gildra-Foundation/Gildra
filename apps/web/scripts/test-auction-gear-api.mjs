// Offline route-boundary tests. Authentication and expensive task transports are
// synthetic; the actual route, owner-bound jobs/store and selection validator run.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import { selectedAuctionGearAssemblyOptions, verifyAuctionGearSearch } from "../lib/wow/auctionGearRunner.ts";
import { createAuctionGearSearch, deleteAuctionGearSearch } from "../lib/wow/auctionGearSearchStore.ts";
import { getBattleNetSimulationSnapshot } from "../lib/wow/battleNetCharacterDetails.ts";
import { auctionGearProfileFingerprint } from "../lib/wow/auctionGearFingerprint.ts";
import { auctionVariantKey } from "../lib/wow/auctionItemVariant.ts";
import { assembleAuctionGear, searchAuctionGearOptions } from "../lib/wow/auctionGearPlanner.ts";
import { getAuctionGearRecommendations } from "../lib/wow/auctionGearRecommendations.ts";
import { equipmentCompatibility } from "../lib/wow/gearCompatibility.ts";

const owner = token => createHash("sha256").update(`battle-net:${token}`).digest("hex");
const tokenA = "synthetic-api-owner-a", tokenB = "synthetic-api-owner-b";
const state = {
  session: { battleNetAccessToken: tokenA }, authCalls: 0, starts: [], continuations: [], assemblies: [], verifies: [],
  select: selectedAuctionGearAssemblyOptions,
  start: async (input, actor, token, signal) => {
    signal.throwIfAborted();state.starts.push({ input, actor, token });
    return { kind: "search", searchId: "synthetic-search", budgetCopper: input.budgetCopper, items: [], searchComplete: true };
  },
  resume: async (entry, signal) => {
    signal.throwIfAborted();state.continuations.push(entry);
    return { kind: "search", searchId: entry.id, budgetCopper: entry.context.input.budgetCopper, items: [], searchComplete: true };
  },
  assemble: async (entry, ids, signal) => {
    signal.throwIfAborted();state.assemblies.push({ entry, ids });
    return { kind: "assembly", searchId: entry.id, budgetCopper: entry.context.input.budgetCopper, purchases: [], exhaustiveComplete: true };
  },
  verify: async (entry, token, signal) => { signal.throwIfAborted();state.verifies.push({ entry, token }); },
};
globalThis.__gildraAuctionApiTest = state;
const moduleURL = source => `data:text/javascript,${encodeURIComponent(source)}`;
const authStub = moduleURL("export async function auth(){const s=globalThis.__gildraAuctionApiTest;s.authCalls++;return s.session;}");
const runnerStub = moduleURL(`
const s=globalThis.__gildraAuctionApiTest;
export const startAuctionGearSearch=(...args)=>s.start(...args);
export const continueAuctionGearSearch=(...args)=>s.resume(...args);
export const assembleAuctionGearSearch=(...args)=>s.assemble(...args);
export const verifyAuctionGearSearch=(...args)=>s.verify(...args);
export const selectedAuctionGearAssemblyOptions=(...args)=>s.select(...args);
`);
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") return { url: authStub, shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner") return { url: runnerStub, shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
} });
const savedFetch = globalThis.fetch;
// This test must never contact Blizzard, a database, a worker or production.
globalThis.fetch = async () => { throw new Error("Unexpected network request in offline API test"); };
const entries = [];
let checks = 0;
try {
  const route = await import("../app/api/wow/auction-gear-plans/route.ts");
  async function send(method, body, options = {}) {
    const headers = { host: "gildra.example", origin: "https://gildra.example", ...options.headers };
    const init = { method, headers };
    if (body !== undefined) { init.body = options.raw ? body : JSON.stringify(body);headers["content-type"] = "application/json"; }
    const request = new Request(`https://gildra.example/api/wow/auction-gear-plans${options.query ?? ""}`, init);
    const response = await route[method](request);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const payload = await response.json();
    assert(!JSON.stringify(payload).includes(tokenA));assert(!JSON.stringify(payload).includes(tokenB));
    assert(!JSON.stringify(payload).includes(owner(tokenA)), "Private owner hash escaped the route");
    checks++;
    return { status: response.status, payload };
  }
  async function expectError(method, body, status, error, options) {
    assert.deepEqual(await send(method, body, options), { status, payload: { error } });
  }
  async function waitFor(job) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await send("GET", undefined, { query: `?id=${encodeURIComponent(job.id)}` });
      assert.equal(response.status, 200);
      if (!["queued", "running"].includes(response.payload.status)) return response.payload;
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    assert.fail("Synthetic API job did not settle");
  }
  const searchBody = { action: "search", characterSlug: "synthetic-owned-character", budgetGold: "10.0001", selectedSlots: ["WRIST"], scenario: "single-target", locale: "ru" };
  for (const method of ["GET", "DELETE", "POST"]) {
    const calls = state.authCalls;
    await expectError(method, method === "POST" ? searchBody : undefined, 403, "cross_site_blocked", { headers: { origin: "https://foreign.example" } });
    await expectError(method, method === "POST" ? searchBody : undefined, 403, "cross_site_blocked", { headers: { "sec-fetch-site": "cross-site" } });
    assert.equal(state.authCalls, calls, "Cross-site requests must fail before authentication");
    state.session = null;
    await expectError(method, method === "POST" ? searchBody : undefined, 401, "session_expired");
    state.session = { battleNetAccessToken: tokenA };
  }
  await expectError("POST", "{".repeat(512 * 1024 + 1), 413, "request_too_large", { raw: true });
  for (const invalid of [null, [], "not an object"]) await expectError("POST", invalid, 400, "invalid_plan_request");
  await expectError("POST", "{", 400, "invalid_plan_request", { raw: true });
  await expectError("POST", { ...searchBody, action: "replace" }, 400, "invalid_plan_request");
  await expectError("POST", { ...searchBody, stats: { strength: 999999 } }, 400, "invalid_plan_request");
  await expectError("POST", { ...searchBody, prices: [1] }, 400, "invalid_plan_request");
  for (const locale of [["en"], ["ru"], {}, 1]) await expectError("POST", { ...searchBody, locale }, 400, "invalid_plan_request");
  for (const slots of [[], ["INVENTED_SLOT"], ["WRIST", "WRIST"], "WRIST", [1]]) await expectError("POST", { ...searchBody, selectedSlots: slots }, 400, "invalid_equipment_slots");
  for (const budgetGold of [1, "-1", "1.00001", "1e6"]) await expectError("POST", { ...searchBody, budgetGold }, 400, "invalid_budget");
  assert.equal(state.starts.length, 0, "Invalid input reached an expensive search");
  const started = await send("POST", searchBody);
  assert.equal(started.status, 202);
  const completed = await waitFor(started.payload);
  assert.equal(completed.status, "completed");assert.equal(completed.result.budgetCopper, 100001);
  assert.deepEqual(state.starts[0].input, { characterSlug: searchBody.characterSlug, budgetCopper: 100001, selectedSlots: ["WRIST"], scenario: "single-target", locale: "ru" });
  assert.equal(state.starts[0].actor, owner(tokenA));assert.equal(state.starts[0].token, tokenA);
  state.session = { battleNetAccessToken: tokenB };
  await expectError("GET", undefined, 404, "plan_not_found", { query: `?id=${started.payload.id}` });
  await expectError("DELETE", undefined, 404, "plan_not_found", { query: `?id=${started.payload.id}` });
  state.session = { battleNetAccessToken: tokenA };
  const context = { input: { budgetCopper: 100001, selectedSlots: ["WRIST"] }, options: [{ id: "synthetic-lot:WRIST:variant" }, { id: "synthetic-other:WRIST:variant" }] };
  const entry = createAuctionGearSearch(owner(tokenA), context);entries.push(entry);
  const foreign = createAuctionGearSearch(owner(tokenB), context);entries.push(foreign);
  const sameOwnerOther = createAuctionGearSearch(owner(tokenA), { ...context, options: [{ id: "another-pool:WRIST:variant" }] });entries.push(sameOwnerOther);
  await expectError("POST", { action: "resume", searchId: foreign.id }, 404, "search_not_found");
  await expectError("POST", { action: "assemble", searchId: foreign.id, allowedOptionIds: [context.options[0].id] }, 404, "search_not_found");
  await expectError("POST", { action: "resume", searchId: "unknown-search" }, 404, "search_not_found");
  for (const action of ["resume", "assemble"]) for (const extra of [{ budgetGold: "999999" }, { budgetCopper: 1 }, { selectedSlots: ["HEAD"] }, { prices: [1] }, { stats: { strength: 999 } }]) {
    await expectError("POST", { action, searchId: entry.id, ...(action === "assemble" ? { allowedOptionIds: [context.options[0].id] } : {}), ...extra }, 400, "invalid_plan_request");
  }
  for (const ids of [[], ["unknown-option"], ["another-pool:WRIST:variant"], [context.options[0].id, context.options[0].id], [123], "all"]) {
    await expectError("POST", { action: "assemble", searchId: entry.id, allowedOptionIds: ids }, 400, "invalid_auction_selection");
  }
  assert.equal(state.verifies.length, 0, "Tampered continuation reached an expensive verification");
  const resumed = await send("POST", { action: "resume", searchId: entry.id });
  assert.equal(resumed.status, 202);assert.equal((await waitFor(resumed.payload)).result.budgetCopper, 100001);
  const assembled = await send("POST", { action: "assemble", searchId: entry.id, allowedOptionIds: [context.options[0].id] });
  assert.equal(assembled.status, 202);assert.equal((await waitFor(assembled.payload)).result.budgetCopper, 100001);
  assert.equal(state.continuations[0], entry);assert.equal(state.assemblies[0].entry, entry);
  assert.deepEqual(state.assemblies[0].ids, [context.options[0].id]);assert.equal(state.verifies.length, 2);
  assert(state.verifies.every(check => check.entry === entry && check.token === tokenA));assert.equal(entry.busy, false);
  for (const excludedOptionIds of [["unknown-option"], ["another-pool:WRIST:variant"], [context.options[0].id, context.options[0].id], [123], "all", null]) {
    await expectError("POST", { action: "assemble", searchId: entry.id, excludedOptionIds }, 400, "invalid_auction_selection");
  }
  await expectError("POST", { action: "assemble", searchId: entry.id, allowedOptionIds: [context.options[0].id], excludedOptionIds: [] }, 400, "invalid_auction_selection");
  const defaultAssembly = await send("POST", { action: "assemble", searchId: entry.id });
  assert.equal(defaultAssembly.status, 202);await waitFor(defaultAssembly.payload);
  assert.equal(state.assemblies.at(-1).ids, undefined, "Omitting a selector must preserve the server-owned full-pool default");
  const excludingAssembly = await send("POST", { action: "assemble", searchId: entry.id, excludedOptionIds: [context.options[0].id] });
  assert.equal(excludingAssembly.status, 202);await waitFor(excludingAssembly.payload);
  assert.deepEqual(state.assemblies.at(-1).ids, { excludedOptionIds: [context.options[0].id] });
  // DELETE aborts real running job state, including the route's continuation wrapper.
  let release, activeSignal;
  state.verify = async (_entry, _token, signal) => { activeSignal = signal;await new Promise(resolve => { release = resolve; });signal.throwIfAborted(); };
  const held = await send("POST", { action: "resume", searchId: entry.id });
  assert.equal(held.status, 202);assert.equal(entry.busy, true);
  await expectError("POST", { action: "resume", searchId: entry.id }, 409, "plan_already_running");
  state.session = { battleNetAccessToken: tokenB };
  await expectError("DELETE", undefined, 404, "plan_not_found", { query: `?id=${held.payload.id}` });
  assert.equal(activeSignal.aborted, false);
  state.session = { battleNetAccessToken: tokenA };
  const cancelled = await send("DELETE", undefined, { query: `?id=${held.payload.id}` });
  assert.equal(cancelled.payload.status, "cancelled");assert.equal(activeSignal.aborted, true);
  release();await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await waitFor(held.payload)).status, "cancelled");assert.equal(entry.busy, false);
  assert.equal(state.continuations.length, 1, "Cancelled verification continued into search simulation");
  // Exercise the real continuation verifier and real market parser/refresh with
  // synthetic upstream responses, separately from the route task-transport stub.
  const character = { id: 910001, name: "Synthetic", level: 81, realm: { id: 910002, slug: "synthetic-api", name: "Synthetic" },
    playableClass: { id: 1, name: "Warrior" }, playableRace: { id: 1, name: "Human" }, faction: { type: "ALLIANCE", name: "Alliance" }, region: "eu", accountId: 910003 };
  const rawCharacter = { ...character, playable_class: character.playableClass, playable_race: character.playableRace };
  const profile = { id: character.id, level: character.level };
  const specializations = { character: { id: character.id }, active_specialization: { id: 72 },
    specializations: [{ specialization: { id: 72 }, loadouts: [{ is_active: true, talent_loadout_code: "synthetic-offline-loadout" }] }] };
  const equipment = { character: { id: character.id }, equipped_items: [{ slot: { type: "WRIST" }, item: { id: 910004 }, level: { value: 120 } }] };
  const lot = { id: 910005, item: { id: 910006, context: 1, bonus_lists: [123], modifiers: [{ type: 9, value: 81 }] }, buyout: 100000, quantity: 2 };
  const offer = { auctionId: lot.id, itemId: lot.item.id, contextId: 1, bonusIds: [123], modifiers: [{ type: 9, value: 81 }], buyoutCopper: 100000, quantity: 2 };
  let ownedCharacter = rawCharacter, currentProfile = profile, currentLots = [lot], connectedRealm = 910007;
  let modified = new Date().toUTCString(), transportCalls = 0, marketRefreshes = 0;
  globalThis.fetch = async (url, init) => {
    transportCalls++;
    const endpoint = new URL(url);
    assert.equal(endpoint.origin, "https://eu.api.blizzard.com");
    assert.equal(init.headers.Authorization, `Bearer ${tokenA}`);
    assert(!endpoint.searchParams.has("access_token"));
    if (endpoint.pathname === "/profile/user/wow") return Response.json({ wow_accounts: [{ id: character.accountId, characters: ownedCharacter ? [ownedCharacter] : [] }] });
    if (endpoint.pathname.endsWith("/specializations")) return Response.json(specializations);
    if (endpoint.pathname.endsWith("/equipment")) return Response.json(equipment);
    if (endpoint.pathname === "/profile/wow/character/synthetic-api/synthetic") return Response.json(currentProfile);
    if (endpoint.pathname === "/data/wow/realm/synthetic-api") return Response.json({ connected_realm: { href: `https://eu.api.blizzard.com/data/wow/connected-realm/${connectedRealm}` } });
    if (endpoint.pathname === `/data/wow/connected-realm/${connectedRealm}/auctions`) {
      marketRefreshes++;return Response.json({ auctions: currentLots }, { headers: { "last-modified": modified } });
    }
    assert.fail(`Unexpected offline fixture endpoint: ${endpoint.pathname}`);
  };
  const canonical = await getBattleNetSimulationSnapshot(tokenA, character);
  const verifiedOption = { id: "verified-option", auctionId: lot.id, quantity: lot.quantity, costCopper: lot.buyout, variantKey: auctionVariantKey(offer) };
  const verifiedContext = {
    input: { characterSlug: "eu--synthetic-api--synthetic", locale: "ru", budgetCopper: 100001, selectedSlots: ["WRIST"] }, character,
    options: [verifiedOption],
    profileFingerprint: auctionGearProfileFingerprint(canonical),
    market: { id: "old-snapshot", region: "eu", connectedRealmId: connectedRealm, offers: [], sourceUpdatedAt: modified, fetchedAt: "old-fetch" },
    publicMarket: { snapshotId: "old-snapshot", region: "eu", realm: "Synthetic", connectedRealmId: connectedRealm, updatedAt: modified },
  };
  const verified = createAuctionGearSearch(owner(tokenA), verifiedContext);entries.push(verified);
  const signal = new AbortController().signal;
  await verifyAuctionGearSearch(verified, tokenA, signal);
  assert.equal(marketRefreshes, 1);assert.notEqual(verifiedContext.market.id, "old-snapshot");
  assert.equal(verifiedContext.publicMarket.snapshotId, verifiedContext.market.id);assert.deepEqual(verifiedContext.market.offers, []);
  await verifyAuctionGearSearch(verified, tokenA, signal);
  assert.equal(marketRefreshes, 2, "Continuation must refresh rather than reuse the five-minute market cache");
  const cases = [
    { name: "ownership disappeared", change: () => { ownedCharacter = null; }, error: /character_not_found/ },
    { name: "ownership identity changed", change: () => { ownedCharacter = { ...rawCharacter, id: character.id + 1 }; }, error: /character_not_found/ },
    { name: "profile changed", change: () => { currentProfile = { ...profile, level: 82 }; }, error: /character_snapshot_changed/ },
    { name: "lot removed", change: () => { currentLots = []; }, field: "removedLots", remaining: 0 },
    { name: "price changed", change: () => { currentLots = [{ ...lot, buyout: lot.buyout + 1 }]; }, field: "repricedLots", remaining: 1 },
    { name: "quantity changed", change: () => { currentLots = [{ ...lot, quantity: 1 }]; }, field: "quantityChangedLots", remaining: 1 },
    { name: "item identity changed", change: () => { currentLots = [{ ...lot, item: { ...lot.item, id: lot.item.id + 1 } }]; }, field: "variantsChangedLots", remaining: 0 },
    { name: "context changed", change: () => { currentLots = [{ ...lot, item: { ...lot.item, context: 2 } }]; }, field: "variantsChangedLots", remaining: 0 },
    { name: "bonuses changed", change: () => { currentLots = [{ ...lot, item: { ...lot.item, bonus_lists: [124] } }]; }, field: "variantsChangedLots", remaining: 0 },
    { name: "modifiers changed", change: () => { currentLots = [{ ...lot, item: { ...lot.item, modifiers: [{ type: 9, value: 82 }] } }]; }, field: "variantsChangedLots", remaining: 0 },
    { name: "realm changed", change: () => { connectedRealm = 910008; }, error: /auction_market_changed/ },
    { name: "market stale", change: () => { modified = new Date(Date.now() - 3 * 60 * 60_000).toUTCString(); }, error: /market_stale/ },
    { name: "market timestamp absent", change: () => { modified = ""; }, error: /market_timestamp_unverified/ },
  ];
  for (const test of cases) {
    ownedCharacter = rawCharacter;currentProfile = profile;currentLots = [lot];connectedRealm = 910007;modified = new Date().toUTCString();
    verifiedContext.options = [verifiedOption];
    test.change();
    if (test.error) await assert.rejects(verifyAuctionGearSearch(verified, tokenA, signal), test.error, test.name);
    else {
      await verifyAuctionGearSearch(verified, tokenA, signal);
      assert.equal(verifiedContext.marketChange[test.field], 1, test.name);
      assert.equal(verifiedContext.options.length, test.remaining, test.name);
      if (test.field === "repricedLots") assert.equal(verifiedContext.options[0].costCopper, lot.buyout + 1);
      if (test.field === "quantityChangedLots") assert.equal(verifiedContext.options[0].quantity, 1);
      assert.deepEqual(selectedAuctionGearAssemblyOptions(verified, [verifiedOption.id]), verifiedContext.options, "A previously valid sold option ID must be accepted and removed by the server");
    }
  }
  const aborted = new AbortController();aborted.abort();const beforeAbort = transportCalls;
  await assert.rejects(verifyAuctionGearSearch(verified, tokenA, aborted.signal), { name: "AbortError" });
  assert.equal(transportCalls, beforeAbort);assert.equal(verifiedContext.input.budgetCopper, 100001);
  // A real stalled ownership/equipment request must observe DELETE's abort,
  // clear private busy state and release the serialized queue without manually
  // resolving the upstream request. Only the upstream transport is synthetic.
  ownedCharacter = rawCharacter;currentProfile = profile;currentLots = [lot];connectedRealm = 910007;modified = new Date().toUTCString();
  const fixtureFetch = globalThis.fetch;
  state.verify = verifyAuctionGearSearch;
  for (const blockedPath of ["/profile/user/wow", "/profile/wow/character/synthetic-api/synthetic/equipment"]) {
    let reached = false, upstreamAborted = false;
    globalThis.fetch = (url, init) => {
      if (new URL(url).pathname !== blockedPath) return fixtureFetch(url, init);
      reached = true;assert(init.signal instanceof AbortSignal, "Profile transport must receive the job's abort signal");
      return new Promise((_resolve, reject) => {
        const abort = () => { upstreamAborted = true;reject(init.signal.reason); };
        if (init.signal.aborted) abort();else init.signal.addEventListener("abort", abort, { once: true });
      });
    };
    const blocked = await send("POST", { action: "resume", searchId: verified.id });
    assert.equal(blocked.status, 202);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert(reached, `Actual verifier did not reach ${blockedPath}`);assert.equal(verified.busy, true);
    state.session = { battleNetAccessToken: tokenB };
    const next = await send("POST", { ...searchBody, locale: "en" });
    assert.equal(next.status, 202);
    const queued = await send("GET", undefined, { query: `?id=${next.payload.id}` });
    assert.equal(queued.payload.status, "queued", "Another owner's job must wait for the serialized verifier");
    state.session = { battleNetAccessToken: tokenA };
    const removed = await send("DELETE", undefined, { query: `?id=${blocked.payload.id}` });
    assert.equal(removed.payload.status, "cancelled");
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(upstreamAborted, true);assert.equal(verified.busy, false);
    state.session = { battleNetAccessToken: tokenB };
    assert.equal((await waitFor(next.payload)).status, "completed", "Cancellation must release the next owner's job");
    state.session = { battleNetAccessToken: tokenA };
    assert.equal((await waitFor(blocked.payload)).status, "cancelled");
  }
  // End-to-end selection boundary: real search -> public positive filter -> HTTP
  // assembly -> real full-pool validator and planner. Only upstream authentication
  // and Runner transport are stubbed; no network or native simulations run.
  const simulation = dps => ({ dps, dpsError: 0.1, confidence: 95, iterations: 750, engine: "SimulationCraft synthetic-api-pairs" });
  function pairCandidate(slotType, itemId, constraints = {}) {
    const ring = slotType.startsWith("FINGER");
    const inventoryType = ring ? 11 : slotType === "HEAD" ? 1 : 5;
    const itemSubclassId = ring ? 0 : 4;
    const result = { entityId: `synthetic-${itemId}`, itemId, name: `Synthetic ${itemId}`, slotType, itemLevel: 100,
      inventoryType, itemClassId: 4, itemSubclassId,
      season: { id: "synthetic", patch: "synthetic", status: "current", evidence: "synthetic" },
      source: { type: "auction", evidence: "auction" }, constraints: { uniqueEquipped: false, requiredLevel: 1, ...constraints },
      compatibility: { specId: 72, method: "specialization", itemClassId: 4, itemSubclassId }, provenance: { buildId: 1 },
      eligible: true, rejectionReasons: [], variants: [{ key: "base", itemLevel: 100, contextId: 0, bonusIds: [] }] };
    assert.equal(equipmentCompatibility({ classId: 1, specId: 72, slotType, itemClassId: 4, itemSubclassId, inventoryType }), null);
    return result;
  }
  const pairOption = (id, slot, constraints) => ({ id: `synthetic-${id}:${slot}`, auctionId: id, quantity: 1, costCopper: 10000,
    candidate: pairCandidate(slot, id, constraints), variantKey: "base" });
  const pairCases = [
    { name: "nonlinear", slots: ["HEAD", "CHEST"], options: [pairOption(930001, "HEAD"), pairOption(930002, "CHEST")], loadout: [],
      simulate: async selection => simulation(selection.length === 2 ? 1200 : selection.length ? 990 : 1000), evaluation: "not_upgrade" },
    { name: "unique-repair", slots: ["FINGER_1", "FINGER_2"],
      options: [pairOption(930003, "FINGER_1", { limitCategoryId: 10, limitQuantity: 1 }), pairOption(930004, "FINGER_2", { limitCategoryId: 9, limitQuantity: 1 })],
      loadout: [{ slotType: "FINGER_1", itemId: 930005, inventoryType: 11, itemSubclassId: 0, limitCategoryId: 9, limitQuantity: 1 },
        { slotType: "FINGER_2", itemId: 930006, inventoryType: 11, itemSubclassId: 0, limitCategoryId: 10, limitQuantity: 1 }],
      simulate: async selection => simulation(1000 + selection.length * 100), evaluation: "requires_combination" },
  ];
  state.verify = async (_entry, _token, signal) => signal.throwIfAborted();
  for (const fixture of pairCases) {
    state.start = async (input, actor, _token, signal) => {
      const pairContext = { input, options: fixture.options, loadout: fixture.loadout, specId: 72,
        market: { sourceUpdatedAt: new Date().toISOString() }, simulate: fixture.simulate };
      const pairEntry = createAuctionGearSearch(actor, pairContext);entries.push(pairEntry);
      const searched = await searchAuctionGearOptions({ ...pairContext, searchId: pairEntry.id, selectedSlots: input.selectedSlots,
        budgetCopper: input.budgetCopper, signal });
      pairEntry.searchCheckpoint = searched.checkpoint;
      pairEntry.latestSearchResult = { ...searched.result, discoveryComplete: true, dataComplete: true };
      return pairEntry.latestSearchResult;
    };
    state.assemble = async (pairEntry, selection, signal, progress) => {
      const selected = selectedAuctionGearAssemblyOptions(pairEntry, selection);
      const assembled = await assembleAuctionGear({ ...pairEntry.context, options: selected, searchId: pairEntry.id,
        selectedSlots: pairEntry.context.input.selectedSlots, budgetCopper: pairEntry.context.input.budgetCopper,
        signal, onProgress: progress, baseline: pairEntry.searchCheckpoint.baseline, simulationCache: pairEntry.searchCheckpoint.simulationCache });
      return assembled.result;
    };
    const pairSearch = await send("POST", { ...searchBody, characterSlug: `synthetic-${fixture.name}`, budgetGold: "2", selectedSlots: fixture.slots });
    assert.equal(pairSearch.status, 202);
    const pairResult = (await waitFor(pairSearch.payload)).result;
    assert(pairResult.items.every(item => item.evaluation === fixture.evaluation));
    assert.equal(getAuctionGearRecommendations(pairResult.items).length, 0, "Public list must keep non-upgrade singles hidden");
    const pairAssembly = await send("POST", { action: "assemble", searchId: pairResult.searchId, excludedOptionIds: [] });
    assert.equal(pairAssembly.status, 202);
    const assembledPair = (await waitFor(pairAssembly.payload)).result;
    assert.equal(assembledPair.comparison.deltaDps, 200, `${fixture.name}: full-pool assembly lost the combined gain`);
    assert.equal(assembledPair.comparison.uncertainty.significant, true);
    assert.equal(assembledPair.purchases.length, 2);
    assert.equal(assembledPair.spentCopper, 20000);assert.equal(assembledPair.budgetCopper, 20000);
    const excludedPair = await send("POST", { action: "assemble", searchId: pairResult.searchId, excludedOptionIds: [fixture.options[0].id] });
    assert.equal(excludedPair.status, 202);
    const excludedResult = (await waitFor(excludedPair.payload)).result;
    assert.equal(excludedResult.comparison.deltaDps, 0, `${fixture.name}: explicitly excluded item was still assembled`);
    assert.deepEqual(excludedResult.purchases, []);
  }
  console.log(`Auction API checks passed (${checks} HTTP responses + ${cases.length + 3} actual freshness/abort checks + 2 blocked-profile cancellation cases + nonlinear/unique-repair full-pool HTTP assembly): route/selection, CSRF, body cap, private caching, owner isolation, immutable budget, full-pool default/exclusions/legacy selection, hidden non-upgrades, cancellation and actual market/profile revalidation; offline synthetic transports only.`);
} finally {
  for (const entry of entries) deleteAuctionGearSearch(entry.owner, entry.id);
  globalThis.fetch = savedFetch;hooks.deregister();delete globalThis.__gildraAuctionApiTest;
}
