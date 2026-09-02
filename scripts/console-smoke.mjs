#!/usr/bin/env node
/**
 * Playwright smoke for the API console (api.gildra.net panel).
 *
 * Runs against a live Next.js server (default http://127.0.0.1:3000) and
 * stubs every /v1 request with fixtures, so it needs no database and no
 * admin session.  /v1/admin/dashboard deliberately never answers: the test
 * proves that Overview, Datasets, API and System render without it.
 *
 *   NEXT_DIST_DIR=.next-blocks npm run start   # in another shell
 *   node scripts/console-smoke.mjs             # CONSOLE_SMOKE_URL overrides the origin
 */
import { chromium } from "playwright";

const origin = process.env.CONSOLE_SMOKE_URL ?? "http://127.0.0.1:3000";
const budgetMs = Number(process.env.CONSOLE_SMOKE_BUDGET_MS ?? 8000);
const now = new Date().toISOString();

const fixtures = {
  "/v1/auth/me": { user: { id: "u1", email: "ops@gildra.net", displayName: "Ops", role: "admin" } },
  "/v1/admin/system": { generatedAt: now, healthy: true, schemaVersion: 131, recoveryPolicy: "verified_same_host", systems: [
    { name: "API", status: "operational", latencyMs: 0 }, { name: "PostgreSQL", status: "operational", latencyMs: 3 },
    { name: "ClickHouse", status: "operational", latencyMs: 5 }, { name: "Redis", status: "degraded", latencyMs: 2001 },
  ] },
  "/v1/admin/catalog-health": { generatedAt: now, catalog: {
    entityCount: 1000, localizedCount: 900, describedCount: 800, tooltipCount: 700, iconCount: 600, relationshipCount: 50,
    readModelStatus: "fresh", activeBuildVersion: "12.1.0.69497", generation: 40, refreshedAt: now,
    lastPipelineRunId: 25, pipelineStatus: "running", pipelineStage: "import-wago", publicationReady: true,
    pipelineStartedAt: now, pipelineFinishedAt: null, warnings: ["import_activity_skipped"],
    imports: [{ id: "11111111-2222", source: "wago", buildVersion: "12.1.0.69587", status: "RUNNING", entityTypes: ["item"], locales: ["en_US"], recordsSeen: 10, recordsWritten: 10, liveSourceRecords: 0, startedAt: now, finishedAt: null, lastActivityAt: null, errorSummary: "" }],
  }, catalogReadiness: { product: "wow", buildId: 1, buildVersion: "12.1.0.69497", generatedAt: now, dataReady: true, productionReady: true, checks: [] } },
  "/v1/admin/analytics-overview": { generatedAt: now, analytics: { hours: 24, events: 12, uniqueUsers: 3, activeSubscriptions: 1, series: [{ hour: now, events: 12, uniqueUsers: 3 }] } },
  "/v1/admin/datasets": { generatedAt: now, count: 1, data: [dataset()] },
  "/v1/admin/datasets/tierlist-wowhead": { generatedAt: now, dataset: dataset() },
  "/v1/admin/datasets/tierlist-wowhead/freshness": { slug: "tierlist-wowhead", freshness: "fresh", freshUntil: now, lastSuccessAt: now, lastAttemptAt: now, refreshIntervalSeconds: 86400, generatedAt: now },
  "/v1/admin/datasets/tierlist-wowhead/runs": { count: 1, data: [{ id: "r1", trigger: "schedule", status: "succeeded", scheduledFor: now, startedAt: now, finishedAt: now, pageCount: 6, recordCount: 78, uniqueSpecCount: 39, errorSummary: "" }] },
  "/v1/admin/tierlist-wowhead": { count: 1, data: [{ activity: "raid", role: "dps", tier: "S", rankInTier: 1, className: "Mage", classSlug: "mage", specName: "Frost", specSlug: "frost", badgeSlug: "", guideTitle: "", guideUrl: "https://example.invalid/guide", sourceUrl: "", description: "", descriptionParagraphs: [] }] },
};

function dataset() {
  return { id: "d1", slug: "tierlist-wowhead", name: "Tierlist WoWHead", sourceName: "WoWHead", refreshIntervalSeconds: 86400, lastAttemptAt: now, lastSuccessAt: now, freshUntil: now, freshness: "fresh", lastErrorCode: "", lastErrorSummary: "", pageCount: 6, recordCount: 78, uniqueSpecCount: 39 };
}

const checks = [
  { path: "/api-console", name: "Overview", expect: ["Обзор API", "Полнота каталога", "Доступные методы API", "Живые счётчики импорта пропущены"] },
  { path: "/api-console/datasets", name: "Datasets", expect: ["Все датасеты", "Tierlist WoWHead", "Свежие данные"] },
  { path: "/api-console/datasets/tierlist-wowhead", name: "Dataset detail", expect: ["Данные датасета", "История обновлений", "Обновление выполнено"] },
  { path: "/api-console/api", name: "API", expect: ["Документация API", "/world-of-warcraft/{retail|classic|classic-era|hardcore}/v1", "https://api.gildra.net/world-of-warcraft/hardcore/v1"] },
  { path: "/api-console/system", name: "System", expect: ["Состояние системы", "PostgreSQL", "Отклонение", "Схема БД: версия 131"] },
];

const browser = await chromium.launch();
const failures = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const hits = new Map();
  await context.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url());
    hits.set(url.pathname, (hits.get(url.pathname) ?? 0) + 1);
    if (url.pathname === "/v1/admin/dashboard") return; // never answers: pages must not depend on it
    const body = fixtures[url.pathname];
    if (!body) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "not_found", message: `no fixture for ${url.pathname}` }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  for (const check of checks) {
    const page = await context.newPage();
    const started = Date.now();
    try {
      await page.goto(`${origin}${check.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      for (const text of check.expect) {
        await page.getByText(text, { exact: false }).first().waitFor({ timeout: budgetMs });
      }
      // No section may still be loading once the expected content is on screen.
      await page.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, null, { timeout: budgetMs });
      console.log(`ok   ${check.name.padEnd(15)} ${check.path} (${Date.now() - started} ms)`);
    } catch (reason) {
      failures.push(`${check.name}: ${reason instanceof Error ? reason.message.split("\n")[0] : String(reason)}`);
      console.log(`FAIL ${check.name.padEnd(15)} ${check.path}`);
    } finally {
      await page.close();
    }
  }
  if (hits.has("/v1/admin/dashboard")) {
    console.log(`note /v1/admin/dashboard was requested ${hits.get("/v1/admin/dashboard")} time(s); pages rendered without it`);
  }
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nconsole smoke: all pages rendered without waiting for /v1/admin/dashboard");
