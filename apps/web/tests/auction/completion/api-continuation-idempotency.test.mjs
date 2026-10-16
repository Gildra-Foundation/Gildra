import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import * as store from "../../../lib/wow/auctionGearSearchStore.ts";
import * as jobs from "../../../lib/wow/auctionGearJobs.ts";
import { selectedAuctionGearAssemblyOptions } from "../../../lib/wow/auctionGearRunner.ts";

const token = "synthetic-continuation-nonce-token";
const owner = createHash("sha256").update(`battle-net:${token}`).digest("hex");
const moduleURL = source => `data:text/javascript,${encodeURIComponent(source)}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
let active;
globalThis.__completionNonce = { select: selectedAuctionGearAssemblyOptions, run: async (entry, _selection, signal) => {
  active.calls++; await active.gate; signal.throwIfAborted(); return { kind: "assembly", searchId: entry.id, purchases: [] };
} };
const hook = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/auth") return { url: moduleURL(`export async function auth(){return {battleNetAccessToken:${JSON.stringify(token)}}}`), shortCircuit: true };
  if (specifier === "@/lib/wow/auctionGearRunner") return { url: moduleURL(`
export const startAuctionGearSearch=async()=>{throw Error('unexpected_start')};
export const continueAuctionGearSearch=(entry,signal)=>globalThis.__completionNonce.run(entry,undefined,signal);
export const assembleAuctionGearSearch=(...args)=>globalThis.__completionNonce.run(...args);
export const verifyAuctionGearSearch=async(_entry,_token,signal)=>signal.throwIfAborted();
export const selectedAuctionGearAssemblyOptions=(...args)=>globalThis.__completionNonce.select(...args);
`), shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  return nextResolve(specifier, context);
} });
const route = await import("../../../app/api/wow/auction-gear-plans/route.ts");
async function send(method, body, query = {}) {
  const response = await route[method](new Request(`https://gildra.example/api/wow/auction-gear-plans?${new URLSearchParams(query)}`, { method,
    headers: { host: "gildra.example", origin: "https://gildra.example" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { status: response.status, body: await response.json() };
}
async function harness(run) {
  globalThis.__gildraAuctionStarts.clear();
  let release;
  active = { calls: 0, gate: new Promise(resolve => { release = resolve; }) };
  const context = { input: { characterSlug: "synthetic-character", locale: "en", scenario: "single-target" }, options: [{ id: "one" }, { id: "two" }] };
  const entry = store.createAuctionGearSearch(owner, context);
  try { await run(entry); }
  finally { release(); for (let i = 0; i < 6; i++) await tick(); }
}
const clientRequestId = "synthetic-continuation-request";
test("lost assembly acceptance replays canonically and remains nonce-recoverable", async () => harness(async entry => {
  const body = { action: "assemble", searchId: entry.id, excludedOptionIds: ["two", "one"], clientRequestId };
  const first = await send("POST", body); assert.equal(first.status, 202);
  const repeated = await send("POST", { ...body, excludedOptionIds: ["one", "two"] });
  assert.equal(repeated.status, 202); assert.equal(repeated.body.id, first.body.id); assert.equal(active.calls, 1);
  const recovered = await send("GET", undefined, { clientRequestId, characterSlug: "synthetic-character", locale: "en" });
  assert.equal(recovered.status, 200); assert.equal(recovered.body.id, first.body.id);
  assert.equal((await send("GET", undefined, { clientRequestId, characterSlug: "wrong", locale: "en" })).status, 404);
  for (const patch of [{ action: "resume", excludedOptionIds: undefined }, { excludedOptionIds: [] }, { searchId: "different-search" }]) {
    const conflict = await send("POST", { ...body, ...patch });
    assert.equal(conflict.status, 400); assert.equal(conflict.body.error, "invalid_plan_request");
  }
}));

test("matching resume replay succeeds even when its retained context has gone", async () => harness(async entry => {
  const body = { action: "resume", searchId: entry.id, clientRequestId: `${clientRequestId}-resume` };
  const first = await send("POST", body); assert.equal(first.status, 202);
  store.deleteAuctionGearSearch(owner, entry.id);
  const replay = await send("POST", body);
  assert.equal(replay.status, 202); assert.equal(replay.body.id, first.body.id); assert.equal(active.calls, 1);
}));

test("a delayed accepted continuation can be recovered and cancelled by its preallocated nonce", async () => harness(async entry => {
  const nonce = `${clientRequestId}-late`;
  let stream;
  const request = new Request("https://gildra.example/api/wow/auction-gear-plans", { method: "POST", duplex: "half",
    headers: { host: "gildra.example", origin: "https://gildra.example" }, body: new ReadableStream({ start(controller) { stream = controller; } }) });
  const pending = route.POST(request);
  await tick();
  const query = { clientRequestId: nonce, characterSlug: "synthetic-character", locale: "en" };
  assert.equal((await send("GET", undefined, query)).status, 404);
  const body = { action: "assemble", searchId: entry.id, excludedOptionIds: [], clientRequestId: nonce };
  stream.enqueue(new TextEncoder().encode(JSON.stringify(body))); stream.close();
  const accepted = await pending; assert.equal(accepted.status, 202);
  const recovered = await send("GET", undefined, query); assert.equal(recovered.status, 200);
  const cancelled = await send("DELETE", undefined, { id: recovered.body.id }); assert.equal(cancelled.body.status, "cancelled");
  const replay = await send("POST", body);
  assert.equal(replay.status, 202); assert.equal(replay.body.id, recovered.body.id); assert.equal(replay.body.status, "cancelled");
  assert.equal(active.calls, 1);
}));

test("malformed continuation request identities fail before any task starts", async () => harness(async entry => {
  for (const nonce of [null, 1, "short", "invalid request identity"])
    assert.equal((await send("POST", { action: "resume", searchId: entry.id, clientRequestId: nonce })).status, 400);
  assert.equal(active.calls, 0);
}));
test.after(() => { hook.deregister(); delete globalThis.__completionNonce; });
