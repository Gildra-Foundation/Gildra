import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAnalyticsOverview } from "../../lib/analytics/overview.ts";

const empty = { hours: 24, events: 0, uniqueUsers: 0, activeSubscriptions: 0, series: [] };
const point = { hour: "2026-10-22T12:00:00Z", events: 12, uniqueUsers: 4 };
const requestWith = (body: unknown, status = 200): typeof fetch => async () => Response.json(body, { status });

test("a valid zero summary remains distinct from a failed request", async () => {
  assert.deepEqual(await fetchAnalyticsOverview("https://example.test", 24, requestWith(empty)), empty);
  assert.equal(await fetchAnalyticsOverview("https://example.test", 24, requestWith({ message: "unavailable" }, 503)), null);
});
test("populated summaries retain the original counts and time series", async () => {
  const data = { ...empty, events: 12, uniqueUsers: 4, series: [point] };
  let options: RequestInit | undefined;
  const result = await fetchAnalyticsOverview("https://example.test", 24, async (url, init) => {
    assert.equal(url, "https://example.test/v1/analytics/overview?hours=24");options = init;
    return Response.json(data);
  });
  assert.deepEqual(result, data);assert.equal(options?.cache, "no-store");assert.ok(options?.signal);
});
test("network and JSON failures do not manufacture zero metrics", async () => {
  assert.equal(await fetchAnalyticsOverview("https://example.test", 24, async () => { throw new DOMException("timeout", "TimeoutError"); }), null);
  assert.equal(await fetchAnalyticsOverview("https://example.test", 24, async () => new Response("not JSON")), null);
});
test("malformed counts and timestamps produce an unavailable state", async () => {
  for (const data of [null, {}, { ...empty, events: -1 }, { ...empty, uniqueUsers: "4" }, { ...empty, hours: 0 }, { ...empty, series: [{ ...point, hour: "not-a-date" }] }, { ...empty, series: [{ ...point, uniqueUsers: null }] }]) {
    assert.equal(await fetchAnalyticsOverview("https://example.test", 24, requestWith(data)), null);
  }
});
