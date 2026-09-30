import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import sharp from "sharp";

const root = process.cwd();
const sourceAuditPath = path.join(root, "data/wow/venomous-abyss-source-audit.json");
const iconAuditPath = path.join(root, "data/wow/venomous-abyss-icon-audit.json");
const descriptionAuditPath = path.join(root, "data/wow/venomous-abyss-description-audit.json");
const manifestPath = path.join(root, "data/wow/content-manifest.json");
const reportPath = path.join(root, "docs/reports/wow/venomous-abyss-icon-verification.json");
const apiBase = String(process.env.API_READINESS_URL ?? "https://api.gildra.net").replace(/\/$/, "");
const refresh = process.argv.includes("--refresh");
const online = refresh || process.argv.includes("--online");
const strict = process.argv.includes("--strict");
const timeoutMs = Math.max(5_000, Number(process.env.VENOMOUS_ICON_TIMEOUT_MS ?? 30_000) || 30_000);
const concurrency = Math.max(1, Math.min(4, Number(process.env.VENOMOUS_ICON_CONCURRENCY ?? 2) || 2));
const userAgent = "GildraVenomousAbyssIconVerifier/1.0";

const [sourceAudit, descriptionAudit, manifest] = await Promise.all([
  fs.readFile(sourceAuditPath, "utf8").then(JSON.parse),
  fs.readFile(descriptionAuditPath, "utf8").then(JSON.parse),
  fs.readFile(manifestPath, "utf8").then(JSON.parse),
]);
const descriptionBySpellId = new Map(descriptionAudit.abilities.map((ability) => [ability.spellId, ability]));

const expected = sourceAudit.encounters.flatMap((encounter) => encounter.overviewAbilities.map((ability) => ({
  ...ability,
  encounterSlug: encounter.canonicalSlug,
  journalEncounterId: encounter.journalEncounterId,
})));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok || (response.status < 500 && response.status !== 429) || attempt === attempts) return response;
      lastError = new Error(`status:${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 500 * (2 ** (attempt - 1)));
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
      await wait(500 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function catalogQueryUrl(spellId) {
  const url = new URL(`${apiBase}/v1/game/entities`);
  url.searchParams.set("product", "wow");
  url.searchParams.set("type", "spell");
  url.searchParams.set("locale", "en_US");
  url.searchParams.set("q", String(spellId));
  url.searchParams.set("limit", "10");
  return url;
}

function validIconSource(source, value, iconId) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (source === "blizzard_api") {
      return url.hostname === "render.worldofwarcraft.com"
        && /^\/(?:us|eu|kr|tw|cn)\/icons\/\d+\/[a-z0-9_-]+\.(?:jpg|jpeg|png|webp)$/i.test(url.pathname);
    }
    if (source === "wago_tools") {
      return url.hostname === "wago.tools"
        && url.pathname === `/api/casc/${iconId}`
        && url.searchParams.get("product") === "wow"
        && Boolean(url.searchParams.get("version"));
    }
    return false;
  } catch {
    return false;
  }
}

async function inspectImage(bytes) {
  const metadata = await sharp(bytes).metadata();
  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format: metadata.format ?? null,
  };
}

async function verifyOnlineAbility(ability) {
  const issues = [];
  const queryUrl = catalogQueryUrl(ability.spellId);
  try {
    const response = await fetchWithRetry(queryUrl);
    if (!response.ok) throw new Error(`catalog-status:${response.status}`);
    const body = await response.json();
    const candidates = Array.isArray(body.data) ? body.data.filter((row) => row.type === "spell" && row.externalId === ability.spellId) : [];
    if (candidates.length !== 1) throw new Error(`catalog-exact-match-count:${candidates.length}`);
    const entity = candidates[0];
    const media = entity.media?.filter((row) => row.primary && row.kind === "icon") ?? [];
    if (entity.name !== ability.names.en) issues.push("name-en-mismatch");
    if (entity.localizations?.ru_RU?.name !== ability.names.ru) issues.push("name-ru-mismatch");
    if (media.length !== 1) issues.push(`primary-icon-count:${media.length}`);
    const icon = media[0];
    if (icon?.fileDataId !== ability.iconId) issues.push(`icon-id-mismatch:${icon?.fileDataId ?? "missing"}`);
    if (!new Set(["blizzard_api", "wago_tools"]).has(icon?.source)) issues.push(`icon-source:${icon?.source ?? "missing"}`);
    if (!validIconSource(icon?.source, icon?.sourceUrl, ability.iconId)) issues.push("icon-source-url-invalid");
    if (!icon?.url) issues.push("catalog-media-url-missing");

    let bytes = null;
    let sourceBytes = null;
    if (icon?.url && icon?.sourceUrl) {
      const [cachedResponse, sourceResponse] = await Promise.all([
        fetchWithRetry(icon.url),
        fetchWithRetry(icon.sourceUrl),
      ]);
      if (!cachedResponse.ok) issues.push(`catalog-media-status:${cachedResponse.status}`);
      if (!sourceResponse.ok) issues.push(`official-media-status:${sourceResponse.status}`);
      if (cachedResponse.ok) bytes = Buffer.from(await cachedResponse.arrayBuffer());
      if (sourceResponse.ok) sourceBytes = Buffer.from(await sourceResponse.arrayBuffer());
      if (icon.source === "blizzard_api" && bytes && sourceBytes && sha256(bytes) !== sha256(sourceBytes)) issues.push("catalog-official-byte-mismatch");
    }

    const metadata = bytes ? await inspectImage(bytes) : { width: null, height: null, format: null };
    if (!metadata.width || !metadata.height) issues.push("image-dimensions-missing");
    if (icon?.width && metadata.width !== icon.width) issues.push("image-width-mismatch");
    if (icon?.height && metadata.height !== icon.height) issues.push("image-height-mismatch");

    const provenance = entity.tooltip?.blocks?.find((block) => block.type === "provenance");
    const extension = metadata.format === "jpeg" ? "jpg" : metadata.format;
    const localPath = `/assets/wow/raids/venomous-abyss/spells/${ability.spellId}.${extension || "bin"}`;
    return {
      spellId: ability.spellId,
      encounterSlug: ability.encounterSlug,
      journalEncounterId: ability.journalEncounterId,
      names: ability.names,
      iconId: ability.iconId,
      iconName: entity.iconName ?? null,
      entityId: entity.id ?? null,
      catalogBuildId: entity.buildId ?? null,
      catalogBuildVersion: provenance?.build ?? null,
      catalogEntitySourceUrl: provenance?.source_url ?? null,
      catalogQueryUrl: queryUrl.toString(),
      catalogMediaUrl: icon?.url ?? null,
      iconSource: icon?.source ?? null,
      iconSourceUrl: icon?.sourceUrl ?? null,
      localPath,
      sha256: bytes ? sha256(bytes) : null,
      byteSize: bytes?.byteLength ?? null,
      sourceSha256: sourceBytes ? sha256(sourceBytes) : null,
      sourceByteSize: sourceBytes?.byteLength ?? null,
      mimeType: icon?.mimeType ?? null,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      bytes,
      issues,
      verified: issues.length === 0,
    };
  } catch (error) {
    return {
      spellId: ability.spellId,
      encounterSlug: ability.encounterSlug,
      journalEncounterId: ability.journalEncounterId,
      names: ability.names,
      iconId: ability.iconId,
      issues: [error instanceof Error ? error.message : String(error)],
      verified: false,
    };
  }
}

async function mapConcurrent(rows, worker) {
  const results = new Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      results[index] = await worker(rows[index]);
    }
  }));
  return results;
}

function serializable(row) {
  const { bytes, issues, verified, ...result } = row;
  return result;
}

let iconAudit;
let onlineResults = [];
if (online) {
  onlineResults = await mapConcurrent(expected, verifyOnlineAbility);
  if (refresh && onlineResults.every((row) => row.verified)) {
    const verifiedAt = new Date().toISOString();
    const iconDirectory = path.join(root, "public/assets/wow/raids/venomous-abyss/spells");
    await fs.mkdir(iconDirectory, { recursive: true });
    await Promise.all(onlineResults.map((row) => fs.writeFile(path.join(root, "public", row.localPath.replace(/^\//, "")), row.bytes)));
    iconAudit = {
      schemaVersion: 1,
      scope: "venomous-abyss-overview-spell-icon-provenance",
      gameBuild: sourceAudit.gameBuild,
      lastVerifiedAt: verifiedAt,
      method: "Exact spell and icon file-data IDs from the pinned live SpellName/SpellMisc snapshot are joined to a Gildra catalog media row whose source is Blizzard API; cached and official render bytes must be identical.",
      limitations: [
        "This audit proves only the displayed icon for each overview-linked spell ID.",
        "It does not prove spell descriptions, mechanic tags, execution instructions, tactics, phases, NPC portraits, loot, or drop chance.",
        "Catalog-resolved descriptions are not used because the catalog build can lag the pinned live build; exact-build description evidence is recorded separately in venomous-abyss-description-audit.json.",
      ],
      abilities: onlineResults.map(serializable),
    };
    await fs.writeFile(iconAuditPath, `${JSON.stringify(iconAudit, null, 2)}\n`);
  }
}

if (!iconAudit) {
  try {
    iconAudit = JSON.parse(await fs.readFile(iconAuditPath, "utf8"));
  } catch (error) {
    if (!refresh) throw error;
  }
}

const issues = [];
if (sourceAudit.gameBuild !== iconAudit?.gameBuild) issues.push("audit-build-mismatch");
if (expected.length !== 37) issues.push(`expected-ability-count:${expected.length}`);
if (iconAudit?.abilities?.length !== expected.length) issues.push(`audit-ability-count:${iconAudit?.abilities?.length ?? 0}`);

const auditBySpell = new Map((iconAudit?.abilities ?? []).map((row) => [row.spellId, row]));
const manifestBySpell = new Map(manifest.abilities.map((row) => [row.spellId, row]));
for (const ability of expected) {
  const audit = auditBySpell.get(ability.spellId);
  const manifestAbility = manifestBySpell.get(ability.spellId);
  if (!audit) {
    issues.push(`audit-row-missing:${ability.spellId}`);
    continue;
  }
  if (audit.encounterSlug !== ability.encounterSlug) issues.push(`encounter-mismatch:${ability.spellId}`);
  if (audit.journalEncounterId !== ability.journalEncounterId) issues.push(`encounter-id-mismatch:${ability.spellId}`);
  if (audit.iconId !== ability.iconId) issues.push(`icon-id-mismatch:${ability.spellId}`);
  if (audit.names?.en !== ability.names.en || audit.names?.ru !== ability.names.ru) issues.push(`name-mismatch:${ability.spellId}`);
  if (!audit.iconName || !validIconSource(audit.iconSource, audit.iconSourceUrl, ability.iconId)) issues.push(`icon-provenance-invalid:${ability.spellId}`);
  if (!audit.localPath || !audit.sha256 || !audit.byteSize || !audit.sourceSha256 || !audit.sourceByteSize || !audit.width || !audit.height) issues.push(`local-evidence-incomplete:${ability.spellId}`);
  try {
    const localBytes = await fs.readFile(path.join(root, "public", audit.localPath.replace(/^\//, "")));
    if (sha256(localBytes) !== audit.sha256) issues.push(`local-hash-mismatch:${ability.spellId}`);
    if (localBytes.byteLength !== audit.byteSize) issues.push(`local-size-mismatch:${ability.spellId}`);
    const metadata = await inspectImage(localBytes);
    if (metadata.width !== audit.width || metadata.height !== audit.height || metadata.format !== audit.format) issues.push(`local-metadata-mismatch:${ability.spellId}`);
  } catch (error) {
    issues.push(`local-file-error:${ability.spellId}:${error instanceof Error ? error.message : String(error)}`);
  }

  if (!manifestAbility) {
    issues.push(`manifest-row-missing:${ability.spellId}`);
    continue;
  }
  if (manifestAbility.refs?.iconId !== audit.iconId || manifestAbility.iconId !== audit.iconId) issues.push(`manifest-icon-id-mismatch:${ability.spellId}`);
  if (manifestAbility.iconName !== audit.iconName) issues.push(`manifest-icon-name-mismatch:${ability.spellId}`);
  if (manifestAbility.iconUrl !== audit.localPath) issues.push(`manifest-icon-url-mismatch:${ability.spellId}`);
  if (manifestAbility.iconSourceUrl !== audit.iconSourceUrl) issues.push(`manifest-icon-source-mismatch:${ability.spellId}`);
  if (manifestAbility.iconVerificationStatus !== "verified") issues.push(`manifest-icon-status:${ability.spellId}`);
  if (manifestAbility.verificationStatus !== "identity_only") issues.push(`manifest-identity-status:${ability.spellId}`);
  const descriptionEvidence = descriptionBySpellId.get(ability.spellId);
  if (!descriptionEvidence) {
    issues.push(`manifest-description-evidence-missing:${ability.spellId}`);
  } else if (descriptionEvidence.publicationCandidate) {
    if (
      manifestAbility.descriptions?.en !== descriptionEvidence.publicationCandidate.descriptions.en
      || manifestAbility.descriptions?.ru !== descriptionEvidence.publicationCandidate.descriptions.ru
      || manifestAbility.descriptionVerificationStatus !== "verified"
    ) issues.push(`manifest-verified-description-mismatch:${ability.spellId}`);
  } else if (
    manifestAbility.descriptions?.en !== null
    || manifestAbility.descriptions?.ru !== null
    || manifestAbility.descriptionVerificationStatus !== "withheld_unresolved_tokens"
  ) {
    issues.push(`manifest-description-promoted-without-proof:${ability.spellId}`);
  }
}

for (const row of onlineResults) {
  issues.push(...row.issues.map((issue) => `online:${row.spellId}:${issue}`));
  const audit = auditBySpell.get(row.spellId);
  if (audit && row.verified) {
    if (row.iconSourceUrl !== audit.iconSourceUrl) issues.push(`online-source-drift:${row.spellId}`);
    if (row.sha256 !== audit.sha256) issues.push(`online-hash-drift:${row.spellId}`);
    if (row.sourceSha256 !== audit.sourceSha256) issues.push(`online-source-hash-drift:${row.spellId}`);
    if (row.iconId !== audit.iconId) issues.push(`online-icon-id-drift:${row.spellId}`);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild: sourceAudit.gameBuild,
  online,
  refresh,
  abilities: expected.length,
  locallyVerified: issues.length === 0 ? expected.length : null,
  onlineVerified: online ? onlineResults.filter((row) => row.verified).length : null,
  violations: issues.length,
  verified: issues.length === 0,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify({ summary, issues, onlineResults: onlineResults.map(serializable) }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
