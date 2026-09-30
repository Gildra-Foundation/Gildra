import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "gildra-completion-test-"));
const validator = path.join(root, "scripts/validate-wow-content-manifest.mjs");
const completionAudit = path.join(root, "scripts/wow-completion-audit.mjs");
const manifest = JSON.parse(await fs.readFile(path.join(root, "data/wow/content-manifest.json"), "utf8"));
const contract = JSON.parse(await fs.readFile(path.join(root, "data/wow/completion-contract.json"), "utf8"));

function run(script, arguments_) {
  return spawnSync(process.execPath, [script, ...arguments_], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

function assert(condition, message, result = null) {
  if (condition) return;
  if (result) process.stderr.write(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  throw new Error(message);
}

try {
  const manifestPath = path.join(temporaryDirectory, "manifest.json");
  const contractPath = path.join(temporaryDirectory, "contract.json");
  const reportPath = path.join(temporaryDirectory, "validation.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`);

  const validResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(validResult.status === 0, "Current manifest and completion contract must validate", validResult);

  const unsupportedContract = structuredClone(contract);
  unsupportedContract.entityRequirements.edition.push("unimplemented.requirement");
  await fs.writeFile(contractPath, `${JSON.stringify(unsupportedContract, null, 2)}\n`);
  const unsupportedResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(unsupportedResult.status !== 0, "Unsupported DoD requirements must fail closed", unsupportedResult);
  const unsupportedReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(unsupportedReport.violations.some((violation) => violation.issue.includes("requirement-unsupported")), "Unsupported requirement violation was not reported");

  const invalidMechanicManifest = structuredClone(manifest);
  invalidMechanicManifest.abilities[0].mechanicTags = ["INVENTED_TAG"];
  await fs.writeFile(manifestPath, `${JSON.stringify(invalidMechanicManifest, null, 2)}\n`);
  await fs.writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`);
  const invalidMechanicResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(invalidMechanicResult.status !== 0, "Unknown mechanic tags must fail validation", invalidMechanicResult);
  const invalidMechanicReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(invalidMechanicReport.violations.some((violation) => violation.issue === "mechanicTags-invalid"), "Invalid mechanic tag violation was not reported");

  const missingVariantContractManifest = structuredClone(manifest);
  delete missingVariantContractManifest.abilities[0].descriptionVariantStatus;
  await fs.writeFile(manifestPath, `${JSON.stringify(missingVariantContractManifest, null, 2)}\n`);
  const missingVariantContractResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(missingVariantContractResult.status !== 0, "Missing ability description-variant status must fail validation", missingVariantContractResult);
  const missingVariantContractReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(missingVariantContractReport.violations.some((violation) => violation.issue === "description-variant-status-invalid"), "Missing variant status violation was not reported");

  const unknownAbilityIndex = 0;
  const leakedUnknownDescriptionManifest = structuredClone(manifest);
  leakedUnknownDescriptionManifest.abilities[unknownAbilityIndex].descriptionVariantStatus = "unknown";
  leakedUnknownDescriptionManifest.abilities[unknownAbilityIndex].descriptionVariants = [];
  leakedUnknownDescriptionManifest.abilities[unknownAbilityIndex].descriptionVariantEvidence = null;
  leakedUnknownDescriptionManifest.abilities[unknownAbilityIndex].descriptionVerificationStatus = "withheld_unverified_source";
  leakedUnknownDescriptionManifest.abilities[unknownAbilityIndex].descriptions = { en: null, ru: null };
  leakedUnknownDescriptionManifest.abilities[unknownAbilityIndex].descriptions.en = "Unverified catalog-rendered fallback.";
  await fs.writeFile(manifestPath, `${JSON.stringify(leakedUnknownDescriptionManifest, null, 2)}\n`);
  const leakedUnknownDescriptionResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(leakedUnknownDescriptionResult.status !== 0, "Unknown description variants must not expose unverified catalog-rendered text", leakedUnknownDescriptionResult);
  const leakedUnknownDescriptionReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(leakedUnknownDescriptionReport.violations.some((violation) => violation.issue === "unknown-description-variant-not-fail-closed"), "Leaked unknown description violation was not reported");

  const requiredAbilityIndex = manifest.abilities.findIndex((ability) => ability.descriptionVariantStatus === "required_unverified");
  assert(requiredAbilityIndex >= 0, "A required-unverified ability fixture is required");
  const requiredAbility = manifest.abilities[requiredAbilityIndex];
  const validVariantFixture = (overrides = {}) => ({
    variantKey: `${requiredAbility.build}:difficulty-14:group-30`,
    difficultyId: 14,
    difficultySlug: "normal",
    groupSize: 30,
    contentTuningId: null,
    build: requiredAbility.build,
    patch: requiredAbility.patch,
    season: requiredAbility.season,
    descriptions: { en: "Verified fixture description.", ru: "Проверенное тестовое описание." },
    verificationStatus: "verified",
    sourceKind: "verified_database",
    sourceUrls: {
      en: "https://wago.tools/db2/Spell/csv?build=12.1.0.69814&locale=enUS",
      ru: "https://wago.tools/db2/Spell/csv?build=12.1.0.69814&locale=ruRU",
      renderer: "https://www.wowhead.com/spell=1285647/dreadmarch",
    },
    lastVerifiedAt: "2026-09-13T10:02:02.670Z",
    renderedEvidence: {
      sourceSpellId: 1285647,
      terminalSpellId: 1297445,
      descriptionSha256: { en: "a".repeat(64), ru: "b".repeat(64) },
      directSpellLink: true,
      renderedValues: [],
    },
    ...overrides,
  });

  const invalidDifficultyManifest = structuredClone(manifest);
  invalidDifficultyManifest.abilities[requiredAbilityIndex].descriptionVariantStatus = "verified";
  invalidDifficultyManifest.abilities[requiredAbilityIndex].descriptionVariants = [validVariantFixture({
    variantKey: `${requiredAbility.build}:difficulty-999:group-30`,
    difficultyId: 999,
  })];
  await fs.writeFile(manifestPath, `${JSON.stringify(invalidDifficultyManifest, null, 2)}\n`);
  const invalidDifficultyResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(invalidDifficultyResult.status !== 0, "Unregistered description difficulty must fail validation", invalidDifficultyResult);
  const invalidDifficultyReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(invalidDifficultyReport.violations.some((violation) => violation.issue.startsWith("description-variant-context-invalid")), "Invalid description difficulty violation was not reported");

  const missingVariantProvenanceManifest = structuredClone(manifest);
  missingVariantProvenanceManifest.abilities[requiredAbilityIndex].descriptionVariantStatus = "verified";
  missingVariantProvenanceManifest.abilities[requiredAbilityIndex].descriptionVariants = [validVariantFixture({
    sourceUrls: {
      en: "https://wago.tools/db2/Spell/csv?build=12.1.0.69814&locale=enUS",
      ru: null,
      renderer: "https://www.wowhead.com/spell=1285647/dreadmarch",
    },
  })];
  await fs.writeFile(manifestPath, `${JSON.stringify(missingVariantProvenanceManifest, null, 2)}\n`);
  const missingVariantProvenanceResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(missingVariantProvenanceResult.status !== 0, "Verified description variant without EN/RU provenance must fail validation", missingVariantProvenanceResult);
  const missingVariantProvenanceReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(missingVariantProvenanceReport.violations.some((violation) => violation.issue.startsWith("description-variant-publication-invalid")), "Missing description variant provenance violation was not reported");

  const unresolvedVariantManifest = structuredClone(manifest);
  unresolvedVariantManifest.abilities[requiredAbilityIndex].descriptionVariantStatus = "verified";
  unresolvedVariantManifest.abilities[requiredAbilityIndex].descriptionVariants = [validVariantFixture({
    descriptions: { en: "Deals $s1 damage.", ru: "Наносит $s1 ед. урона." },
  })];
  await fs.writeFile(manifestPath, `${JSON.stringify(unresolvedVariantManifest, null, 2)}\n`);
  const unresolvedVariantResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(unresolvedVariantResult.status !== 0, "Unresolved client tokens in a verified description variant must fail validation", unresolvedVariantResult);
  const unresolvedVariantReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(unresolvedVariantReport.violations.some((violation) => violation.issue.startsWith("description-variant-publication-invalid")), "Unresolved description variant violation was not reported");

  const leakedWithheldDescriptionManifest = structuredClone(manifest);
  leakedWithheldDescriptionManifest.abilities[requiredAbilityIndex].descriptions.en = "Unverified fallback.";
  await fs.writeFile(manifestPath, `${JSON.stringify(leakedWithheldDescriptionManifest, null, 2)}\n`);
  const leakedWithheldDescriptionResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(leakedWithheldDescriptionResult.status !== 0, "Required-unverified descriptions must remain null", leakedWithheldDescriptionResult);
  const leakedWithheldDescriptionReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(leakedWithheldDescriptionReport.violations.some((violation) => violation.issue === "required-description-variant-not-fail-closed"), "Leaked withheld description violation was not reported");

  const mixedVersionManifest = structuredClone(manifest);
  mixedVersionManifest.abilities[0].season = "midnight-season-2";
  await fs.writeFile(manifestPath, `${JSON.stringify(mixedVersionManifest, null, 2)}\n`);
  const mixedVersionResult = run(validator, [
    "--manifest", manifestPath,
    "--contract", contractPath,
    "--output", reportPath,
    "--strict",
  ]);
  assert(mixedVersionResult.status !== 0, "Parent/child patch-season mixing must fail validation", mixedVersionResult);
  const mixedVersionReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(mixedVersionReport.violations.some((violation) => violation.issue === "parent-version-context-mismatch"), "Parent version mismatch was not reported");

  const completionOutput = path.join(temporaryDirectory, "completion");
  const incompleteResult = run(completionAudit, [
    "--route-report", path.join(root, "docs/reports/wow/route-inventory-worktree.json"),
    "--label", "negative-fixture",
    "--output-dir", completionOutput,
    "--require-complete",
  ]);
  assert(incompleteResult.status !== 0, "Incomplete coverage must fail --require-complete", incompleteResult);
  const completionReport = JSON.parse(await fs.readFile(path.join(completionOutput, "coverage-matrix-negative-fixture.json"), "utf8"));
  assert(completionReport.summary.releaseCompletenessProven === false, "Incomplete coverage was incorrectly marked proven");
  assert(completionReport.summary.coverageRows === 210, "Expected inventory must include 210 current/declared objects, including 11 exact-build Journal phase headings");
  assert(completionReport.summary.automaticallyCompleteRows === 1, "Only the verified Venomous Abyss instance identity currently satisfies its full DoD contract");
  assert(completionReport.summary.blockerCounts["ability.descriptionVariants"] === 53, "DoD must expose 53 abilities without proven description-variant coverage");
  assert(completionReport.summary.blockerCounts["ability.descriptionVariants.status:required_unverified"] === 53, "DoD must expose all 53 required-unverified descriptions");
  assert((completionReport.summary.blockerCounts["ability.descriptionVariants.status:unknown"] ?? 0) === 0, "Every recorded ability must now have explicit variant evidence");
  assert(completionReport.rows.filter((row) => row.objectType === "ability" && row.hasDescriptionVariantCoverage).length === 16, "Exactly 16 abilities currently prove that difficulty variants are not required");

  process.stdout.write("test: WoW completion contract fails closed for unsupported checks, invalid mechanic tags, unverified description leakage, invalid description variants, mixed versions, and incomplete coverage\n");
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
