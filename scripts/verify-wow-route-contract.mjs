import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key.startsWith("--")) continue;
  args.set(key.slice(2), value?.startsWith("--") ? true : value ?? true);
  if (value && !value.startsWith("--")) index += 1;
}

const root = process.cwd();
const manifestPath = path.resolve(root, String(args.get("manifest") ?? "data/wow/route-manifest.json"));
const manifestSource = await fs.readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestSource);
const baseUrl = String(args.get("base-url") ?? manifest.siteOrigin).replace(/\/$/, "");
const label = String(args.get("label") ?? new URL(baseUrl).hostname).replace(/[^a-z0-9._-]+/gi, "-");
const strictPhase = String(args.get("strict-phase") ?? "P1");
const timeoutMs = Number(args.get("timeout-ms") ?? 30_000);
const concurrency = Number(args.get("concurrency") ?? 8);
const outputPath = path.resolve(root, String(args.get("output") ?? `route-contract-${label}.json`));

if (!manifest.phases.includes(strictPhase)) {
  throw new Error(`Unknown strict phase: ${strictPhase}`);
}
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error(`Invalid timeout: ${timeoutMs}`);
}
if (!Number.isInteger(concurrency) || concurrency <= 0 || concurrency > 32) {
  throw new Error(`Invalid concurrency: ${concurrency}`);
}

const phaseRank = Object.fromEntries(manifest.phases.map((phase, index) => [phase, index]));
const phaseIncluded = (phase) => phaseRank[phase] <= phaseRank[strictPhase];

function parameterSets(group) {
  if (group.parameterSets) return group.parameterSets;
  return Object.entries(group.parameters ?? {}).reduce(
    (sets, [key, values]) => sets.flatMap((set) => values.map((value) => ({ ...set, [key]: value }))),
    [{}],
  );
}

function fillTemplate(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function localizedRows(definition, pathname) {
  return manifest.locales.map((locale) => ({
    routeId: definition.id,
    phase: definition.phase,
    locale,
    path: locale === "ru" ? `/ru${pathname === "/" ? "" : pathname}` : pathname,
    indexable: Boolean(definition.indexable),
    expectedStatus: 200,
    expectedContentType: definition.expectedContentType ?? "text/html",
    redirect: false,
  }));
}

const expectedRoutes = [
  ...manifest.staticRoutes.flatMap((definition) => localizedRows(definition, definition.path)),
  ...manifest.routeGroups.flatMap((definition) => parameterSets(definition).flatMap(
    (values) => localizedRows(definition, fillTemplate(definition.template, values)),
  )),
  ...manifest.serviceRoutes.map((definition) => ({
    routeId: definition.id,
    phase: definition.phase,
    locale: "neutral",
    path: definition.path,
    indexable: false,
    expectedStatus: 200,
    expectedContentType: definition.expectedContentType,
    redirect: false,
  })),
  ...manifest.redirectRoutes.flatMap((definition) => manifest.locales.map((locale) => ({
    routeId: "legacy-redirect",
    phase: definition.phase ?? "P0",
    locale,
    path: locale === "ru" ? `/ru${definition.path}` : definition.path,
    indexable: false,
    expectedStatus: 308,
    expectedLocation: locale === "ru" ? `/ru${definition.redirectTo}` : definition.redirectTo,
    expectedContentType: "text/html",
    redirect: true,
  }))),
].filter((route) => phaseIncluded(route.phase));

function stripMarkup(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonEmptyTagText(body, tagName) {
  const matches = body.matchAll(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"));
  for (const match of matches) {
    const text = stripMarkup(match[1] ?? "");
    if (text) return text;
  }
  return null;
}

function normalizeLocation(value) {
  if (!value) return null;
  try {
    const url = new URL(value, manifest.siteOrigin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function normalizeCanonical(value) {
  if (!value) return null;
  try {
    const url = new URL(value, manifest.siteOrigin);
    return `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return null;
  }
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "GildraDeploymentRouteGate/1.0" },
      });
      if (response.status < 500 || attempt === 3) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError;
}

async function probe(route) {
  const result = {
    ...route,
    url: `${baseUrl}${route.path}`,
    status: null,
    contentType: null,
    location: null,
    title: null,
    h1: null,
    htmlLang: null,
    canonical: null,
    noindex: null,
    soft404: null,
    error: null,
    issues: [],
  };

  try {
    const response = await fetchWithRetry(result.url);
    result.status = response.status;
    result.contentType = response.headers.get("content-type");
    result.location = response.headers.get("location");
    const body = await response.text();

    if (!route.redirect && route.expectedContentType === "text/html" && response.status === 200) {
      result.title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
      result.h1 = firstNonEmptyTagText(body, "h1");
      result.htmlLang = body.match(/<html[^>]+lang=["']([^"']+)/i)?.[1] ?? null;
      result.canonical = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
        ?? body.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
        ?? null;
      result.noindex = /<meta[^>]+(?:name=["']robots["'][^>]+content=["'][^"']*noindex|content=["'][^"']*noindex[^>]+name=["']robots["'])/i.test(body);
      const visible = stripMarkup(body).slice(0, 40_000);
      result.soft404 = /page not found|страница не найдена|дерево .{0,80} недоступно/i.test(visible)
        || /<h1[^>]*>[^<]*(?:not found|недоступ)/i.test(body);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  if (route.redirect) {
    if (result.error) result.issues.push(`request:${result.error}`);
    if (result.status !== route.expectedStatus) result.issues.push(`status:${result.status ?? "none"}`);
    if (normalizeLocation(result.location) !== route.expectedLocation) {
      result.issues.push(`location:${result.location ?? "none"}`);
    }
    return result;
  }

  if (result.error) result.issues.push(`request:${result.error}`);
  if (result.status !== route.expectedStatus) result.issues.push(`status:${result.status ?? "none"}`);
  if (result.soft404) result.issues.push("soft404");
  if (!(result.contentType ?? "").includes(route.expectedContentType)) {
    result.issues.push(`content-type:${result.contentType ?? "none"}`);
  }
  if (route.expectedContentType === "text/html" && result.status === 200) {
    if (!result.title) result.issues.push("title-missing");
    if (!result.h1) result.issues.push("h1-missing");
    if (route.locale !== "neutral" && result.htmlLang !== route.locale) {
      result.issues.push(`lang:${result.htmlLang ?? "missing"}`);
    }
    if (route.indexable) {
      const expectedCanonical = normalizeCanonical(`${manifest.siteOrigin}${route.path}`);
      if (result.noindex) result.issues.push("unexpected-noindex");
      if (normalizeCanonical(result.canonical) !== expectedCanonical) {
        result.issues.push(`canonical:${result.canonical ?? "missing"}`);
      }
    } else if (!result.noindex) {
      result.issues.push("noindex-missing");
    }
  }
  return result;
}

async function mapConcurrent(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

const routes = await mapConcurrent(expectedRoutes, probe);
const violations = routes.filter((route) => route.issues.length > 0);
const summary = {
  generatedAt: new Date().toISOString(),
  scope: "P0/P1 runtime HTTP response contract only; this does not prove source presence or content completeness",
  baseUrl,
  label,
  strictPhase,
  manifestPath,
  manifestSha256: createHash("sha256").update(manifestSource).digest("hex"),
  expectedRoutes: expectedRoutes.length,
  checkedRoutes: routes.length,
  routeViolations: violations.length,
  redirectViolations: violations.filter((route) => route.redirect).length,
  releaseEligible: violations.length === 0,
};
const report = { summary, routes, violations };

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.stderr.write(
  `route-contract: ${label} checked ${summary.checkedRoutes} routes; ${summary.routeViolations} violations; manifest ${summary.manifestSha256}\n`,
);
if (violations.length > 0) process.exitCode = 1;
