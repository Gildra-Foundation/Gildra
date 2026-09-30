import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const candidates = JSON.parse(await fs.readFile(path.join(root, "components/wow/raid/midnightRaidSpells.json"), "utf8"));
const publishedOnly = process.argv.includes("--published-only");
const publishedIds = new Set(JSON.parse(await fs.readFile(path.join(root, "data/wow/verified-midnight-raid-spell-ids.json"), "utf8")));
const manifest = JSON.parse(await fs.readFile(path.join(root, "data/wow/content-manifest.json"), "utf8"));
const publicationProjection = JSON.parse(await fs.readFile(path.join(root, "data/wow/midnight-season-one-publication.json"), "utf8"));
const manifestAbilityBySpellId = new Map(manifest.abilities.map((ability) => [ability.refs?.spellId, ability]));
const routeDataSource = await fs.readFile(path.join(root, "components/wow/raid/midnightRaidData.ts"), "utf8");
const publicationSafeIds = new Set(manifest.abilities
  .filter((ability) => ability.season === "midnight-season-1"
    && ability.descriptionVariantStatus === "not_required_verified"
    && ability.descriptionVerificationStatus === "verified"
    && typeof ability.descriptions?.en === "string"
    && typeof ability.descriptions?.ru === "string")
  .map((ability) => ability.refs?.spellId));
const rows = publishedOnly
  ? candidates.filter((row) => publishedIds.has(row.spellId) && publicationSafeIds.has(row.spellId))
  : candidates;
const apiBase = String(process.env.API_READINESS_URL ?? "https://api.gildra.net").replace(/\/$/, "");
const outputPath = path.resolve(root, process.env.RAID_ABILITY_REPORT ?? "docs/reports/wow/raid-ability-verification.json");
const strict = process.argv.includes("--strict");
const publicationGuardIssues = [
  [routeDataSource.includes('midnight-season-one-publication.json'), "canonical-publication-projection-missing"],
  [!routeDataSource.includes('midnightRaidSpells.json'), "unsafe-raw-description-import-present"],
  [!routeDataSource.includes('content-manifest.json'), "full-manifest-client-import-present"],
  [publicationProjection.manifestVersion === manifest.manifestVersion, "publication-projection-manifest-version-mismatch"],
  [JSON.stringify(publicationProjection.abilities.map((ability) => ability.spellId).sort((a, b) => a - b))
    === JSON.stringify([...publicationSafeIds].sort((a, b) => a - b)), "publication-projection-scope-mismatch"],
].filter(([condition]) => !condition).map(([, issue]) => issue);

const hash = (value) => createHash("sha256").update(value).digest("hex");
const results = new Array(rows.length);
let cursor = 0;

await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < rows.length) {
    const index = cursor++;
    const row = rows[index];
    const issues = [];
    try {
      const manifestAbility = manifestAbilityBySpellId.get(row.spellId);
      if (manifestAbility?.descriptionVariantStatus !== "not_required_verified"
        || manifestAbility?.descriptionVerificationStatus !== "verified") issues.push("canonical-publication-status-invalid");
      if (manifestAbility?.descriptions?.en !== row.descriptionEn) issues.push("canonical-description-en-mismatch");
      if (manifestAbility?.descriptions?.ru !== row.description) issues.push("canonical-description-ru-mismatch");
      if (!manifestAbility?.sourceUrls?.descriptionEn || !manifestAbility?.sourceUrls?.descriptionRu
        || manifestAbility?.descriptionVerifiedAt == null) issues.push("canonical-description-provenance-missing");
      const response = await fetch(`${apiBase}/v1/game/entities/${encodeURIComponent(row.entityId)}?locale=en_US`, {
        signal: AbortSignal.timeout(15_000),
        headers: { "user-agent": "GildraRaidAbilityVerifier/1.0" },
      });
      if (!response.ok) throw new Error(`catalog-status:${response.status}`);
      const entity = await response.json();
      const media = entity.media?.find((item) => item.primary && item.kind === "icon");
      if (entity.type !== "spell") issues.push(`type:${entity.type ?? "missing"}`);
      if (entity.externalId !== row.spellId) issues.push(`spellId:${entity.externalId ?? "missing"}`);
      if (entity.name !== row.nameEn) issues.push("name-en-mismatch");
      if (entity.localizations?.ru_RU?.name !== row.nameRu) issues.push("name-ru-mismatch");
      if (entity.resolvedDescription !== row.descriptionEn) issues.push("description-en-mismatch");
      if (entity.localizations?.ru_RU?.resolvedDescription !== row.description) issues.push("description-ru-mismatch");
      if (entity.iconName !== row.iconName) issues.push("icon-name-mismatch");
      if (!media || media.source !== "blizzard_api" || !media.sourceUrl || !media.assetKey) issues.push("official-icon-provenance-missing");
      if (media?.sourceUrl) {
        const [localBytes, iconResponse] = await Promise.all([
          fs.readFile(path.join(root, "public", row.localIcon.replace(/^\//, ""))),
          fetch(media.sourceUrl, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "GildraRaidAbilityVerifier/1.0" } }),
        ]);
        if (!iconResponse.ok) issues.push(`icon-status:${iconResponse.status}`);
        else if (hash(localBytes) !== hash(Buffer.from(await iconResponse.arrayBuffer()))) issues.push("local-icon-byte-mismatch");
      }
      results[index] = {
        entityId: row.entityId,
        spellId: row.spellId,
        encounterId: row.enc,
        nameEn: row.nameEn,
        buildId: entity.buildId ?? null,
        buildVersion: entity.tooltip?.blocks?.find((block) => block.type === "provenance")?.build ?? null,
        sourceUrl: entity.tooltip?.blocks?.find((block) => block.type === "provenance")?.source_url ?? null,
        updatedAt: entity.updatedAt ?? null,
        iconId: media?.fileDataId ?? null,
        iconName: entity.iconName ?? null,
        iconSourceUrl: media?.sourceUrl ?? null,
        issues,
        verified: issues.length === 0,
      };
    } catch (error) {
      results[index] = { entityId: row.entityId, spellId: row.spellId, encounterId: row.enc, nameEn: row.nameEn, issues: [error instanceof Error ? error.message : String(error)], verified: false };
    }
  }
}));

const summary = {
  generatedAt: new Date().toISOString(),
  apiBase,
  mode: publishedOnly ? "published" : "candidate-audit",
  candidates: candidates.length,
  excludedCandidates: candidates.length - rows.length,
  identityVerifiedCandidates: candidates.filter((row) => publishedIds.has(row.spellId)).length,
  descriptionPublicationSafeCandidates: candidates.filter((row) => publishedIds.has(row.spellId) && publicationSafeIds.has(row.spellId)).length,
  publicationProjectionCandidates: publicationProjection.abilities.length,
  withheldSourceUnverifiedCandidates: candidates.filter((row) => publishedIds.has(row.spellId) && !publicationSafeIds.has(row.spellId)).length,
  publicationGuardIssues,
  total: results.length,
  verified: results.filter((result) => result.verified).length,
  violations: results.filter((result) => !result.verified).length + publicationGuardIssues.length,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && summary.violations) process.exitCode = 1;
