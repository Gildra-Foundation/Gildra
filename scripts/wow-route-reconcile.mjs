import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const reportDir = path.resolve(root, process.argv[2] ?? "docs/reports/wow");
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(reportDir, name), "utf8"));

const [worktree, production, coverage, productionCoverage] = await Promise.all([
  readJson("route-inventory-worktree.json"),
  readJson("route-inventory-production.json"),
  readJson("coverage-matrix-worktree.json"),
  readJson("coverage-matrix-production.json"),
]);

const routeKey = (route) => `${route.locale}:${route.path}`;
const productionByRoute = new Map(production.routes.map((route) => [routeKey(route), route]));
const comparable = (route) => ({
  status: route.status,
  location: route.location,
  soft404: route.soft404,
  contentType: route.contentType,
  title: route.title,
  htmlLang: route.htmlLang,
  canonical: route.canonical,
  noindex: route.noindex,
});

const mismatches = worktree.routes.flatMap((local) => {
  const live = productionByRoute.get(routeKey(local));
  if (!live) return [{ path: local.path, locale: local.locale, phase: local.phase, reason: "missing-production-inventory-row", worktree: comparable(local), production: null }];
  const localComparable = comparable(local);
  const liveComparable = comparable(live);
  const different = Object.keys(localComparable).some((key) => localComparable[key] !== liveComparable[key]);
  return different ? [{ path: local.path, locale: local.locale, phase: local.phase, reason: "response-contract-mismatch", worktree: localComparable, production: liveComparable }] : [];
});

function countBy(rows, key) {
  return Object.fromEntries([...new Set(rows.map((row) => row[key] ?? "unknown"))].sort().map((value) => [value, rows.filter((row) => (row[key] ?? "unknown") === value).length]));
}

const coverageFields = [
  "recordExists", "pageExists", "publishedEn", "publishedRu", "hasEn", "hasRu", "hasEnDescription", "hasRuDescription", "hasStrategy",
  "hasAbilitiesWithGameIds", "hasCorrectIconsProven", "hasCanonicalLoot", "dropChanceFidelity",
];
const coverageByType = Object.fromEntries(Object.keys(coverage.summary.byObjectType).sort().map((type) => {
  const rows = coverage.rows.filter((row) => row.objectType === type);
  return [type, {
    total: rows.length,
    ...Object.fromEntries(coverageFields.map((field) => [field, rows.filter((row) => row[field] === true).length])),
    abilityRows: rows.reduce((total, row) => total + (row.abilityRows ?? 0), 0),
    lootRows: rows.reduce((total, row) => total + (row.lootRows ?? 0), 0),
    automaticallyComplete: rows.filter((row) => row.automaticallyComplete === true).length,
  }];
}));

const result = {
  generatedAt: new Date().toISOString(),
  releaseBlocked: mismatches.length > 0,
  blockingReason: mismatches.length ? "Production and worktree response contracts differ." : null,
  worktree: worktree.summary,
  production: production.summary,
  violationsByPhase: {
    worktree: countBy(worktree.violations, "phase"),
    production: countBy(production.violations, "phase"),
  },
  coverage: {
    total: coverage.rows.length,
    automaticallyComplete: coverage.summary.automaticallyCompleteRows,
    releaseCompletenessProven: coverage.summary.releaseCompletenessProven,
    productionAutomaticallyComplete: productionCoverage.summary.automaticallyCompleteRows,
    productionReleaseCompletenessProven: productionCoverage.summary.releaseCompletenessProven,
    blockerCounts: coverage.summary.blockerCounts,
    byObjectType: coverageByType,
  },
  mismatchCount: mismatches.length,
  mismatches,
};

const table = Object.entries(coverageByType).map(([type, item]) => `| ${type} | ${item.total} | ${item.recordExists} | ${item.pageExists} | ${item.publishedEn}/${item.publishedRu} | ${item.hasEn}/${item.hasRu} | ${item.hasEnDescription}/${item.hasRuDescription} | ${item.hasStrategy} | ${item.abilityRows} | ${item.hasAbilitiesWithGameIds} | ${item.hasCorrectIconsProven} | ${item.lootRows} | ${item.hasCanonicalLoot} | ${item.dropChanceFidelity} | ${item.automaticallyComplete} |`).join("\n");
const topBlockers = Object.entries(coverage.summary.blockerCounts).slice(0, 20).map(([blocker, count]) => `- ${blocker}: ${count}`).join("\n");
const markdown = `# WoW production/worktree reconciliation\n\nGenerated: ${result.generatedAt}\n\nRelease status: **${result.releaseBlocked ? "BLOCKED" : "PASS"}**\n\n- Expected URL checks: ${worktree.summary.expectedRoutes}\n- Worktree violations: ${worktree.summary.routeViolations}\n- Production violations: ${production.summary.routeViolations}\n- Production/worktree response mismatches: ${mismatches.length}\n- Coverage rows automatically complete: ${result.coverage.automaticallyComplete}/${result.coverage.total}\n- Release completeness proven: ${result.coverage.releaseCompletenessProven}\n\n## Violations by phase\n\n- Worktree: ${JSON.stringify(result.violationsByPhase.worktree)}\n- Production: ${JSON.stringify(result.violationsByPhase.production)}\n\n## Coverage by object type\n\n| Object | Total | Record | Page | Published EN/RU | Name EN/RU | Description EN/RU | Strategy | Ability rows | Complete ability set | Icons proven | Loot rows | Loot complete | Chance evidence | Complete |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${table}\n\n## Top completion blockers\n\n${topBlockers || "- None"}\n\nEvery mismatch remains a release blocker. Completeness is proven only by the type-aware DoD matrix; route health alone is insufficient. See the JSON report for route-level and requirement-level evidence.\n`;

await Promise.all([
  fs.writeFile(path.join(reportDir, "production-worktree-reconciliation.json"), `${JSON.stringify(result, null, 2)}\n`),
  fs.writeFile(path.join(reportDir, "production-worktree-reconciliation.md"), markdown),
]);

console.log(JSON.stringify({ releaseBlocked: result.releaseBlocked, mismatchCount: result.mismatchCount, coverage: result.coverage, violationsByPhase: result.violationsByPhase }, null, 2));
if (result.releaseBlocked) process.exitCode = 1;
