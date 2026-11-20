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
