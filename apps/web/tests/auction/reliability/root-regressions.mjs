import { auctionGearVariantSelectionKey } from "../../../lib/wow/auctionGearExclusions.ts";
import { auctionGearMechanicalKey, createAuctionGearMechanicalCache } from "../../../lib/wow/auctionGearMechanicalCache.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import { resolvedAuctionVariant, auctionVariantKey } from "../../../lib/wow/auctionItemVariant.ts";
import { auctionGearProfileFingerprint } from "../../../lib/wow/auctionGearFingerprint.ts";
import { auctionGearPurchase } from "../../../lib/wow/auctionGearPlanner.ts";
import { createAuctionGearSearch, deleteAuctionGearSearch } from "../../../lib/wow/auctionGearSearchStore.ts";
import { enqueueAuctionGearJob } from "../../../lib/wow/auctionGearJobs.ts";

// Desired user behaviour, actual modules, synthetic transports only. No network,
// credentials, database, native worker or published test route is used.
const cases = [];
const check = (name, run) => cases.push({ name, run });
const engine = "SimulationCraft synthetic-reliability";
const minimal = { dps: 1000, dpsError: 1, confidence: 95, iterations: 750, engine };
const full = { ...minimal, casts: [{ abilityId: "synthetic", time: 0 }], dpsSeries: [1000],
  resources: [{ name: "synthetic", points: [1, 2] }], modelNotice: "Synthetic timeline not needed by gear ranking" };
const source = await readFile(new URL("../../../lib/wow/auctionGearRunner.ts", import.meta.url), "utf8");
const selectionCode = stripTypeScriptTypes(source.slice(source.indexOf("export function selectedAuctionGearAssemblyOptions("),
  source.indexOf("export function selectedAuctionGearOptions(")), { mode: "strip" }).replace(/^export /gm, "");
const selectedAuctionGearAssemblyOptions = new vm.Script(selectionCode + "\n;selectedAuctionGearAssemblyOptions").runInNewContext({auctionGearVariantSelectionKey});
const simulatorCode = stripTypeScriptTypes(source.slice(source.indexOf("function createAuctionSimulator(")), { mode: "strip" });
const createSimulator = new vm.Script(simulatorCode + "\n;createAuctionSimulator").runInNewContext({
  auctionGearMechanicalKey, auctionGearMechanicalCache: createAuctionGearMechanicalCache(), auctionGearProfileFingerprint, AbortSignal, process: { env: { ROTATION_WORKER_URL: "http://synthetic.invalid" } }, Number, JSON, Error,
  assertFreshMarket() {}, prepareGearLoadout: () => ({ equipment: {}, changes: [] }),
  fetch: async () => Response.json(full, { headers: { "x-gildra-engine": "simulationcraft" } }),
});
check("native results retain only the five fields used by gear ranking", async () => {
  const simulate = createSimulator({ armory: { profile: {}, equipment: {}, specializations: {} }, loadout: [], specId: 72,
    specSlug: "fury-warrior", scenario: "single-target", encounter: { fightLengthSeconds: 120, targets: 1 },
    rules: ["synthetic"], market: {}, engine: () => engine });
  const result = await simulate([], new AbortController().signal);
  assert.deepEqual(Object.keys(result).sort(), Object.keys(minimal).sort());
  assert.deepEqual(JSON.parse(JSON.stringify(result)), minimal);
});
const offer = { itemId: 123, auctionId: 1, quantity: 1, buyoutCopper: 100, contextId: 13, bonusIds: [1], modifiers: [] };
const weapon = { minDamage: 2800, maxDamage: 4200, dps: 1000, speedSeconds: 3.5 };
const metadata = { key: auctionVariantKey(offer), itemId: 123, itemLevel: 100, requiredLevel: 1, inventoryType: 17,
  itemClassId: 2, itemSubclassId: 8, quality: 3, uniqueEquipped: false, setId: 0, stats: { strength: 10 },
  weapon, effects: ["Synthetic verified exact effect"], effectsVerified: true };
check("exact native weapon and verified effect facts survive variant resolution", () => {
  const variant = resolvedAuctionVariant(offer, metadata, engine);
  assert.deepEqual(variant.resolution.weapon, weapon);
  assert.deepEqual(variant.resolution.effects, metadata.effects);
  assert.equal(variant.resolution.effectsVerified, true);
});
check("exact item facts survive serialization into a shopping-list purchase", () => {
  const variant = { key: metadata.key, itemLevel: 100, contextId: 13, bonusIds: [1],
    resolution: { engine, requiredLevel: 1, stats: metadata.stats, weapon, effects: metadata.effects, effectsVerified: true } };
  const purchase = auctionGearPurchase({ id: "synthetic-exact", auctionId: 1, quantity: 1, costCopper: 100,
    candidate: { itemId: 123, name: "Synthetic weapon", slotType: "MAIN_HAND", inventoryType: 17, quality: 3,
      constraints: { requiredLevel: 1 }, variants: [variant] }, variantKey: variant.key });
  assert.deepEqual(purchase.weapon, weapon);
  assert.deepEqual(purchase.effects, metadata.effects);
  assert.equal(purchase.effectsVerified, true);
});
check("unavailable effect descriptions stay unverified instead of inventing base tooltip text", () => {
  const variant = resolvedAuctionVariant(offer, { ...metadata, effects: undefined, effectsVerified: false, weapon: undefined }, engine);
  assert(!variant.resolution.effects?.length);
  assert.notEqual(variant.resolution.effectsVerified, true);
});

const token = "synthetic-root-reliability-owner";
const owner = createHash("sha256").update(`battle-net:${token}`).digest("hex");
let session = { battleNetAccessToken: token };
globalThis.__gildraReliabilityRoot = { auth: () => session, select: selectedAuctionGearAssemblyOptions };
const moduleURL = code => `data:text/javascript,${encodeURIComponent(code)}`;
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") return { url: moduleURL("export async function auth(){return globalThis.__gildraReliabilityRoot.auth()}"), shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner") return { url: moduleURL(`
export const selectedAuctionGearAssemblyOptions=(...args)=>globalThis.__gildraReliabilityRoot.select(...args);
export const startAuctionGearSearch=async()=>{throw Error('unexpected_expensive_search')};
export const continueAuctionGearSearch=async()=>{throw Error('unexpected_expensive_resume')};
export const assembleAuctionGearSearch=async()=>{throw Error('unexpected_expensive_assembly')};
export const verifyAuctionGearSearch=async()=>{throw Error('unexpected_expensive_verify')};
`), shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
} });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Unexpected network in root reliability tests"); };
const route = await import("../../../app/api/wow/auction-gear-plans/route.ts");
async function get(query, headers = {}) {
  const response = await route.GET(new Request(`https://gildra.example/api/wow/auction-gear-plans?${new URLSearchParams(query)}`,
    { headers: { host: "gildra.example", origin: "https://gildra.example", ...headers } }));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();
  assert(!JSON.stringify(payload).includes(token));
  assert(!JSON.stringify(payload).includes(owner));
  assert(!JSON.stringify(payload).includes("DO_NOT_SERIALIZE_PRIVATE_CONTEXT"));
  return { status: response.status, payload };
}
const search = { kind: "search", searchId: "synthetic-public-search", selectedSlots: ["WRIST"], budgetCopper: 1000,
  baseline: minimal, items: [], searchComplete: true, discoveryComplete: true, dataComplete: true, pendingItems: 0,
  simulations: 1, engine, searchLimited: false, optionsConsidered: 0 };
const entry = createAuctionGearSearch(owner, { input: { characterSlug: "synthetic-character", locale: "ru", scenario: "single-target", budgetCopper: 1000,
  selectedSlots: ["WRIST"] }, options: [], privateSecret: "DO_NOT_SERIALIZE_PRIVATE_CONTEXT", publicMarket: { snapshotId: "synthetic", region: "eu", realm: "Synthetic", updatedAt: new Date().toISOString() },
  profileFingerprint: "synthetic-combat-fingerprint", coverage: { discoveryComplete: true, dataComplete: true } });
entry.latestSearchResult = { ...search, searchId: entry.id };
entry.excludedOptionIds = [];
const recoveryQuery = { searchId: entry.id, characterSlug: "synthetic-character", locale: "ru" };
check("owned reload recovery returns the original search without recalculation or private context", async () => {
  const result = await get(recoveryQuery);
  assert.equal(result.status, 200);
  assert.equal(result.payload.kind, "recovery");
  assert.equal(result.payload.search.searchId, entry.id);
  assert.equal(result.payload.search.budgetCopper, 1000);
  assert.equal(result.payload.needsRefresh, true);
  assert.deepEqual(result.payload.excludedOptionIds, []);
});
check("reload recovery never returns another character or locale", async () => {
  assert.equal((await get({ ...recoveryQuery, characterSlug: "other-character" })).status, 404);
  assert.equal((await get({ ...recoveryQuery, locale: "en" })).status, 404);
});
check("reload recovery remains owner-bound and no-store", async () => {
  session = { battleNetAccessToken: "synthetic-other-owner" };
  try { assert.equal((await get(recoveryQuery)).status, 404); }
  finally { session = { battleNetAccessToken: token }; }
});
check("guest and cross-site recovery are rejected before reading private results", async () => {
  session = null;
  try { assert.equal((await get(recoveryQuery)).status, 401); }
  finally { session = { battleNetAccessToken: token }; }
  assert.equal((await get(recoveryQuery, { origin: "https://foreign.example" })).status, 403);
});
const job = enqueueAuctionGearJob(owner, async () => ({ ...search, searchId: entry.id }),
  { scope: { characterSlug: "synthetic-character", locale: "ru" }, searchId: entry.id });
check("initial-job recovery checks the requested character and locale", async () => {
  assert.equal((await get({ id: job.id, characterSlug: "wrong-character", locale: "ru" })).status, 404);
  assert.equal((await get({ id: job.id, characterSlug: "synthetic-character", locale: "en" })).status, 404);
});
check("initial-job recovery exposes only its safe scope and associated search", async () => {
  const result = await get({ id: job.id, characterSlug: "synthetic-character", locale: "ru" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.payload.scope, { characterSlug: "synthetic-character", locale: "ru" });
  assert.equal(result.payload.searchId, entry.id);
});

const rows = [];
try {
  for (const { name, run } of cases) {
    try { await run(); rows.push({ name, status: "passed" }); }
    catch (error) { rows.push({ name, status: "failed", error: { name: error.name, message: error.message } }); }
  }
} finally {
  hooks.deregister();globalThis.fetch = originalFetch;deleteAuctionGearSearch(owner, entry.id);
  delete globalThis.__gildraReliabilityRoot;
}
const mode = process.argv[2] ?? "green";
assert(["red", "green"].includes(mode));
const report = { mode, sourceRevision: process.env.RELIABILITY_SOURCE_REVISION ?? null, method: "Actual current runner/variant/planner/store/jobs/API, synthetic response/data/auth/transport only; zero external/native calls", cases: rows,
  passed: rows.filter(row => row.status === "passed").length, failed: rows.filter(row => row.status === "failed").length };
const output = resolve(process.env.AUCTION_REGRESSION_OUTPUT_DIR ?? resolve(process.cwd(), "../../.artifacts/auction-reliability-20261016"));await mkdir(output, { recursive: true });
await writeFile(resolve(output, `root-${mode}.json`), JSON.stringify(report, null, 2) + "\n", { flag: mode === "red" ? "wx" : "w" });
console.log(JSON.stringify(report));
if (mode === "red") assert(report.failed >= 6, "Baseline must reproduce desired behaviour failures");
else assert.equal(report.failed, 0, "Root reliability regressions must all pass");
