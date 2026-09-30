import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const online = process.argv.includes("--online");
const audit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-source-audit.json"), "utf8"));
const descriptionAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-description-audit.json"), "utf8"));
const tokenAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-token-audit.json"), "utf8"));
const journalTreeAudit = JSON.parse(await fs.readFile(path.join(root, "data/wow/venomous-abyss-journal-tree-audit.json"), "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(root, "data/wow/content-manifest.json"), "utf8"));
const bossPageSource = await fs.readFile(path.join(root, "components/wow/raid/VenomousBossPage.tsx"), "utf8");
const raidPageSource = await fs.readFile(path.join(root, "components/wow/raid/VenomousAbyssPage.tsx"), "utf8");
const issues = [];
const check = (condition, issue) => { if (!condition) issues.push(issue); };
const positiveInteger = (value) => Number.isInteger(value) && value > 0;
const sourceByUrl = new Map(manifest.sources.map((source) => [source.url, source]));
const descriptionEvidenceBySpellId = new Map(descriptionAudit.abilities.map((ability) => [ability.spellId, ability]));

check(audit.schemaVersion === 1, "audit-schema-version-invalid");
check(/^12\.1\.0\.\d+$/.test(audit.gameBuild), "audit-build-invalid");
check(Number.isFinite(Date.parse(audit.lastVerifiedAt)), "audit-last-verified-invalid");
check(audit.instance?.journalInstanceId === 1320, "instance-journal-id-invalid");
check(audit.encounters?.length === 8, "encounter-count-not-eight");

const auditEncounterIds = new Set();
const auditSpellIds = new Set();
for (const [index, encounter] of (audit.encounters ?? []).entries()) {
  check(encounter.order === index + 1, `encounter-order-invalid:${encounter.canonicalSlug}`);
  check(positiveInteger(encounter.journalEncounterId), `encounter-id-invalid:${encounter.canonicalSlug}`);
  check(!auditEncounterIds.has(encounter.journalEncounterId), `encounter-id-duplicate:${encounter.journalEncounterId}`);
  auditEncounterIds.add(encounter.journalEncounterId);
  check(positiveInteger(encounter.dungeonEncounterId), `dungeon-encounter-id-invalid:${encounter.canonicalSlug}`);
  check(positiveInteger(encounter.firstSectionId), `first-section-id-invalid:${encounter.canonicalSlug}`);
  check(Boolean(encounter.names?.en && encounter.names?.ru), `encounter-name-localization-missing:${encounter.canonicalSlug}`);
  check(Boolean(encounter.descriptions?.en && encounter.descriptions?.ru), `encounter-description-localization-missing:${encounter.canonicalSlug}`);
  check(encounter.overviewAbilities?.length > 0, `overview-abilities-empty:${encounter.canonicalSlug}`);
  for (const ability of encounter.overviewAbilities ?? []) {
    check(positiveInteger(ability.spellId), `spell-id-invalid:${encounter.canonicalSlug}`);
    check(!auditSpellIds.has(ability.spellId), `spell-id-duplicate:${ability.spellId}`);
    auditSpellIds.add(ability.spellId);
    check(positiveInteger(ability.iconId), `icon-id-invalid:${ability.spellId}`);
    check(Boolean(ability.names?.en && ability.names?.ru), `spell-name-localization-missing:${ability.spellId}`);
  }
}
check(auditSpellIds.size === 37, `overview-spell-count-invalid:${auditSpellIds.size}`);
check(descriptionAudit.gameBuild === audit.gameBuild, "description-audit-build-mismatch");
check(descriptionAudit.summary?.expectedAbilities === 37, "description-audit-coverage-invalid");
check(descriptionAudit.summary?.publicationSafeAbilities === 12, "description-audit-safe-count-invalid");
check(descriptionAudit.summary?.withheldAbilities === 25, "description-audit-withheld-count-invalid");
check(tokenAudit.gameBuild === audit.gameBuild, "token-audit-build-mismatch");
check(tokenAudit.summary?.abilities === 37, "token-audit-coverage-invalid");
check(tokenAudit.summary?.publicationSafeAbilities === 12, "token-audit-safe-count-invalid");
check(tokenAudit.summary?.withheldAbilities === 25, "token-audit-withheld-count-invalid");
check(tokenAudit.summary?.referenceCycles === 0, "token-audit-reference-cycle");
check(tokenAudit.summary?.missingReferenceTargets === 0, "token-audit-missing-reference-target");
check(journalTreeAudit.gameBuild === audit.gameBuild, "journal-tree-audit-build-mismatch");
check(journalTreeAudit.summary?.sectionRowsPerLocale === 649, "journal-tree-row-count-invalid");
check(journalTreeAudit.summary?.explicitPhaseCandidates === 11, "journal-tree-phase-count-invalid");

const instance = manifest.instances.find((row) => row.canonicalSlug === "venomous-abyss");
check(Boolean(instance), "manifest-instance-missing");
if (instance) {
  check(instance.build === audit.gameBuild, "manifest-instance-build-mismatch");
  check(instance.refs?.journalId === audit.instance.journalInstanceId, "manifest-instance-journal-id-mismatch");
  check(instance.encounterCount === 8 && instance.encounterCoverageStatus === "complete", "manifest-instance-coverage-not-proven");
  check(JSON.stringify(instance.names) === JSON.stringify(audit.instance.names), "manifest-instance-names-mismatch");
  check(JSON.stringify(instance.descriptions) === JSON.stringify(audit.instance.descriptions), "manifest-instance-descriptions-mismatch");
}

for (const expected of audit.encounters ?? []) {
  const encounter = manifest.encounters.find((row) => row.instance === "venomous-abyss" && row.canonicalSlug === expected.canonicalSlug);
  check(Boolean(encounter), `manifest-encounter-missing:${expected.canonicalSlug}`);
  if (!encounter) continue;
  check(encounter.build === audit.gameBuild, `manifest-encounter-build-mismatch:${expected.canonicalSlug}`);
  check(encounter.refs?.encounterId === expected.journalEncounterId, `manifest-encounter-id-mismatch:${expected.canonicalSlug}`);
  check(encounter.refs?.journalId === audit.instance.journalInstanceId, `manifest-journal-id-mismatch:${expected.canonicalSlug}`);
  check(encounter.dungeonEncounterId === expected.dungeonEncounterId, `manifest-dungeon-encounter-id-mismatch:${expected.canonicalSlug}`);
  check(encounter.firstSectionId === expected.firstSectionId, `manifest-first-section-id-mismatch:${expected.canonicalSlug}`);
  check(encounter.order === expected.order, `manifest-order-mismatch:${expected.canonicalSlug}`);
  check(JSON.stringify(encounter.names) === JSON.stringify(expected.names), `manifest-encounter-names-mismatch:${expected.canonicalSlug}`);
  check(JSON.stringify(encounter.descriptions) === JSON.stringify(expected.descriptions), `manifest-encounter-descriptions-mismatch:${expected.canonicalSlug}`);
  check(encounter.verificationStatus === "verified", `manifest-identity-status-invalid:${expected.canonicalSlug}`);
  check(encounter.strategyVerificationStatus === "source_tracked", `strategy-status-not-source-tracked:${expected.canonicalSlug}`);
  check(encounter.abilityCoverageStatus === "overview_only", `ability-coverage-overclaimed:${expected.canonicalSlug}`);
  for (const expectedAbility of expected.overviewAbilities ?? []) {
    const ability = manifest.abilities.find((row) => row.refs?.spellId === expectedAbility.spellId);
    check(Boolean(ability), `manifest-ability-missing:${expectedAbility.spellId}`);
    if (!ability) continue;
    check(ability.parentId === encounter.id, `manifest-ability-parent-mismatch:${expectedAbility.spellId}`);
    check(ability.build === audit.gameBuild && ability.patch === "12.1" && ability.season === "midnight-season-2" && ability.status === "live", `manifest-ability-version-mismatch:${expectedAbility.spellId}`);
    check(ability.refs?.encounterId === expected.journalEncounterId && ability.refs?.journalId === 1320, `manifest-ability-encounter-refs-mismatch:${expectedAbility.spellId}`);
    check(ability.refs?.iconId === expectedAbility.iconId && ability.iconId === expectedAbility.iconId, `manifest-ability-icon-id-mismatch:${expectedAbility.spellId}`);
    check(JSON.stringify(ability.names) === JSON.stringify(expectedAbility.names), `manifest-ability-names-mismatch:${expectedAbility.spellId}`);
    check(ability.verificationStatus === "identity_only", `manifest-ability-status-overclaimed:${expectedAbility.spellId}`);
    check(ability.iconVerificationStatus === "verified", `manifest-ability-icon-status-invalid:${expectedAbility.spellId}`);
    const descriptionEvidence = descriptionEvidenceBySpellId.get(expectedAbility.spellId);
    check(Boolean(descriptionEvidence), `description-evidence-missing:${expectedAbility.spellId}`);
    if (descriptionEvidence?.publicationCandidate) {
      check(
        ability.descriptions?.en === descriptionEvidence.publicationCandidate.descriptions.en
          && ability.descriptions?.ru === descriptionEvidence.publicationCandidate.descriptions.ru,
        `verified-description-mismatch:${expectedAbility.spellId}`,
      );
      check(ability.descriptionVerificationStatus === "verified", `verified-description-status-invalid:${expectedAbility.spellId}`);
      check(!ability.descriptions.en.includes("$") && !ability.descriptions.ru.includes("$"), `verified-description-has-client-token:${expectedAbility.spellId}`);
    } else {
      check(ability.descriptions?.en == null && ability.descriptions?.ru == null, `manifest-ability-description-unsafely-published:${expectedAbility.spellId}`);
      check(ability.descriptionVerificationStatus === "withheld_unresolved_tokens", `withheld-description-status-invalid:${expectedAbility.spellId}`);
    }
    check(Boolean(ability.iconUrl && ability.iconName && ability.iconSourceUrl), `manifest-ability-media-missing:${expectedAbility.spellId}`);
    check(!ability.mechanicTags && !ability.execution, `manifest-ability-tactics-unsafely-published:${expectedAbility.spellId}`);
  }
}

for (const source of audit.sources ?? []) {
  if (source.kind === "live_build_manifest") continue;
  check(/^[0-9a-f]{64}$/.test(source.sha256 ?? ""), `source-hash-invalid:${source.kind}`);
}
for (const url of [instance?.sourceUrl, ...manifest.encounters.filter((row) => row.instance === "venomous-abyss").map((row) => row.sourceUrl), ...manifest.abilities.filter((row) => auditSpellIds.has(row.refs?.spellId)).map((row) => row.sourceUrl)]) {
  const source = sourceByUrl.get(url);
  check(source?.kind === "verified_database", `manifest-source-unregistered:${url ?? "missing"}`);
}

for (const forbidden of ["Strategy reviewed", "Тактика проверена", "LFR minimum", "минимум LFR"]) {
  check(!bossPageSource.includes(forbidden) && !raidPageSource.includes(forbidden), `unsafe-publication-label:${forbidden}`);
}
check(bossPageSource.includes("source_tracked") && bossPageSource.includes("not verified"), "boss-page-source-tracked-disclosure-missing");
check(bossPageSource.includes("journalAbilities") && bossPageSource.includes("Spell ID") && bossPageSource.includes("remain withheld"), "boss-page-verified-ability-disclosure-missing");
check(bossPageSource.includes("journalPhases") && bossPageSource.includes("No phases were inferred"), "boss-page-verified-phase-disclosure-missing");
check(raidPageSource.includes("content-manifest.json"), "raid-page-canonical-manifest-projection-missing");

const onlineResults = [];
if (online) {
  for (const source of audit.sources ?? []) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(180_000), headers: { "user-agent": "GildraVenomousAbyssVerifier/1.0" } });
    if (!response.ok) {
      issues.push(`online-source-status:${source.kind}:${response.status}`);
      onlineResults.push({ kind: source.kind, url: source.url, status: response.status, verified: false });
      continue;
    }
    if (source.kind === "live_build_manifest") {
      const payload = await response.json();
      const currentBuild = payload.wow?.[0]?.version ?? null;
      const verified = currentBuild === audit.gameBuild;
      if (!verified) issues.push(`live-build-mismatch:${currentBuild ?? "missing"}`);
      onlineResults.push({ kind: source.kind, url: source.url, currentBuild, verified });
      continue;
    }
    const digest = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    const verified = digest === source.sha256;
    if (!verified) issues.push(`online-source-hash-mismatch:${source.kind}`);
    onlineResults.push({ kind: source.kind, url: source.url, sha256: digest, verified });
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild: audit.gameBuild,
  online,
  encounters: audit.encounters?.length ?? 0,
  overviewAbilities: auditSpellIds.size,
  explicitJournalPhases: journalTreeAudit.summary?.explicitPhaseCandidates ?? 0,
  withheldTokenizedDescriptions: tokenAudit.summary?.withheldAbilities ?? null,
  verified: issues.length === 0,
  violations: issues.length,
};
const reportPath = path.join(root, "docs/reports/wow/venomous-abyss-source-verification.json");
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify({ summary, issues, onlineResults }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
