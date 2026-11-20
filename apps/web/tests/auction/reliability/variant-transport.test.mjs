import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { resolveAuctionVariants } from "../../../lib/wow/auctionVariantResolver.ts";

test("metadata survives a dropped worker connection, retries once and honors cancellation", async () => {
  const bodies = [];
  let action = "dropThenSucceed", controller;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    bodies.push(body);
    if (action === "abort") controller.abort();
    if (action === "abort" || action === "drop" || action === "dropThenSucceed" && bodies.length === 1) {
      req.socket.destroy();
      return;
    }
    res.setHeader("x-gildra-engine", "simulationcraft");
    res.end(JSON.stringify({ engine: "SimulationCraft fixture",
      variants: JSON.parse(body).variants.map(v => ({ key: v.key, itemId: v.change.itemId })) }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const previous = process.env.ROTATION_WORKER_URL;
  process.env.ROTATION_WORKER_URL = "http://127.0.0.1:" + server.address().port;
  const resolve = () => resolveAuctionVariants({ spec: "fury-warrior", characterLevel: 81, signal: controller.signal,
    offers: [{slot: "head", offer: {auctionId: 1, itemId: 123, bonusIds: [], modifiers: [], contextId: 0, quantity: 1, buyoutCopper: 1}}] });
  try {
    controller = new AbortController();
    assert.equal((await resolve()).variants.size, 1);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    action = "drop";
    await assert.rejects(resolve, /fetch failed/);
    assert.equal(bodies.length, 4);
    action = "abort";
    await assert.rejects(resolve, {name: "AbortError"});
    assert.equal(bodies.length, 5);
  } finally {
    if (previous === undefined) delete process.env.ROTATION_WORKER_URL;
    else process.env.ROTATION_WORKER_URL = previous;
    const closed = once(server, "close");
    server.close();
    server.closeAllConnections();
    await closed;
  }
});

test("wide metadata requests preserve all rows and retry the same offset on a legacy worker", async t => {
  const sizes = [], progress = [];
  let legacy = false;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { variants } = JSON.parse(init.body);
    sizes.push(variants.length);
    if (legacy && variants.length > 16) return Response.json({ code: "invalid_variant_request" }, { status: 400 });
    const headers = { "x-gildra-engine": "simulationcraft" };
    if (!legacy) headers["x-gildra-variant-batch-limit"] = "64";
    return Response.json({ engine: "SimulationCraft fixture", variants: variants.map(v => ({ key: v.key, itemId: v.change.itemId })) }, { headers });
  });
  const offers = Array.from({ length: 70 }, (_, i) => ({ slot: "head", offer: {
    auctionId: i + 1, itemId: i + 1, bonusIds: [], modifiers: [], contextId: 0, quantity: 1, buyoutCopper: 1
  }}));
  const run = () => resolveAuctionVariants({ spec: "fury-warrior", characterLevel: 81, signal: new AbortController().signal,
    batchLimit: 64, offers, onProgress: done => progress.push(done) });
  const wide = await run();
  assert.equal(wide.batchLimit, 64);
  assert.deepEqual(sizes.splice(0), [64, 6]);
  assert.deepEqual(progress.splice(0), [64, 70]);
  legacy = true;
  const narrow = await run();
  assert.equal(narrow.batchLimit, 16);
  assert.deepEqual([...narrow.variants], [...wide.variants]);
  assert.deepEqual(sizes, [64, 16, 16, 16, 16, 6]);
  assert.deepEqual(progress, [16, 32, 48, 64, 70]);
});

test("paired metadata pages resolve each distinct item once and reject mixed engines", async t => {
  const offers = Array.from({ length: 150 }, (_, index) => ({ slot: "head",
    offer: { auctionId: index + 1, itemId: index + 1, bonusIds: [], modifiers: [], contextId: 0, quantity: 1, buyoutCopper: 1 } }));
  let active = 0, peak = 0, mismatch = false, legacy = false;
  const seen = [], progress = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { variants } = JSON.parse(init.body);
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise(resolve => setImmediate(resolve));
      if (legacy && variants.length > 16) return Response.json({ code: "invalid_variant_request" }, { status: 400 });
      seen.push(...variants.map(row => row.change.itemId));
      const engine = mismatch && variants[0].change.itemId === 65 ? "SimulationCraft changed" : "SimulationCraft verified";
      return Response.json({ engine, variants: variants.map(row => ({ key: row.key, itemId: row.change.itemId })) },
        { headers: { "x-gildra-engine": "simulationcraft", "x-gildra-variant-batch-limit": legacy ? "16" : "64" } });
    } finally {
      active--;
    }
  });
  const run = () => resolveAuctionVariants({ offers: [...offers, offers[0]], spec: "fury-warrior", characterLevel: 81,
    batchLimit: 64, parallelBatches: true, signal: new AbortController().signal, onProgress: n => progress.push(n) });
  const expectedIds = offers.map(row => row.offer.itemId);
  for (legacy of [false, true]) {
    const result = await run();
    assert.deepEqual([...result.variants.values()].map(row => row.itemId), expectedIds);
    assert.deepEqual(seen.splice(0).sort((a,b) => a-b), expectedIds);
    assert.deepEqual(progress.splice(0), [128, 150]);
    assert.equal(result.batchLimit, legacy ? 16 : 64);
    assert.equal(peak, 2);
  }
  legacy = false;
  mismatch = true;
  await assert.rejects(run, /simulation_version_changed/);
  assert.deepEqual(progress, []);
});

test("a failed metadata page cancels its sibling without publishing partial progress", async t => {
  const offers = Array.from({ length: 65 }, (_, i) => ({ slot: "head", offer: {
    auctionId: i + 1, itemId: i + 1, bonusIds: [], modifiers: [], contextId: 0, quantity: 1, buyoutCopper: 1
  }}));
  let pendingSignal;
  const sizes = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { variants } = JSON.parse(init.body);
    sizes.push(variants.length);
    if (variants[0].change.itemId === 1) {
      pendingSignal = init.signal;
      await new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
    }
    return Response.json({ variants: [] }, { headers: { "x-gildra-engine": "simulationcraft" } });
  });
  await assert.rejects(resolveAuctionVariants({ offers, spec: "fury-warrior", characterLevel: 81,
    batchLimit: 64, parallelBatches: true, signal: new AbortController().signal, onProgress: () => assert.fail("partial progress") }),
    /invalid_variant_resolution/);
  assert.equal(pendingSignal.aborted, true);
  assert.deepEqual(sizes.sort((a,b) => a-b), [32, 33]);
});
