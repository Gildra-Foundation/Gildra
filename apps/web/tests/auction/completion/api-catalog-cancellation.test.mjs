import assert from "node:assert/strict";
import test from "node:test";
import * as jobs from "../../../lib/wow/auctionGearJobs.ts";
import { lookupGearEntities, lookupGearRecords } from "../../../lib/wow/gearCandidateRepository.ts";

const tick = () => new Promise(resolve => setImmediate(resolve));
const savedFetch = globalThis.fetch;
function gatedCatalog({ summaries = 16, holdSummaries = false } = {}) {
  const calls = [], pending = [];
  globalThis.fetch = async (url, init) => {
    const isSummary = new URL(url).pathname.endsWith("/entity-summaries");
    const payload = isSummary ? { data: Array.from({ length: summaries }, (_, i) => ({ id: `synthetic-${i}`, externalId: i + 1 })), pagination: { hasMore: false } }
      : { id: new URL(url).pathname, tooltip: { blocks: [] } };
    const result = () => Response.json(payload);
    calls.push({ isSummary, signal: init.signal });
    if (isSummary && !holdSummaries) return result();
    return await new Promise((resolve, reject) => {
      const signal = init.signal;
      const abort = () => reject(signal.reason);
      if (signal.aborted) return abort();
      signal.addEventListener("abort", abort, { once: true });
      pending.push(() => { signal.removeEventListener("abort", abort); resolve(result()); });
    });
  };
  return { calls, async release() { for (let wave = 0; wave < 10; wave++) { pending.splice(0).forEach(resolve => resolve()); await tick(); } } };
}

test("cancelling baseline catalog details aborts requests, stops new waves and frees the global runner", async () => {
  const catalog = gatedCatalog();
  let secondStarted = false;
  const first = jobs.enqueueAuctionGearJob("synthetic-details", async signal => {
    await lookupGearEntities(Array.from({ length: 16 }, (_, i) => i + 1), "ru_RU", signal);
    signal.throwIfAborted(); return { kind: "search", searchId: "synthetic-first" };
  });
  await tick();
  const second = jobs.enqueueAuctionGearJob("synthetic-next", async () => { secondStarted = true; return { kind: "search", searchId: "synthetic-next" }; });
  jobs.cancelAuctionGearJob("synthetic-details", first.id);
  await tick(); await tick();
  const secondStartedAfterCancel = secondStarted;
  const details = catalog.calls.filter(call => !call.isSummary);
  const requestSignalsAborted = details.every(call => call.signal.aborted);
  try { await catalog.release(); }
  finally { globalThis.fetch = savedFetch; }
  assert.equal(secondStartedAfterCancel, true, "Cancelled catalog work must release the global auction runner promptly");
  assert.equal(requestSignalsAborted, true);
  assert.equal(catalog.calls.filter(call => !call.isSummary).length, 8, "No English or later detail wave may launch after cancellation");
  assert.equal(jobs.getAuctionGearJob("synthetic-next", second.id).status, "completed");
});

test("cancelling catalog summaries aborts all requests and prevents later batches", async () => {
  const catalog = gatedCatalog({ summaries: 0, holdSummaries: true });
  const controller = new AbortController();
  const work = lookupGearRecords(Array.from({ length: 801 }, (_, i) => i + 1), "en_US", undefined, undefined, controller.signal);
  const settled = work.then(() => "resolved", () => "rejected");
  await tick(); assert.equal(catalog.calls.length, 4);
  controller.abort(); await tick();
  const aborted = catalog.calls.every(call => call.signal.aborted);
  try { await catalog.release(); }
  finally { globalThis.fetch = savedFetch; }
  assert.equal(await settled, "rejected");
  assert.equal(aborted, true);
  assert.equal(catalog.calls.length, 4);
});

test("an already cancelled lookup performs no catalog requests", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ data: [], pagination: { hasMore: false } }); };
  try {
    const signal = AbortSignal.abort(new Error("cancelled"));
    await assert.rejects(lookupGearEntities([1], "en_US", signal), /cancelled/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = savedFetch; }
});
