import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import * as store from "../../../lib/wow/auctionGearSearchStore.ts";
import * as jobs from "../../../lib/wow/auctionGearJobs.ts";

const owner = token => createHash("sha256").update(`battle-net:${token}`).digest("hex");
const tick = () => new Promise(resolve => setImmediate(resolve));
const moduleURL = source => `data:text/javascript,${encodeURIComponent(source)}`;
const token = "synthetic-reservation-owner";
globalThis.__auctionCompletionAPI = {
  verify: async entry => store.touchAuctionGearSearch(entry),
  resume: async entry => ({ kind: "search", searchId: entry.id, items: [] }),
};
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") return { url: moduleURL(`export async function auth(){return {battleNetAccessToken:${JSON.stringify(token)}}}`), shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner") return { url: moduleURL(`
export const startAuctionGearSearch=async()=>{throw Error('unexpected_start')};
export const continueAuctionGearSearch=(...args)=>globalThis.__auctionCompletionAPI.resume(...args);
export const assembleAuctionGearSearch=async()=>{throw Error('unexpected_assembly')};
export const selectedAuctionGearAssemblyOptions=()=>{throw Error('unexpected_selection')};
export const verifyAuctionGearSearch=(...args)=>globalThis.__auctionCompletionAPI.verify(...args);
`), shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
} });
const route = await import("../../../app/api/wow/auction-gear-plans/route.ts");
const context = () => ({ input: { characterSlug: "synthetic-character", locale: "en" }, options: [] });
async function post(searchId) {
  const response = await route.POST(new Request("https://gildra.example/api/wow/auction-gear-plans", { method: "POST",
    headers: { host: "gildra.example", origin: "https://gildra.example" }, body: JSON.stringify({ action: "resume", searchId }) }));
  return { status: response.status, body: await response.json() };
}
async function harness(run) {
  globalThis.__gildraAuctionGearSearches.clear();
  globalThis.__gildraAuctionStarts.clear();
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const victim = store.createAuctionGearSearch(owner(token), context());
  const others = Array.from({ length: 39 }, (_, i) => store.createAuctionGearSearch(`synthetic-other-${i}`, context()));
  const head = jobs.enqueueAuctionGearJob("synthetic-head", async () => {
    await held;
    const entry = store.createAuctionGearSearch("synthetic-head", context());
    return { kind: "search", searchId: entry.id };
  });
  try { await run({ victim, others, release, head }); }
  finally { release(); for (let i = 0; i < 8; i++) await tick(); }
}
const makeOldest = (victim, others) => {
  for (const entry of others) if (globalThis.__gildraAuctionGearSearches.has(entry.id)) store.getAuctionGearSearch(entry.owner, entry.id);
  assert.equal(globalThis.__gildraAuctionGearSearches.keys().next().value, victim.id);
};

test("accepted queued continuation survives another search creating a context at capacity", async () => harness(async ({ victim, others, release }) => {
  const accepted = await post(victim.id);
  assert.equal(accepted.status, 202);
  assert.equal(accepted.body.status, "queued");
  makeOldest(victim, others);
  release(); for (let i = 0; i < 8; i++) await tick();
  assert.equal(store.getAuctionGearSearch(owner(token), victim.id), victim, "Queued work must protect its retained search from LRU eviction");
  assert.equal(jobs.getAuctionGearJob(owner(token), accepted.body.id).status, "completed");
}));

test("queued cancellation and rejected duplicate enqueue release only their own reservations", async () => harness(async ({ victim, others }) => {
  const accepted = await post(victim.id);
  assert.equal(accepted.status, 202);
  assert.equal((await post(victim.id)).status, 409);
  jobs.cancelAuctionGearJob(owner(token), accepted.body.id);
  makeOldest(victim, others);
  store.createAuctionGearSearch("synthetic-replacement", context());
  assert.equal(store.getAuctionGearSearch(owner(token), victim.id), null, "Cancelled queued work must not leak a store reservation");
}));

test("running cancellation keeps its reservation until the task actually settles", async () => {
  globalThis.__gildraAuctionGearSearches.clear(); globalThis.__gildraAuctionStarts.clear();
  const victim = store.createAuctionGearSearch(owner(token), context());
  const others = Array.from({ length: 39 }, (_, i) => store.createAuctionGearSearch(`synthetic-running-${i}`, context()));
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const previous = globalThis.__auctionCompletionAPI.verify;
  globalThis.__auctionCompletionAPI.verify = async () => { await held; };
  try {
    const accepted = await post(victim.id); await tick();
    jobs.cancelAuctionGearJob(owner(token), accepted.body.id);
    // Runner finally blocks may clear busy before the enclosing task settles.
    victim.busy = false;
    makeOldest(victim, others);
    store.createAuctionGearSearch("synthetic-running-replacement", context());
    assert.equal(store.getAuctionGearSearch(owner(token), victim.id), victim);
  } finally { release(); await tick(); globalThis.__auctionCompletionAPI.verify = previous; }
});

test.after(() => { hook.deregister(); delete globalThis.__auctionCompletionAPI; });
