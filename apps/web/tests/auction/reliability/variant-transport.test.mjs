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
