import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const script = path.join(root, "scripts/audit-wow-midnight-season-one-descriptions.mjs");
const manifestPath = path.join(root, "data/wow/content-manifest.json");
const canonicalAuditPath = path.join(root, "data/wow/midnight-season-one-description-audit.json");
const audit = JSON.parse(await fs.readFile(canonicalAuditPath, "utf8"));
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "gildra-season-one-description-test-"));

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
  const validResult = run([
    `--manifest=${manifestPath}`,
    `--audit=${canonicalAuditPath}`,
    `--report=${reportPath}`,
    "--strict",
  ]);
  assert(validResult.status === 0, "Canonical Season 1 description audit must pass offline validation", validResult);

  const missingLocaleAudit = structuredClone(audit);
  const safeAbility = missingLocaleAudit.abilities.find((ability) => ability.publicationSafe);
  assert(safeAbility, "A publication-safe fixture is required");
  safeAbility.source.ru.description = null;
  safeAbility.source.ru.descriptionSha256 = null;
  const missingLocalePath = await writeAudit("missing-locale.json", missingLocaleAudit);
  const missingLocaleResult = run([
    `--manifest=${manifestPath}`,
    `--audit=${missingLocalePath}`,
    `--report=${reportPath}`,
    "--strict",
  ]);
  assert(missingLocaleResult.status !== 0, "Missing RU source evidence must fail closed", missingLocaleResult);
  let report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.includes("ability-description-evidence-invalid")), "Missing locale violation was not reported");

  const unsafePromotionAudit = structuredClone(audit);
  const withheldAbility = unsafePromotionAudit.abilities.find((ability) => !ability.publicationSafe);
  assert(withheldAbility, "A withheld fixture is required");
  withheldAbility.publicationSafe = true;
  withheldAbility.proposedVariantStatus = "not_required_verified";
  withheldAbility.requiredBy = [];
  withheldAbility.blockers = [];
  const unsafePromotionPath = await writeAudit("unsafe-promotion.json", unsafePromotionAudit);
  const unsafePromotionResult = run([
    `--manifest=${manifestPath}`,
    `--audit=${unsafePromotionPath}`,
    `--report=${reportPath}`,
    "--strict",
  ]);
  assert(unsafePromotionResult.status !== 0, "Tokenized text must not be promoted by changing its verdict fields", unsafePromotionResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.some((issue) => issue.includes("ability-publication-safe-evidence-invalid")), "Unsafe promotion violation was not reported");

  const sourceDirectory = path.join(temporaryDirectory, "drifted-sources");
  await fs.mkdir(sourceDirectory);
  const emptySources = {
    "Spell-enUS.csv": "ID,NameSubtext_lang,Description_lang,AuraDescription_lang\n",
    "Spell-ruRU.csv": "ID,NameSubtext_lang,Description_lang,AuraDescription_lang\n",
    "JournalEncounterSection-enUS.csv": "ID,Title_lang,BodyText_lang,JournalEncounterID,OrderIndex,ParentSectionID,FirstChildSectionID,NextSiblingSectionID,Type,IconCreatureDisplayInfoID,UiModelSceneID,SpellID,IconFileDataID,Flags,IconFlags,DifficultyMask\n",
    "JournalEncounterSection-ruRU.csv": "ID,Title_lang,BodyText_lang,JournalEncounterID,OrderIndex,ParentSectionID,FirstChildSectionID,NextSiblingSectionID,Type,IconCreatureDisplayInfoID,UiModelSceneID,SpellID,IconFileDataID,Flags,IconFlags,DifficultyMask\n",
    "SpellName-enUS.csv": "ID,Name_lang\n",
    "SpellName-ruRU.csv": "ID,Name_lang\n",
  };
  await Promise.all(Object.entries(emptySources).map(([name, contents]) => fs.writeFile(path.join(sourceDirectory, name), contents)));
  const sourceDriftResult = run([
    `--manifest=${manifestPath}`,
    `--audit=${canonicalAuditPath}`,
    `--report=${reportPath}`,
    `--input-dir=${sourceDirectory}`,
    "--strict",
  ]);
  assert(sourceDriftResult.status !== 0, "Changed source bytes must fail the online comparison", sourceDriftResult);
  report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  assert(report.violations.includes("online-source-evidence-drift"), "Source drift violation was not reported");

  process.stdout.write("test: Midnight Season 1 description audit fails closed for locale loss, unsafe promotion, and source drift\n");
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
