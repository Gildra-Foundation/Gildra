import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const script = path.join(root, "scripts/rank-wow-midnight-season-one-description-candidates.mjs");
const descriptionAuditPath = path.join(root, "data/wow/midnight-season-one-description-audit.json");
const effectAuditPath = path.join(root, "data/wow/midnight-season-one-effect-audit.json");
const canonicalAuditPath = path.join(root, "data/wow/midnight-season-one-description-candidate-ranking.json");
const audit = JSON.parse(await fs.readFile(canonicalAuditPath, "utf8"));
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "gildra-season-one-candidate-test-"));

function run(arguments_) {
  return spawnSync(process.execPath, [script, ...arguments_], { cwd: root, encoding: "utf8", env: process.env });
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
  const baseArguments = [
    `--description-audit=${descriptionAuditPath}`,
    `--effect-audit=${effectAuditPath}`,
    `--report=${reportPath}`,
    "--strict",
  ];
  const validResult = run([...baseArguments, `--audit=${canonicalAuditPath}`]);
  assert(validResult.status === 0, "Canonical Season 1 candidate audit must pass offline validation", validResult);

  const unsafePromotion = structuredClone(audit);
  unsafePromotion.candidates[0].publicationSafe = true;
  unsafePromotion.candidates[0].promotionAllowed = true;
  unsafePromotion.summary.promotionAllowedAbilities = 1;
  const unsafePromotionPath = await writeAudit("unsafe-promotion.json", unsafePromotion);
  const unsafePromotionResult = run([...baseArguments, `--audit=${unsafePromotionPath}`]);
  assert(unsafePromotionResult.status !== 0, "Build-unpinned rendered evidence must not promote a description", unsafePromotionResult);
  let report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.startsWith("promotion-count-invalid") || issue.startsWith("candidate-overclaimed")),
    "Unsafe promotion violation was not reported");

  const missingRussian = structuredClone(audit);
  delete missingRussian.candidates[0].localizedRenders.ru;
  const missingRussianPath = await writeAudit("missing-russian.json", missingRussian);
  const missingRussianResult = run([...baseArguments, `--audit=${missingRussianPath}`]);
  assert(missingRussianResult.status !== 0, "Missing RU rendered evidence must fail closed", missingRussianResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.includes(`:${missingRussian.candidates[0].spellId}:ru`)
    || issue.startsWith("spell-source-index-drift")), "Missing RU render violation was not reported");

  const falseBuildContinuity = structuredClone(audit);
  falseBuildContinuity.candidates[0].localizedRenders.en.exactBuildExposed = true;
  falseBuildContinuity.sources.find((source) => source.kind === `rendered_spell_${falseBuildContinuity.candidates[0].spellId}_en`).exactBuildExposed = true;
  const falseBuildPath = await writeAudit("false-build-continuity.json", falseBuildContinuity);
  const falseBuildResult = run([...baseArguments, `--audit=${falseBuildPath}`]);
  assert(falseBuildResult.status !== 0, "Unproven exact-build continuity must fail closed", falseBuildResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.startsWith("exact-build-overclaimed")
    || issue.startsWith("source-exact-build-overclaimed")), "Exact-build overclaim violation was not reported");

  const sourceIndexDrift = structuredClone(audit);
  const tooltipSource = sourceIndexDrift.sources.find((source) => source.kind.startsWith("rendered_spell_"));
  tooltipSource.normalizedDifficultyTooltipIndexSha256 = "0".repeat(64);
  const sourceIndexDriftPath = await writeAudit("source-index-drift.json", sourceIndexDrift);
  const sourceIndexDriftResult = run([...baseArguments, `--audit=${sourceIndexDriftPath}`]);
  assert(sourceIndexDriftResult.status !== 0, "Pinned rendered source index drift must fail closed", sourceIndexDriftResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.startsWith("spell-source-index-drift")),
    "Rendered source index drift violation was not reported");

  process.stdout.write("test: Midnight Season 1 candidate audit fails closed for promotion, RU evidence loss, exact-build overclaim, and source index drift\n");
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
