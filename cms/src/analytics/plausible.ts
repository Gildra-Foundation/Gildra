/**
 * Server-only client for the Plausible CE Stats API v2 (`POST /api/v2/query`).
 * The API key never leaves the server; callers authorize the site first.
 */

export const PERIODS = ["day", "7d", "28d", "30d", "91d", "month", "6mo", "12mo"] as const;
export type Period = (typeof PERIODS)[number];
export type DateRange = Period | [string, string];

export type ReportError = "timeout" | "unauthorized-upstream" | "upstream" | "invalid-response" | "network";

export type SiteReport = {
  aggregate: { visitors: number; pageviews: number; bounceRate: number | null; visitDuration: number | null };
  topPages: { page: string; visitors: number; pageviews: number }[];
  sources: { source: string; visitors: number }[];
  timeseries: { date: string; visitors: number; pageviews: number }[];
};

export type ReportResult =
  | { status: "ok"; report: SiteReport; fetchedAt: string; cached: boolean }
  | { status: "not-configured"; missing: ("PLAUSIBLE_URL" | "PLAUSIBLE_API_KEY" | "plausibleSiteId")[] }
  | { status: "error"; error: ReportError; httpStatus?: number };

export type PlausibleEnv = { url?: string; apiKey?: string; timeoutMs?: number; fetchImpl?: typeof fetch };

export function plausibleEnv(): PlausibleEnv {
  return {
    url: process.env.PLAUSIBLE_URL,
    apiKey: process.env.PLAUSIBLE_API_KEY,
    timeoutMs: Number(process.env.PLAUSIBLE_TIMEOUT_MS || 5000),
  };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_CUSTOM_DAYS = 366;
const DAY_MS = 24 * 3600 * 1000;

/** Epoch ms of a real calendar date (rejects 2026-02-31, 2026-13-01, …), else null. */
function calendarDay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(y, m - 1, d);
  const check = new Date(time);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? time : null;
}

/**
 * Accepts a preset period or a custom inclusive `from`/`to` range of real
 * calendar dates, at most 366 days long and not ending after today. Dates are
 * calendar days in UTC (the CMS has no per-site timezone; Plausible applies the
 * site's own timezone to the same calendar dates).
 */
export function parseDateRange(period: unknown, from: unknown, to: unknown, now = new Date()): DateRange | null {
  if (period === "custom") {
    const start = calendarDay(from);
    const end = calendarDay(to);
    if (start === null || end === null || start > end) return null;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (end > today) return null;
    if ((end - start) / DAY_MS + 1 > MAX_CUSTOM_DAYS) return null;
    return [from as string, to as string];
  }
  return typeof period === "string" && (PERIODS as readonly string[]).includes(period) ? (period as Period) : null;
}

// ---------------------------------------------------------------------------
// Cache: bounded, process-local (single CMS instance). Short TTL for ranges
// that include today, longer for closed historical ranges.
// ---------------------------------------------------------------------------

type CacheEntry = { expiresAt: number; value: Extract<ReportResult, { status: "ok" }> };
const cache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 500;

export function clearReportCache(): void {
  cache.clear();
}

function ttlFor(range: DateRange, now: Date): number {
  if (Array.isArray(range)) {
    const today = now.toISOString().slice(0, 10);
    return range[1] < today ? 6 * 3600 * 1000 : 5 * 60 * 1000;
  }
  return 5 * 60 * 1000;
}

function remember(key: string, value: CacheEntry["value"], ttl: number, now: number) {
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, entry] of cache) if (entry.expiresAt <= now) cache.delete(k);
    while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  }
  cache.set(key, { expiresAt: now + ttl, value });
}

// ---------------------------------------------------------------------------

type QueryBody = {
  site_id: string;
  metrics: string[];
  date_range: DateRange;
  dimensions?: string[];
  order_by?: [string, "asc" | "desc"][];
  pagination?: { limit: number };
};

type QueryResponse = { results: { metrics: unknown[]; dimensions: unknown[] }[] };

/** Metrics that Plausible may legitimately return as null when there is no data. */
const NULLABLE_METRICS = new Set(["bounce_rate", "visit_duration"]);
const DAY_DIMENSION = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every row must carry exactly the requested metrics (finite numbers ≥ 0,
 * null only where Plausible defines it) and exactly the requested dimensions
 * (strings; `time:day` as YYYY-MM-DD). Anything else is a malformed answer,
 * never a "zero" statistic.
 */
function validRow(row: unknown, body: QueryBody): boolean {
  if (!row || typeof row !== "object") return false;
  const { metrics, dimensions } = row as { metrics?: unknown; dimensions?: unknown };
  if (!Array.isArray(metrics) || metrics.length !== body.metrics.length) return false;
  const wanted = body.dimensions ?? [];
  if (!Array.isArray(dimensions) || dimensions.length !== wanted.length) return false;
  const metricsOk = metrics.every((value, i) =>
    value === null ? NULLABLE_METRICS.has(body.metrics[i]) : typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  const dimensionsOk = dimensions.every((value, i) =>
    typeof value === "string" && (wanted[i] !== "time:day" || DAY_DIMENSION.test(value)),
  );
  return metricsOk && dimensionsOk;
}

class UpstreamError extends Error {
  constructor(
    public readonly code: ReportError,
    public readonly httpStatus?: number,
  ) {
    super(code);
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));

async function query(env: Required<Pick<PlausibleEnv, "url" | "apiKey">> & PlausibleEnv, body: QueryBody, signal: AbortSignal) {
  const doFetch = env.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${env.url.replace(/\/$/, "")}/api/v2/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    const name = (error as Error).name;
    throw new UpstreamError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
  if (response.status === 401 || response.status === 403) throw new UpstreamError("unauthorized-upstream", response.status);
  if (!response.ok) throw new UpstreamError("upstream", response.status);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new UpstreamError("invalid-response", response.status);
  }
  const results = (data as QueryResponse | null)?.results;
  if (!Array.isArray(results) || !results.every((row) => validRow(row, body))) {
    throw new UpstreamError("invalid-response", response.status);
  }
  // An aggregate query (no dimensions) always answers with exactly one row.
  if (!body.dimensions?.length && results.length !== 1) throw new UpstreamError("invalid-response", response.status);
  return results;
}

/**
 * Fetch the dashboard report for one Plausible site. Never throws: every
 * failure is a typed state the UI renders honestly (no invented numbers).
 */
export async function fetchSiteReport(
  siteId: string | null | undefined,
  range: DateRange,
  env: PlausibleEnv = plausibleEnv(),
  now = new Date(),
): Promise<ReportResult> {
  const missing: ("PLAUSIBLE_URL" | "PLAUSIBLE_API_KEY" | "plausibleSiteId")[] = [];
  if (!env.url) missing.push("PLAUSIBLE_URL");
  if (!env.apiKey) missing.push("PLAUSIBLE_API_KEY");
  if (!siteId) missing.push("plausibleSiteId");
  if (missing.length) return { status: "not-configured", missing };

  const key = `${env.url}|${siteId}|${JSON.stringify(range)}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now.getTime()) return { ...hit.value, cached: true };

  const signal = AbortSignal.timeout(env.timeoutMs && env.timeoutMs > 0 ? env.timeoutMs : 5000);
  const cfg = { ...env, url: env.url!, apiKey: env.apiKey! };
  const site = siteId!;
  try {
    const [aggregate, pages, sources, series] = await Promise.all([
      query(cfg, { site_id: site, metrics: ["visitors", "pageviews", "bounce_rate", "visit_duration"], date_range: range }, signal),
      query(
        cfg,
        {
          site_id: site,
          metrics: ["visitors", "pageviews"],
          date_range: range,
          dimensions: ["event:page"],
          order_by: [["pageviews", "desc"]],
          pagination: { limit: 10 },
        },
        signal,
      ),
      query(
        cfg,
        {
          site_id: site,
          metrics: ["visitors"],
          date_range: range,
          dimensions: ["visit:source"],
          order_by: [["visitors", "desc"]],
          pagination: { limit: 10 },
        },
        signal,
      ),
      query(cfg, { site_id: site, metrics: ["visitors", "pageviews"], date_range: range, dimensions: ["time:day"] }, signal),
    ]);
    const totals = aggregate[0]?.metrics ?? [];
    const value: Extract<ReportResult, { status: "ok" }> = {
      status: "ok",
      cached: false,
      fetchedAt: now.toISOString(),
      report: {
        aggregate: {
          visitors: num(totals[0]),
          pageviews: num(totals[1]),
          bounceRate: numOrNull(totals[2]),
          visitDuration: numOrNull(totals[3]),
        },
        topPages: pages.map((r) => ({ page: str(r.dimensions[0]), visitors: num(r.metrics[0]), pageviews: num(r.metrics[1]) })),
        sources: sources.map((r) => ({ source: str(r.dimensions[0]) || "Direct / None", visitors: num(r.metrics[0]) })),
        timeseries: series.map((r) => ({ date: str(r.dimensions[0]), visitors: num(r.metrics[0]), pageviews: num(r.metrics[1]) })),
      },
    };
    remember(key, value, ttlFor(range, now), now.getTime());
    return value;
  } catch (error) {
    if (error instanceof UpstreamError) return { status: "error", error: error.code, httpStatus: error.httpStatus };
    return { status: "error", error: "invalid-response" };
  }
}
