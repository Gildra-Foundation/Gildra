import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import sharp from "sharp";

const root = process.cwd();
const apiBase = String(process.env.API_READINESS_URL ?? "https://api.gildra.net").replace(/\/$/, "");
const inputPath = path.resolve(root, process.env.MYTHIC_MEDIA_INVENTORY ?? "docs/reports/wow/mythic-media-inventory.json");
const outputPath = path.resolve(root, process.env.MYTHIC_MEDIA_REPORT ?? "docs/reports/wow/mythic-media-verification.json");
const strict = process.argv.includes("--strict");
const abilityArgumentIndex = process.argv.indexOf("--ability");
const abilityFilter = abilityArgumentIndex >= 0 ? process.argv[abilityArgumentIndex + 1] : null;
const enemyArgumentIndex = process.argv.indexOf("--enemy");
const enemyFilter = enemyArgumentIndex >= 0 ? process.argv[enemyArgumentIndex + 1] : null;
if (abilityFilter && enemyFilter) throw new Error("Use either --ability or --enemy, not both.");
const concurrency = Math.max(1, Math.min(6, Number(process.env.MYTHIC_MEDIA_CONCURRENCY ?? 2) || 2));
const timeoutMs = Math.max(5_000, Number(process.env.MYTHIC_MEDIA_TIMEOUT_MS ?? 30_000) || 30_000);
const maxRmse = 35;
const maxMae = 25;
const maxPortraitRmse = 12;
const maxPortraitMae = 8;
const userAgent = "GildraMythicMediaVerifier/1.0";
const acceptedSpellIconSources = new Set(["blizzard_api", "wago_tools"]);

const [inventory, sourceAudit, npcSourceAudit] = await Promise.all([
  fs.readFile(inputPath, "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "data/wow/mythic-ability-source-audit.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(root, "data/wow/mythic-npc-source-audit.json"), "utf8").then(JSON.parse),
]);
if (inventory.summary?.scope !== "local route/media inventory only; no gameplay or API verification") {
  throw new Error(`Unsupported Mythic+ media inventory scope in ${inputPath}`);
}

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

function summaryUrl(type, query) {
  const url = new URL(`${apiBase}/v1/game/entity-summaries`);
  url.searchParams.set("product", "wow");
  url.searchParams.set("type", type);
  url.searchParams.set("q", String(query));
  url.searchParams.set("limit", "100");
  url.searchParams.set("locale", "en_US");
  return url;
}

async function getSummaries(type, query) {
  const url = summaryUrl(type, query);
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`catalog-status:${response.status}`);
  const body = await response.json();
  return { sourceUrl: url.toString(), rows: Array.isArray(body.data) ? body.data : [] };
}

async function getEntity(entityId) {
  const url = new URL(`${apiBase}/v1/game/entities/${encodeURIComponent(entityId)}`);
  url.searchParams.set("locale", "en_US");
  const response = await fetchWithRetry(url);
  if (!response.ok) throw new Error(`catalog-entity-status:${response.status}`);
  return { sourceUrl: url.toString(), entity: await response.json() };
}

function candidateEvidence(candidate) {
  return {
    entityId: candidate.id ?? null,
    externalId: candidate.externalId ?? null,
    name: candidate.name ?? null,
    iconName: candidate.iconName ?? null,
    iconUrl: candidate.iconUrl ?? null,
    buildId: candidate.buildId ?? null,
    updatedAt: candidate.updatedAt ?? null,
  };
}

function issueFromError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error?.name === "TimeoutError" || error?.name === "AbortError" || /timeout|aborted/i.test(message)) return "request-timeout";
  return message;
}

function normalizeEvidenceText(value) {
  return value
    .replace(/&#0*39;|&apos;|&#x27;/gi, "'")
    .replace(/&quot;|&#0*34;|&#x22;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getWowheadNpc(npcId) {
  const pageResponse = await fetchWithRetry(`https://www.wowhead.com/npc=${npcId}`);
  if (pageResponse.ok) {
    const body = await pageResponse.text();
    const title = normalizeEvidenceText(body.match(/<title>([^<]+)/i)?.[1] ?? "")
      .replace(/ - NPC - World of Warcraft$/, "");
    const displayId = Number(body.match(/data-mv-display-id="(\d+)"/i)?.[1]
      ?? body.match(/linksButton\.dataset\.displayId\s*=\s*(\d+)/i)?.[1]);
    return {
      sourceUrl: pageResponse.url,
      verificationUrl: pageResponse.url,
      verificationMode: "wowhead_page",
      title,
      displayId: Number.isInteger(displayId) && displayId > 0 ? displayId : null,
    };
  }

  const tooltipResponse = await fetchWithRetry(`https://nether.wowhead.com/tooltip/npc/${npcId}`);
  if (!tooltipResponse.ok) throw new Error(`wowhead-npc-status:${pageResponse.status};tooltip-status:${tooltipResponse.status}`);
  const tooltip = await tooltipResponse.json();
  return {
    sourceUrl: null,
    verificationUrl: tooltipResponse.url,
    verificationMode: `wowhead_tooltip_after_page_${pageResponse.status}`,
    title: normalizeEvidenceText(String(tooltip.name ?? "")),
    displayId: null,
  };
}

function isExactWowheadNpcUrl(value, npcId) {
  try {
    const url = new URL(value);
    return url.hostname === "www.wowhead.com"
      && (url.pathname === `/npc=${npcId}` || url.pathname.startsWith(`/npc=${npcId}/`));
  } catch {
    return false;
  }
}

function wowheadModelThumbnailUrl(displayId) {
  return `https://wow.zamimg.com/modelviewer/live/webthumbs/npc/${displayId % 256}/${displayId}.webp`;
}

async function normalizedRgb(bytes, size = 56) {
  return sharp(bytes)
    .flatten({ background: "#000000" })
    .resize(size, size, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
}

function pixelDifference(left, right) {
  let squaredError = 0;
  let absoluteError = 0;
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    squaredError += difference * difference;
    absoluteError += Math.abs(difference);
  }
  return {
    normalizedRgbRmse: Number(Math.sqrt(squaredError / left.length).toFixed(4)),
    normalizedRgbMae: Number((absoluteError / left.length).toFixed(4)),
  };
}

function effectiveSpellIconUrl(row) {
  if (row.iconUrl?.startsWith("/assets/")) return null;
  if (row.iconUrl?.startsWith("/v1/media/")) {
    return `https://render.worldofwarcraft.com/us/icons/56/${encodeURIComponent(row.iconName.toLowerCase())}.jpg`;
  }
  return row.iconUrl ?? null;
}

async function readDisplayedSpellIcon(row) {
  if (row.iconUrl?.startsWith("/assets/")) {
    return {
      bytes: await fs.readFile(path.join(root, "public", row.iconUrl)),
      displayedIconUrl: row.iconUrl,
      displayedIconSource: "local-asset",
    };
  }
  const displayedIconUrl = effectiveSpellIconUrl(row);
  if (!displayedIconUrl) throw new Error("displayed-icon-url-missing");
  const response = await fetchWithRetry(displayedIconUrl);
  if (!response.ok) throw new Error(`displayed-icon-status:${response.status}`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    displayedIconUrl,
    displayedIconSource: "remote-asset",
  };
}

async function verifyAbility(row) {
  const issues = [...row.issues];
  if (!row.inventoryComplete) {
    try {
      const catalog = await getSummaries("spell", row.name);
      const exactNameCandidates = catalog.rows
        .filter((candidate) => candidate.type === "spell" && candidate.name === row.name)
        .map(candidateEvidence);
      return {
        ...row,
        catalogSourceUrl: catalog.sourceUrl,
        exactNameCandidates,
        identityVerified: false,
        iconVerified: false,
        verified: false,
        issues,
      };
    } catch (error) {
      issues.push(issueFromError(error));
      return { ...row, catalogSourceUrl: null, exactNameCandidates: [], identityVerified: false, iconVerified: false, verified: false, issues };
    }
  }

  try {
    const catalog = await getSummaries("spell", row.spellId);
    const entity = catalog.rows.find((candidate) => candidate.type === "spell" && candidate.externalId === row.spellId);
    if (!entity) {
      issues.push("catalog-exact-entity-not-found");
      return { ...row, catalogSourceUrl: catalog.sourceUrl, identityVerified: false, iconVerified: false, verified: false, issues };
    }

    const full = await getEntity(entity.id);
    const fullEntity = full.entity;
    const catalogMedia = fullEntity.media?.find((media) => (
      media.kind === "icon"
      && media.primary
      && acceptedSpellIconSources.has(media.source)
      && media.sourceUrl
      && media.fileDataId
    ));
    const resolvedEvidence = sourceAudit.resolvedNames?.find((candidate) => candidate.name === row.name);
    let curatedMedia = null;
    if (!catalogMedia && resolvedEvidence) {
      const evidenceMatches = resolvedEvidence.selectedSpellId === row.spellId
        && resolvedEvidence.iconId === row.iconId
        && resolvedEvidence.actorEvidenceUrl === row.actorEvidenceUrl
        && resolvedEvidence.identitySourceUrl === row.identitySourceUrl
        && resolvedEvidence.iconMappingSourceUrl === row.iconMappingSourceUrl
        && Boolean(row.lastVerifiedAt)
        && row.iconUrl?.startsWith("https://render.worldofwarcraft.com/");
      if (!evidenceMatches) {
        issues.push("curated-icon-evidence-mismatch");
      } else {
        const [actorResponse, identityResponse, iconMappingResponse] = await Promise.all([
          fetchWithRetry(row.actorEvidenceUrl),
          fetchWithRetry(row.identitySourceUrl),
          fetchWithRetry(row.iconMappingSourceUrl),
        ]);
        if (!actorResponse.ok) issues.push(`actor-evidence-status:${actorResponse.status}`);
        if (!identityResponse.ok) issues.push(`identity-evidence-status:${identityResponse.status}`);
        if (!iconMappingResponse.ok) issues.push(`icon-mapping-evidence-status:${iconMappingResponse.status}`);

        if (actorResponse.ok && identityResponse.ok && iconMappingResponse.ok) {
          const actorBody = normalizeEvidenceText(await actorResponse.text());
          const identityRows = (await identityResponse.text()).trim().split(/\r?\n/);
          const iconMappingRows = (await iconMappingResponse.text()).trim().split(/\r?\n/);
          const iconHeaders = iconMappingRows[0]?.split(",") ?? [];
          const spellIdIndex = iconHeaders.indexOf("SpellID");
          const iconIdIndex = iconHeaders.indexOf("SpellIconFileDataID");
          const exactIdentityRow = `${row.spellId},${row.name}`;
          const exactIconMapping = iconMappingRows.slice(1).some((line) => {
            const cells = line.split(",");
            return Number(cells[spellIdIndex]) === row.spellId
              && Number(cells[iconIdIndex]) === row.iconId;
          });
          if (!actorBody.includes(row.name) || !actorBody.includes(resolvedEvidence.actor)) {
            issues.push("actor-evidence-content-mismatch");
          }
          if (!identityRows.slice(1).includes(exactIdentityRow)) {
            issues.push("identity-evidence-content-mismatch");
          }
          if (spellIdIndex < 0 || iconIdIndex < 0 || !exactIconMapping) {
            issues.push("icon-mapping-evidence-content-mismatch");
          }
          if (issues.length === 0) {
            curatedMedia = {
              fileDataId: row.iconId,
              source: "curated_source_chain",
              sourceUrl: row.iconUrl,
              url: row.iconUrl,
            };
          }
        }
      }
    }
    const sourceMedia = catalogMedia ?? curatedMedia;
    const provenance = fullEntity.tooltip?.blocks?.find((block) => block.type === "provenance");
    if (fullEntity.type !== "spell") issues.push("catalog-full-type-mismatch");
    if (fullEntity.externalId !== row.spellId) issues.push("catalog-full-spell-id-mismatch");
    if (fullEntity.name !== row.name) issues.push("catalog-name-mismatch");
    if (fullEntity.iconName !== row.iconName) issues.push("catalog-icon-name-mismatch");
    if (!sourceMedia) issues.push("source-icon-provenance-missing");
    if (!provenance?.source_url || !provenance?.updated_at) issues.push("entity-provenance-missing");

    let iconCheck = null;
    if (sourceMedia?.sourceUrl && sourceMedia?.url) {
      try {
        const [displayed, catalogMediaResponse, provenanceResponse] = await Promise.all([
          readDisplayedSpellIcon(row),
          fetchWithRetry(sourceMedia.url),
          fetchWithRetry(sourceMedia.sourceUrl),
        ]);
        if (!provenanceResponse.ok) issues.push(`source-icon-status:${provenanceResponse.status}`);
        if (!catalogMediaResponse.ok) {
          issues.push(`catalog-media-status:${catalogMediaResponse.status}`);
        } else {
          const sourceBytes = Buffer.from(await catalogMediaResponse.arrayBuffer());
          const [displayedPixels, sourcePixels] = await Promise.all([
            normalizedRgb(displayed.bytes),
            normalizedRgb(sourceBytes),
          ]);
          const difference = pixelDifference(displayedPixels, sourcePixels);
          iconCheck = {
            ...difference,
            displayedIconUrl: displayed.displayedIconUrl,
            displayedIconSource: displayed.displayedIconSource,
            displayedSha256: createHash("sha256").update(displayed.bytes).digest("hex"),
            sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
            thresholds: { maxRmse, maxMae },
          };
          if (difference.normalizedRgbRmse > maxRmse || difference.normalizedRgbMae > maxMae) {
            issues.push("displayed-icon-semantic-mismatch");
          }
        }
      } catch (error) {
        issues.push(issueFromError(error));
      }
    }

    const identityVerified = fullEntity.type === "spell"
      && fullEntity.externalId === row.spellId
      && fullEntity.name === row.name
      && fullEntity.iconName === row.iconName;
    const iconVerified = Boolean(iconCheck)
      && iconCheck.normalizedRgbRmse <= maxRmse
      && iconCheck.normalizedRgbMae <= maxMae;
    return {
      ...row,
      catalogSourceUrl: catalog.sourceUrl,
      catalogEntitySourceUrl: full.sourceUrl,
      catalogEntityId: fullEntity.id ?? entity.id ?? null,
      catalogBuildId: fullEntity.buildId ?? null,
      catalogBuildVersion: provenance?.build ?? null,
      catalogUpdatedAt: fullEntity.updatedAt ?? null,
      entitySourceUrl: provenance?.source_url ?? null,
      entitySourceUpdatedAt: provenance?.updated_at ?? null,
      iconId: sourceMedia?.fileDataId ?? null,
      iconProvenance: sourceMedia?.source ?? null,
      iconSourceTier: sourceMedia?.source === "blizzard_api"
        ? "official"
        : sourceMedia?.source === "curated_source_chain"
          ? "mixed-source-verified"
          : sourceMedia
            ? "verified-database"
            : null,
      iconSourceUrl: sourceMedia?.sourceUrl ?? null,
      iconVerificationUrl: sourceMedia?.url ?? null,
      identitySourceUrl: row.identitySourceUrl ?? provenance?.source_url ?? null,
      iconMappingSourceUrl: row.iconMappingSourceUrl ?? null,
      actorEvidenceUrl: row.actorEvidenceUrl ?? null,
      iconCheck,
      identityVerified,
      iconVerified,
      verified: identityVerified && iconVerified && issues.length === 0,
      issues,
    };
  } catch (error) {
    issues.push(issueFromError(error));
    return { ...row, catalogSourceUrl: null, identityVerified: false, iconVerified: false, verified: false, issues };
  }
}

async function verifyEnemy(row) {
  const issues = [...row.issues];
  if (!Number.isInteger(row.npcId) || row.npcId <= 0) {
    try {
      const catalog = await getSummaries("creature", row.name);
      const exactNameCandidates = catalog.rows
        .filter((candidate) => candidate.type === "creature" && candidate.name === row.name)
        .map(candidateEvidence);
      return {
        ...row,
        catalogSourceUrl: catalog.sourceUrl,
        exactNameCandidates,
        identityVerified: false,
        portraitVerified: false,
        verified: false,
        issues,
      };
    } catch (error) {
      issues.push(issueFromError(error));
      return { ...row, catalogSourceUrl: null, exactNameCandidates: [], identityVerified: false, portraitVerified: false, verified: false, issues };
    }
  }

  try {
    // Creature summaries currently do not support reliable numeric-ID lookup.
    // Require an exact name+externalId match from the catalog; never accept a
    // fuzzy name hit as proof of the NPC identity.
    const catalog = await getSummaries("creature", row.name);
    const entity = catalog.rows.find((candidate) => (
      candidate.type === "creature"
      && candidate.externalId === row.npcId
      && candidate.name === row.name
    ));
    const wowheadIdentity = await getWowheadNpc(row.npcId);
    if (!entity && wowheadIdentity.title !== row.name) issues.push("identity-source-exact-entity-not-found");

    const expectedIdentitySourceUrl = entity
      ? `${apiBase}/v1/game/entities/${entity.id}?locale=en_US`
      : wowheadIdentity.sourceUrl ?? row.identitySourceUrl;
    const identityMetadataVerified = Boolean(
      row.identityVerified
      && row.identityLastVerifiedAt,
    ) && (entity
      ? row.identitySourceUrl === expectedIdentitySourceUrl
      : isExactWowheadNpcUrl(row.identitySourceUrl, row.npcId));

    const identityVerified = Boolean(entity) || wowheadIdentity.title === row.name;
    if (identityVerified && !identityMetadataVerified) issues.push("verified-identity-metadata-missing");
    if (!identityVerified && row.identityVerified) issues.push("claimed-identity-not-reproduced");

    let portraitCheck = null;
    let portraitSourceUrl = null;
    const promotedPortraitSourceUrl = row.portraitVerified
      && row.portraitLastVerifiedAt
      && /^https:\/\/wow\.zamimg\.com\/modelviewer\/live\/webthumbs\/npc\/\d+\/\d+\.webp$/.test(row.portraitSourceUrl ?? "")
      ? row.portraitSourceUrl
      : null;
    if (identityVerified && wowheadIdentity.title === row.name && row.portraitUrl?.startsWith("/assets/") && (wowheadIdentity.displayId || promotedPortraitSourceUrl)) {
      portraitSourceUrl = wowheadIdentity.displayId
        ? wowheadModelThumbnailUrl(wowheadIdentity.displayId)
        : promotedPortraitSourceUrl;
      const sourceResponse = await fetchWithRetry(portraitSourceUrl);
      if (!sourceResponse.ok) {
        issues.push(`portrait-source-status:${sourceResponse.status}`);
      } else {
        const [displayedBytes, sourceBytes] = await Promise.all([
          fs.readFile(path.join(root, "public", row.portraitUrl)),
          sourceResponse.arrayBuffer().then((bytes) => Buffer.from(bytes)),
        ]);
        const [displayedPixels, sourcePixels] = await Promise.all([
          normalizedRgb(displayedBytes, 128),
          normalizedRgb(sourceBytes, 128),
        ]);
        const difference = pixelDifference(displayedPixels, sourcePixels);
        portraitCheck = {
          ...difference,
          displayId: wowheadIdentity.displayId ?? (Number(portraitSourceUrl.match(/\/(\d+)\.webp$/)?.[1]) || null),
          displayedPortraitUrl: row.portraitUrl,
          sourcePortraitUrl: portraitSourceUrl,
          displayedSha256: createHash("sha256").update(displayedBytes).digest("hex"),
          sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
          thresholds: { maxRmse: maxPortraitRmse, maxMae: maxPortraitMae },
        };
        if (difference.normalizedRgbRmse > maxPortraitRmse || difference.normalizedRgbMae > maxPortraitMae) {
          issues.push("displayed-portrait-semantic-mismatch");
        }
      }
    } else if (row.portraitUrl) {
      if (!wowheadIdentity.displayId) issues.push("portrait-model-id-missing");
      else if (wowheadIdentity.title !== row.name) issues.push("portrait-identity-evidence-mismatch");
      else issues.push("portrait-provenance-unverified");
    }
    const portraitVerified = Boolean(portraitCheck)
      && portraitCheck.normalizedRgbRmse <= maxPortraitRmse
      && portraitCheck.normalizedRgbMae <= maxPortraitMae;
    const portraitMetadataVerified = Boolean(
      portraitVerified
      && row.portraitVerified
      && row.portraitSourceUrl === portraitSourceUrl
      && row.portraitLastVerifiedAt,
    );
    if (portraitVerified && !portraitMetadataVerified) issues.push("verified-portrait-metadata-missing");

    const noModelEvidence = (npcSourceAudit.verifiedLinks ?? []).find((candidate) => (
      candidate.name === row.name
      && candidate.npcId === row.npcId
      && candidate.displayId === null
      && candidate.portraitUrl === null
      && candidate.sourceUrl === row.portraitSourceUrl
    ));
    const placeholderVerified = Boolean(
      identityVerified
      && !row.portraitUrl
      && !wowheadIdentity.displayId
      && row.portraitStatus === "model_unavailable"
      && row.portraitLastVerifiedAt
      && noModelEvidence
      && npcSourceAudit.lastVerifiedAt,
    );
    if (!row.portraitUrl && !wowheadIdentity.displayId && !placeholderVerified) {
      issues.push("portrait-model-unavailable-unrecorded");
    }
    if (wowheadIdentity.displayId && row.portraitStatus === "model_unavailable") {
      issues.push("portrait-model-unavailable-claim-mismatch");
    }
    const mediaSafe = portraitMetadataVerified || placeholderVerified;
    return {
      ...row,
      catalogSourceUrl: catalog.sourceUrl,
      catalogEntityId: entity?.id ?? null,
      catalogBuildId: entity?.buildId ?? null,
      catalogUpdatedAt: entity?.updatedAt ?? null,
      expectedIdentitySourceUrl,
      identityMetadataVerified,
      identityProvenance: entity ? "gildra_catalog" : wowheadIdentity ? "wowhead" : null,
      identityVerificationUrl: entity ? catalog.sourceUrl : wowheadIdentity.verificationUrl,
      identityVerificationMode: entity ? "gildra_catalog" : wowheadIdentity.verificationMode,
      identitySourceTitle: wowheadIdentity.title,
      identityVerified,
      portraitProvenance: portraitVerified ? "wowhead_modelviewer" : null,
      portraitSourceUrl,
      portraitCheck,
      portraitVerified,
      portraitMetadataVerified,
      placeholderVerified,
      mediaSafe,
      verified: identityVerified && identityMetadataVerified && mediaSafe && issues.length === 0,
      issues,
    };
  } catch (error) {
    issues.push(issueFromError(error));
    issues.push("portrait-provenance-unverified");
    return { ...row, catalogSourceUrl: null, identityVerified: false, portraitVerified: false, verified: false, issues };
  }
}

async function mapConcurrent(rows, worker) {
  const results = new Array(rows.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, rows.length)) }, async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(rows[index]);
    }
  }));
  return results;
}

const [abilities, enemies] = await Promise.all([
  enemyFilter ? Promise.resolve([]) : mapConcurrent((inventory.abilities ?? []).filter((row) => !abilityFilter || row.name === abilityFilter), verifyAbility),
  abilityFilter ? Promise.resolve([]) : mapConcurrent((inventory.enemies ?? []).filter((row) => !enemyFilter || row.name === enemyFilter), verifyEnemy),
]);

const abilityIssueCounts = Object.fromEntries([...new Set(abilities.flatMap((row) => row.issues))]
  .sort()
  .map((issue) => [issue, abilities.filter((row) => row.issues.includes(issue)).length]));
const enemyIssueCounts = Object.fromEntries([...new Set(enemies.flatMap((row) => row.issues))]
  .sort()
  .map((issue) => [issue, enemies.filter((row) => row.issues.includes(issue)).length]));

const summary = {
  generatedAt: new Date().toISOString(),
  mode: abilityFilter ? `single-ability:${abilityFilter}` : enemyFilter ? `single-enemy:${enemyFilter}` : "complete-inventory",
  scope: "identity and displayed-media verification only; no mechanic, tactic, timing, route, or gameplay verification",
  apiBase,
  concurrency,
  timeoutMs,
  policy: {
    spellIdentity: "exact type + externalId + case-sensitive English name + iconName from the full catalog entity",
    spellIcon: "primary icon with reachable Blizzard/Wago provenance or an exact checked mixed-source chain, plus displayed/source normalized pixel RMSE/MAE within thresholds",
    iconThresholds: { maxRmse, maxMae },
    npcIdentity: "exact creature externalId + case-sensitive English name from the Gildra catalog or exact NPC page title from Wowhead; fuzzy name matches are rejected",
    npcPortrait: "requires an exact Wowhead NPC title plus either a modelviewer thumbnail with matching verified local pixels and publication metadata, or an explicitly verified neutral placeholder when the exact source exposes no display model",
    portraitThresholds: { maxRmse: maxPortraitRmse, maxMae: maxPortraitMae },
  },
  inventoryGeneratedAt: inventory.summary?.generatedAt ?? null,
  abilitiesUsed: abilities.length,
  abilitiesIdentityVerified: abilities.filter((row) => row.identityVerified).length,
  abilitiesIconVerified: abilities.filter((row) => row.iconVerified).length,
  abilitiesVerified: abilities.filter((row) => row.verified).length,
  verifiedAbilityIconsByProvenance: Object.fromEntries([...new Set(abilities
    .filter((row) => row.iconVerified && row.iconProvenance)
    .map((row) => row.iconProvenance))]
    .sort()
    .map((source) => [source, abilities.filter((row) => row.iconVerified && row.iconProvenance === source).length])),
  abilityViolations: abilities.filter((row) => !row.verified).length,
  abilityIssueCounts,
  enemiesUsed: enemies.length,
  enemiesIdentityVerified: enemies.filter((row) => row.identityVerified).length,
  verifiedEnemyIdentitiesByProvenance: Object.fromEntries([...new Set(enemies
    .filter((row) => row.identityVerified && row.identityProvenance)
    .map((row) => row.identityProvenance))]
    .sort()
    .map((source) => [source, enemies.filter((row) => row.identityVerified && row.identityProvenance === source).length])),
  enemiesPortraitVerified: enemies.filter((row) => row.portraitVerified).length,
  enemiesPlaceholderVerified: enemies.filter((row) => row.placeholderVerified).length,
  enemiesMediaSafe: enemies.filter((row) => row.mediaSafe).length,
  enemiesVerified: enemies.filter((row) => row.verified).length,
  enemyViolations: enemies.filter((row) => !row.verified).length,
  enemyIssueCounts,
  releaseEligible: abilities.every((row) => row.verified) && enemies.every((row) => row.verified),
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ summary, abilities, enemies }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && !summary.releaseEligible) process.exitCode = 1;
