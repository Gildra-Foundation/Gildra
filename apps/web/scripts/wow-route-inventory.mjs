import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key.startsWith("--")) {
    args.set(key.slice(2), value?.startsWith("--") ? true : value ?? true);
    if (value && !value.startsWith("--")) index += 1;
  }
}

const routeManifestPath = path.join(root, "data/wow/route-manifest.json");
const routeManifest = JSON.parse(await fs.readFile(routeManifestPath, "utf8"));
const baseUrl = String(args.get("base-url") ?? routeManifest.siteOrigin).replace(/\/$/, "");
const label = String(args.get("label") ?? new URL(baseUrl).hostname.replace(/[^a-z0-9-]+/gi, "-"));
const outputDir = path.resolve(root, String(args.get("output-dir") ?? "docs/reports/wow"));
const strictPhase = String(args.get("strict-phase") ?? "");
const timeoutMs = Number(args.get("timeout-ms") ?? 30_000);

const phaseRank = Object.fromEntries(routeManifest.phases.map((phase, index) => [phase, index]));
const phaseIncluded = (phase) => !strictPhase || phaseRank[phase] <= phaseRank[strictPhase];

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

function sourceRoute(file) {
  const relative = path.relative(path.join(root, "app"), file).replaceAll(path.sep, "/");
  const suffix = relative.match(/\/(page|route)\.(?:js|jsx|ts|tsx)$/)?.[0]
    ?? relative.match(/^(page|route)\.(?:js|jsx|ts|tsx)$/)?.[0];
  if (!suffix) return null;
  const kind = suffix.includes("route.") ? "route" : "page";
  let route = relative.slice(0, -suffix.length);
  route = route.split("/").filter((segment) => !/^\(.+\)$/.test(segment) && !segment.startsWith("@")).join("/");
  route = `/${route}`.replace(/\/$/, "") || "/";
  return { file: path.relative(root, file).replaceAll(path.sep, "/"), kind, pattern: route };
}

function patternRegex(pattern) {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\[\\\[\\\.\\\.\\\.(.+?)\\\]\\\]/g, ".+")
    .replace(/\\\[\\\.\\\.\\\.(.+?)\\\]/g, ".+")
    .replace(/\\\[(.+?)\\\]/g, "[^/]+");
  return new RegExp(`^${escaped}/?$`);
}

const appFiles = await walk(path.join(root, "app"));
const sourceRoutes = appFiles.map(sourceRoute).filter(Boolean).sort((a, b) => a.pattern.localeCompare(b.pattern) || a.kind.localeCompare(b.kind));
const sourcePages = sourceRoutes.filter((route) => route.kind === "page");
const sourceMatch = (pathname) => sourcePages.find((route) => patternRegex(route.pattern).test(pathname));

function parameterSets(group) {
  if (group.parameterSets) return group.parameterSets;
  const entries = Object.entries(group.parameters ?? {});
  return entries.reduce((sets, [key, values]) => sets.flatMap((set) => values.map((value) => ({ ...set, [key]: value }))), [{}]);
}

function fillTemplate(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

function localizedRows(definition, pathname) {
  return routeManifest.locales.map((locale) => {
    const pathForLocale = locale === "ru" ? `/ru${pathname === "/" ? "" : pathname}` : pathname;
    return {
      routeId: definition.id,
      phase: definition.phase,
      locale,
      path: pathForLocale,
      indexable: Boolean(definition.indexable),
      expectedStatus: 200,
      expectedContentType: definition.expectedContentType ?? "text/html",
      forbidden: false,
    };
  });
}

const expectedRoutes = [
  ...routeManifest.staticRoutes.flatMap((definition) => localizedRows(definition, definition.path)),
  ...routeManifest.routeGroups.flatMap((definition) => parameterSets(definition).flatMap((values) => localizedRows(definition, fillTemplate(definition.template, values)))),
  ...routeManifest.serviceRoutes.map((definition) => ({
    routeId: definition.id,
    phase: definition.phase,
    locale: "neutral",
    path: definition.path,
    indexable: false,
    expectedStatus: 200,
    expectedContentType: definition.expectedContentType,
    forbidden: false,
  })),
  ...routeManifest.redirectRoutes.flatMap((definition) => routeManifest.locales.map((locale) => ({
    routeId: "legacy-redirect",
    phase: definition.phase ?? "P0",
    locale,
    path: locale === "ru" ? `/ru${definition.path}` : definition.path,
    indexable: false,
    expectedStatus: 308,
    expectedLocation: locale === "ru" ? `/ru${definition.redirectTo}` : definition.redirectTo,
    expectedContentType: "text/html",
    redirect: true,
    forbidden: false,
  }))),
];

function stripMarkup(value) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstNonEmptyTagText(body, tagName) {
  const matches = body.matchAll(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"));
  for (const match of matches) {
    const text = stripMarkup(match[1] ?? "");
    if (text) return text;
  }
  return null;
}

async function probe(route) {
  const source = route.locale === "neutral" ? sourceRoutes.find((item) => patternRegex(item.pattern).test(route.path)) : sourceMatch(route.path);
  const result = {
    ...route,
    sourceExists: Boolean(source),
    sourcePattern: source?.pattern ?? null,
    sourceFile: source?.file ?? null,
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
  };
  try {
    const response = await fetch(result.url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "GildraRouteInventory/1.0" } });
    result.status = response.status;
    result.contentType = response.headers.get("content-type");
    result.location = response.headers.get("location");
    const body = await response.text();
    result.title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    result.h1 = firstNonEmptyTagText(body, "h1");
    result.htmlLang = body.match(/<html[^>]+lang=["']([^"']+)/i)?.[1] ?? null;
    result.canonical = body.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
      ?? body.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1]
      ?? null;
    result.noindex = /<meta[^>]+(?:name=["']robots["'][^>]+content=["'][^"']*noindex|content=["'][^"']*noindex[^>]+name=["']robots["'])/i.test(body);
    const visible = stripMarkup(body).slice(0, 40_000);
    result.soft404 = response.status === 200 && (/page not found|страница не найдена|дерево .{0,80} недоступно/i.test(visible) || /<h1[^>]*>[^<]*(?:not found|недоступ)/i.test(body));
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }));
  return results;
}

const routeResults = await mapConcurrent(expectedRoutes, 8, probe);

function csv(rows) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${columns.map(quote).join(",")}\n${rows.map((row) => columns.map((column) => quote(row[column])).join(",")).join("\n")}\n`;
}

const required = routeResults.filter((route) => !route.forbidden && phaseIncluded(route.phase));
function normalizeCanonical(value) {
  if (!value) return null;
  try {
    const url = new URL(value, routeManifest.siteOrigin);
    return `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return null;
  }
}

function routeIssues(route) {
  if (route.redirect) {
    return [
      ...(route.status !== route.expectedStatus ? [`status:${route.status ?? "none"}`] : []),
      ...(route.location !== route.expectedLocation ? [`location:${route.location ?? "none"}`] : []),
    ];
  }
  const issues = [];
  if (route.status !== route.expectedStatus) issues.push(`status:${route.status ?? "none"}`);
  if (route.soft404) issues.push("soft404");
  if (!route.sourceExists) issues.push("source-route-missing");
  if (!(route.contentType ?? "").includes(route.expectedContentType)) issues.push(`content-type:${route.contentType ?? "none"}`);
  if (route.expectedContentType === "text/html" && route.status === 200) {
    if (!route.title) issues.push("title-missing");
    if (!route.h1) issues.push("h1-missing");
    if (route.locale !== "neutral" && route.htmlLang !== route.locale) issues.push(`lang:${route.htmlLang ?? "missing"}`);
    if (route.indexable) {
      const expectedCanonical = normalizeCanonical(`${routeManifest.siteOrigin}${route.path}`);
      if (route.noindex) issues.push("unexpected-noindex");
      if (normalizeCanonical(route.canonical) !== expectedCanonical) issues.push(`canonical:${route.canonical ?? "missing"}`);
    } else if (!route.noindex) {
      issues.push("noindex-missing");
    }
  }
  return issues;
}

for (const route of routeResults) route.issues = routeIssues(route);
const violations = required.filter((route) => route.issues.length > 0);
const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  label,
  sourceRoutePatterns: sourceRoutes.length,
  sourcePagePatterns: sourcePages.length,
  expectedRoutes: routeResults.length,
  requiredRoutes: required.length,
  routeViolations: violations.length,
  redirectViolations: violations.filter((route) => route.redirect).length,
  completionReport: path.join(outputDir, `coverage-matrix-${label}.json`),
};

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDir, "source-route-inventory.json"), `${JSON.stringify(sourceRoutes, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, `route-inventory-${label}.json`), `${JSON.stringify({ summary, routes: routeResults, violations }, null, 2)}\n`),
  fs.writeFile(path.join(outputDir, `route-inventory-${label}.csv`), csv(routeResults)),
]);

console.log(JSON.stringify({ summary, violations: violations.map((route) => ({ path: route.path, phase: route.phase, sourceExists: route.sourceExists, status: route.status, location: route.location, expectedLocation: route.expectedLocation, soft404: route.soft404, contentType: route.contentType, issues: route.issues, error: route.error })) }, null, 2));
const completionResult = spawnSync(process.execPath, [
  path.join(root, "scripts/wow-completion-audit.mjs"),
  "--route-report", path.join(outputDir, `route-inventory-${label}.json`),
  "--label", label,
  "--output-dir", outputDir,
], { cwd: root, stdio: "inherit" });
if (completionResult.error) throw completionResult.error;
if (completionResult.status !== 0) process.exitCode = completionResult.status ?? 1;
if (strictPhase && violations.length) process.exitCode = 1;
