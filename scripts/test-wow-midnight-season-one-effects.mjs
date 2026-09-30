import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const script = path.join(root, "scripts/audit-wow-midnight-season-one-effects.mjs");
const descriptionAuditPath = path.join(root, "data/wow/midnight-season-one-description-audit.json");
const canonicalAuditPath = path.join(root, "data/wow/midnight-season-one-effect-audit.json");
const audit = JSON.parse(await fs.readFile(canonicalAuditPath, "utf8"));
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "gildra-season-one-effect-test-"));

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
  const baseArguments = [`--description-audit=${descriptionAuditPath}`, `--report=${reportPath}`, "--strict"];
  const validResult = run([...baseArguments, `--audit=${canonicalAuditPath}`]);
  assert(validResult.status === 0, "Canonical Season 1 effect audit must pass offline validation", validResult);

  const missingEvidenceAudit = structuredClone(audit);
  missingEvidenceAudit.evidence.pop();
  const missingEvidencePath = await writeAudit("missing-evidence.json", missingEvidenceAudit);
  const missingEvidenceResult = run([...baseArguments, `--audit=${missingEvidencePath}`]);
  assert(missingEvidenceResult.status !== 0, "Missing numeric-token evidence must fail closed", missingEvidenceResult);
  let report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.startsWith("evidence-array-count-invalid") || issue.startsWith("effect-evidence-missing")),
    "Missing evidence violation was not reported");

  const unsafeIndexAudit = structuredClone(audit);
  const unresolved = unsafeIndexAudit.evidence.find((record) => record.indexResolution === "client_index_zero_unresolved"
    || record.indexResolution === "implicit_client_index_unresolved");
  assert(unresolved, "An unresolved client-index fixture is required");
  unresolved.classification = "static_metadata";
  unresolved.metadataComplete = true;
  unresolved.publicationSafe = true;
  unresolved.independentlyRendered = true;
  unresolved.effectIndex = 0;
  const unsafeIndexPath = await writeAudit("unsafe-index-promotion.json", unsafeIndexAudit);
  const unsafeIndexResult = run([...baseArguments, `--audit=${unsafeIndexPath}`]);
  assert(unsafeIndexResult.status !== 0, "Unresolved client-index semantics must not be promoted", unsafeIndexResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.startsWith("unsafe-effect-publication-state")
    || issue.startsWith("unresolved-client-index-promoted") || issue.startsWith("effect-index-mismatch")),
  "Unsafe client-index promotion violation was not reported");

  const missingDifficultyLocaleAudit = structuredClone(audit);
  missingDifficultyLocaleAudit.sources = missingDifficultyLocaleAudit.sources.filter((source) => source.kind !== "difficulty_ru");
  const missingDifficultyLocalePath = await writeAudit("missing-difficulty-locale.json", missingDifficultyLocaleAudit);
  const missingDifficultyLocaleResult = run([...baseArguments, `--audit=${missingDifficultyLocalePath}`]);
  assert(missingDifficultyLocaleResult.status !== 0, "Missing RU Difficulty evidence must fail closed", missingDifficultyLocaleResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.includes("source-evidence-invalid:difficulty_ru"), "Missing Difficulty locale violation was not reported");

  const sourceDirectory = path.join(temporaryDirectory, "drifted-sources");
  await fs.mkdir(sourceDirectory);
  await fs.writeFile(path.join(sourceDirectory, "SpellEffect-enUS.csv"), "ID,SpellID,EffectIndex\n");
  const sourceDriftResult = run([...baseArguments, `--audit=${canonicalAuditPath}`, `--input-dir=${sourceDirectory}`]);
  assert(sourceDriftResult.status !== 0, "Changed exact-build source bytes must fail closed", sourceDriftResult);
  assert(sourceDriftResult.stderr.includes("spell_effect source evidence drift"), "Source drift was not reported", sourceDriftResult);

  process.stdout.write("test: Midnight Season 1 effect audit fails closed for missing evidence, unresolved client indices, locale loss, and source drift\n");
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
