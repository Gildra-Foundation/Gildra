import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearReportCache, fetchSiteReport, parseDateRange, type PlausibleEnv } from "../../src/analytics/plausible";

type Body = { dimensions?: string[]; metrics: string[]; site_id: string; date_range: unknown };

type Row = { metrics: unknown[]; dimensions: unknown[] };

/**
 * Fake of POST /api/v2/query answering in the real v2 shape: one row per
 * dimension value, `metrics` in the requested order, `dimensions` matching the
 * requested dimensions (none for the aggregate query). `override` replaces the
 * rows of one query kind to simulate malformed answers.
 */
function upstream(override?: { dim: string | undefined; results: Row[] }) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Body;
    const dim = body.dimensions?.[0];
    if (override && override.dim === dim) return Response.json({ results: override.results, meta: {}, query: body });
    const results =
      dim === "event:page"
        ? [{ dimensions: ["/guides/a"], metrics: [40, 90] }]
        : dim === "visit:source"
          ? [{ dimensions: ["Google"], metrics: [30] }, { dimensions: [""], metrics: [5] }]
          : dim === "time:day"
            ? [{ dimensions: ["2026-10-01"], metrics: [10, 20] }]
            : [{ dimensions: [], metrics: [120, 300, 45, 61.5] }];
    return Response.json({ results, meta: {}, query: body });
  });
}

const env = (fetchImpl: PlausibleEnv["fetchImpl"], extra: Partial<PlausibleEnv> = {}): PlausibleEnv => ({
  url: "https://plausible.test",
  apiKey: "secret-key",
  timeoutMs: 1000,
  fetchImpl,
  ...extra,
});

beforeEach(() => clearReportCache());

describe("fetchSiteReport", () => {
  it("maps a successful v2 query and sends a server-side bearer key", async () => {
    const fetchImpl = upstream();
    const result = await fetchSiteReport("gildra.net", "30d", env(fetchImpl as never));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.report.aggregate).toEqual({ visitors: 120, pageviews: 300, bounceRate: 45, visitDuration: 61.5 });
    expect(result.report.topPages).toEqual([{ page: "/guides/a", visitors: 40, pageviews: 90 }]);
    expect(result.report.sources).toEqual([
      { source: "Google", visitors: 30 },
      { source: "Direct / None", visitors: 5 },
    ]);
    expect(result.report.timeseries).toEqual([{ date: "2026-10-01", visitors: 10, pageviews: 20 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://plausible.test/api/v2/query");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer secret-key");
    expect(JSON.parse(String(init!.body)).site_id).toBe("gildra.net");
  });

  it("caches per site and range", async () => {
    const fetchImpl = upstream();
    await fetchSiteReport("gildra.net", "7d", env(fetchImpl as never));
    const second = await fetchSiteReport("gildra.net", "7d", env(fetchImpl as never));
    expect(second.status === "ok" && second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    await fetchSiteReport("riftden.com", "7d", env(fetchImpl as never));
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });

  it("reports missing configuration without calling upstream", async () => {
    const fetchImpl = upstream();
    expect(await fetchSiteReport(null, "30d", env(fetchImpl as never))).toEqual({ status: "not-configured", missing: ["plausibleSiteId"] });
    expect(await fetchSiteReport("x", "30d", env(fetchImpl as never, { url: undefined, apiKey: "" }))).toEqual({
      status: "not-configured",
      missing: ["PLAUSIBLE_URL", "PLAUSIBLE_API_KEY"],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthorized-upstream"],
    [500, "upstream"],
    [429, "upstream"],
  ])("maps HTTP %i to %s", async (status, error) => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status }));
    expect(await fetchSiteReport("s", "30d", env(fetchImpl as never))).toEqual({ status: "error", error, httpStatus: status });
  });

  it.each<[string, string | undefined, Row[]]>([
    ["non-numeric metric", undefined, [{ dimensions: [], metrics: ["malformed", 1, 2, 3] }]],
    ["metrics:['malformed']", undefined, [{ dimensions: [], metrics: ["malformed"] }]],
    ["truncated aggregate metrics", undefined, [{ dimensions: [], metrics: [120] }]],
    ["no aggregate row", undefined, []],
    ["two aggregate rows", undefined, [{ dimensions: [], metrics: [1, 2, 3, 4] }, { dimensions: [], metrics: [1, 2, 3, 4] }]],
    ["negative count", undefined, [{ dimensions: [], metrics: [-1, 2, 3, 4] }]],
    ["null visitors", undefined, [{ dimensions: [], metrics: [null, 2, 3, 4] }]],
    ["Infinity encoded as string", undefined, [{ dimensions: [], metrics: ["Infinity", 2, 3, 4] }]],
    ["page row without dimension", "event:page", [{ dimensions: [], metrics: [1, 2] }]],
    ["page row with numeric dimension", "event:page", [{ dimensions: [42], metrics: [1, 2] }]],
    ["page row with truncated metrics", "event:page", [{ dimensions: ["/a"], metrics: [1] }]],
    ["source row with extra metric", "visit:source", [{ dimensions: ["Google"], metrics: [1, 2] }]],
    ["time series with a non-date dimension", "time:day", [{ dimensions: ["yesterday"], metrics: [1, 2] }]],
  ])("treats %s as invalid-response, never as zero", async (_name, dim, results) => {
    const fetchImpl = upstream({ dim, results });
    expect(await fetchSiteReport("s", "30d", env(fetchImpl as never))).toMatchObject({ status: "error", error: "invalid-response" });
  });

  it("accepts truthful empty data: zero aggregate, no rows, null bounce rate", async () => {
    const empty = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Body;
      const results = body.dimensions?.length ? [] : [{ dimensions: [], metrics: [0, 0, null, null] }];
      return Response.json({ results, meta: {}, query: body });
    });
    const result = await fetchSiteReport("s", "30d", env(empty as never));
    expect(result).toMatchObject({
      status: "ok",
      report: { aggregate: { visitors: 0, pageviews: 0, bounceRate: null, visitDuration: null }, topPages: [], sources: [], timeseries: [] },
    });
  });

  it("rejects malformed responses", async () => {
    const notJson = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(await fetchSiteReport("s", "30d", env(notJson as never))).toMatchObject({ status: "error", error: "invalid-response" });
    const wrongShape = vi.fn(async () => Response.json({ results: [{ metrics: 1 }] }));
    expect(await fetchSiteReport("s", "30d", env(wrongShape as never))).toMatchObject({ status: "error", error: "invalid-response" });
  });

  it("times out instead of hanging and reports network failures", async () => {
    const hanging = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    );
    const started = Date.now();
    expect(await fetchSiteReport("s", "30d", env(hanging as never, { timeoutMs: 50 }))).toMatchObject({ status: "error", error: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await fetchSiteReport("s", "30d", env(down as never))).toMatchObject({ status: "error", error: "network" });
  });

  it("never caches failures", async () => {
    const failing = vi.fn(async () => new Response("", { status: 503 }));
    await fetchSiteReport("s", "30d", env(failing as never));
    const ok = upstream();
    expect((await fetchSiteReport("s", "30d", env(ok as never))).status).toBe("ok");
  });
});

describe("parseDateRange", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("accepts presets and bounded custom ranges", () => {
    expect(parseDateRange("30d", null, null, now)).toBe("30d");
    expect(parseDateRange("custom", "2026-09-01", "2026-09-30", now)).toEqual(["2026-09-01", "2026-09-30"]);
    expect(parseDateRange("custom", "2024-02-29", "2024-03-01", now)).toEqual(["2024-02-29", "2024-03-01"]);
    // today is allowed; 366 days inclusive is the maximum
    expect(parseDateRange("custom", "2026-10-08", "2026-10-08", now)).toEqual(["2026-10-08", "2026-10-08"]);
    expect(parseDateRange("custom", "2025-10-08", "2026-10-08", now)).toEqual(["2025-10-08", "2026-10-08"]);
  });
  it.each([
    ["all", null, null],
    ["custom", "2026-09-30", "2026-09-01"],
    ["custom", "2024-01-01", "2026-01-01"],
    ["custom", "2026-10-01", "2026-12-01"],
    ["custom", "2026-1-1", "2026-02-01"],
    ["custom", "2026-02-01", "2026-02-31"],
    ["custom", "2026-02-30", "2026-03-01"],
    ["custom", "2026-13-01", "2026-13-02"],
    ["custom", "2026-04-31", "2026-05-01"],
    ["custom", "2025-02-29", "2025-03-01"],
    ["custom", "2026-10-01", "2026-10-09"],
    ["custom", "2026-10-09", "2026-10-09"],
    ["custom", "2025-10-07", "2026-10-08"],
    [undefined, null, null],
  ])("rejects %s %s %s", (period, from, to) => {
    expect(parseDateRange(period, from, to, now)).toBeNull();
  });
});
