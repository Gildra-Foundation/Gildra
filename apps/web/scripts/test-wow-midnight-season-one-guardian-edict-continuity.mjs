import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const script = path.join(root, "scripts/audit-wow-midnight-season-one-guardian-edict-continuity.mjs");
const canonicalAuditPath = path.join(root, "data/wow/midnight-season-one-guardian-edict-continuity.json");
const audit = JSON.parse(await fs.readFile(canonicalAuditPath, "utf8"));
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "gildra-guardian-edict-continuity-test-"));

function run(auditPath, reportPath) {
  return spawnSync(process.execPath, [script, `--audit=${auditPath}`, `--report=${reportPath}`, "--strict"], {
    cwd: root, encoding: "utf8", env: process.env,
  });
}

function assert(condition, message, result = null) {
  if (condition) return;
  if (result) process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  throw new Error(message);
}

async function writeAudit(name, value) {
  const target = path.join(temporaryDirectory, name);
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
  return target;
}

try {
  const reportPath = path.join(temporaryDirectory, "report.json");
  const valid = run(canonicalAuditPath, reportPath);
  assert(valid.status === 0, "Canonical Guardian's Edict continuity audit must pass", valid);

  const promoted = structuredClone(audit);
  promoted.publicationSafe = true;
  promoted.promotionAllowed = true;
  const promotedResult = run(await writeAudit("promoted.json", promoted), reportPath);
  assert(promotedResult.status !== 0, "Conflicting build-unpinned evidence must not be promoted", promotedResult);
  let report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.includes("unsafe-publication-state"), "Unsafe publication violation was not reported");

  const nonConsecutive = structuredClone(audit);
  nonConsecutive.buildWindow.builds.splice(1, 0, { version: "12.1.0.69700" });
  const nonConsecutiveResult = run(await writeAudit("non-consecutive.json", nonConsecutive), reportPath);
  assert(nonConsecutiveResult.status !== 0, "Intervening Retail build must invalidate continuity", nonConsecutiveResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.includes("retail-builds-not-consecutive") || report.violations.includes("retail-build-order-invalid"),
    "Non-consecutive build violation was not reported");

  const missingConflict = structuredClone(audit);
  missingConflict.conflicts.guideEffectPercentDiffersFromCurrentRenderer = false;
  const missingConflictResult = run(await writeAudit("missing-conflict.json", missingConflict), reportPath);
  assert(missingConflictResult.status !== 0, "Same-ID rendered source conflict must remain explicit", missingConflictResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.includes("required-render-conflict-missing"), "Missing conflict violation was not reported");

  const lfrFallbackInvented = structuredClone(audit);
  lfrFallbackInvented.renderedEvidence.wowhead.en.find((row) => row.difficultyId === 17).durationText = "30 sec";
  const lfrFallbackResult = run(await writeAudit("lfr-fallback-invented.json", lfrFallbackInvented), reportPath);
  assert(lfrFallbackResult.status !== 0, "Invented LFR duration fallback must fail closed", lfrFallbackResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.includes("lfr-render-invalid") || report.violations.includes("rendered-source-index-drift:wowhead_en"),
    "LFR fallback violation was not reported");

  const sourceDrift = structuredClone(audit);
  sourceDrift.sources.find((source) => source.semanticKind === "spell_effect").exactRowsSha256 = "0".repeat(64);
  const sourceDriftResult = run(await writeAudit("source-drift.json", sourceDrift), reportPath);
  assert(sourceDriftResult.status !== 0, "Pinned DB2 source index drift must fail closed", sourceDriftResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.startsWith("db2-source-index-drift")), "DB2 source drift violation was not reported");

  process.stdout.write("test: Guardian's Edict continuity audit fails closed for promotion, intervening builds, hidden conflicts, invented LFR fallback, and source drift\n");
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
