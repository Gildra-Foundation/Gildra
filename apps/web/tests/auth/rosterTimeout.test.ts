import assert from "node:assert/strict";
import { test } from "node:test";
import { BattleNetProfileError, getBattleNetCharacters } from "../../lib/wow/battleNetCharacters.ts";

test("a stalled provider is bounded even without a parent signal and remains retryable", async (t) => {
  const deadline = new AbortController();
  let requestedBudget = 0;
  let requestSignal: AbortSignal | null | undefined;
  t.mock.method(AbortSignal, "timeout", (milliseconds: number) => { requestedBudget = milliseconds; return deadline.signal; });
  t.mock.method(globalThis, "fetch", (_url: unknown, init: RequestInit) => {
    requestSignal = init.signal;
    return new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
  });
  const pending = getBattleNetCharacters("isolated-test-token", "en", "eu");
  assert.ok(requestSignal, "provider fetch must have a deadline without a caller signal");
  assert.equal(requestedBudget, 15_000);
  deadline.abort(new DOMException("isolated deadline", "TimeoutError"));
  await assert.rejects(pending, (error: unknown) => error instanceof BattleNetProfileError && error.status === 503);

  t.mock.method(globalThis, "fetch", async () => Response.json({ wow_accounts: [] }));
  assert.deepEqual(await getBattleNetCharacters("isolated-test-token", "en", "eu"), []);
});

test("caller cancellation aborts provider work and is not mistaken for an empty roster", async (t) => {
  const parent = new AbortController();
  const deadline = new AbortController();
  let requestSignal: AbortSignal | null | undefined;
  t.mock.method(AbortSignal, "timeout", () => deadline.signal);
  t.mock.method(globalThis, "fetch", (_url: unknown, init: RequestInit) => {
    requestSignal = init.signal;
    return new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true }));
  });
  const pending = getBattleNetCharacters("isolated-test-token", "en", "eu", parent.signal);
  parent.abort(new DOMException("navigation ended", "AbortError"));
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.equal(requestSignal?.aborted, true);
  assert.equal(deadline.signal.aborted, false);
});
