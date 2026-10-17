import assert from "node:assert/strict";
import test from "node:test";
import { retireAuctionClient, waitForAuctionClientRetirement } from "../../../lib/wow/auctionGearClient.ts";

test("completed retirement releases settled Response values instead of retaining their history", async () => {
  for (let index = 0; index < 200; index++) {
    retireAuctionClient(Promise.resolve(new Response(new Uint8Array(65536))));
    const completion = await waitForAuctionClientRetirement();
    assert.ok(completion === undefined, "The global barrier must not retain completed response bodies or earlier settled arrays");
  }
});

test("replacement still waits for every older retirement, including a rejected cancellation", async () => {
  let finishFirst, finishSecond;
  const first = new Promise(resolve => { finishFirst = resolve; });
  const second = new Promise((resolve, reject) => { finishSecond = reject; });
  retireAuctionClient(first);
  retireAuctionClient(second);
  let retired = false;
  const pending = waitForAuctionClientRetirement().then(() => { retired = true; });
  finishSecond(new Error("synthetic cancellation rejection"));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(retired, false, "A later retirement must not bypass the older in-flight request");
  finishFirst(new Response("synthetic late POST response"));
  await pending;
  assert.equal(retired, true);
  assert.ok(await waitForAuctionClientRetirement() === undefined, "A settled retirement must discard its Response values");
});
