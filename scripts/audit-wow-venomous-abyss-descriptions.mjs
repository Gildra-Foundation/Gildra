import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const online = process.argv.includes("--online");
const write = process.argv.includes("--write");
const inputDirArgument = process.argv.find((argument) => argument.startsWith("--input-dir="));
const inputDir = inputDirArgument ? inputDirArgument.slice("--input-dir=".length) : null;
const gameBuild = "12.1.0.69814";
const sourceAuditPath = path.join(root, "data/wow/venomous-abyss-source-audit.json");
const effectAuditPath = path.join(root, "data/wow/venomous-abyss-effect-audit.json");
const auditPath = path.join(root, "data/wow/venomous-abyss-description-audit.json");
const reportPath = path.join(root, "docs/reports/wow/venomous-abyss-description-verification.json");
const sourceAudit = JSON.parse(await fs.readFile(sourceAuditPath, "utf8"));
const effectAudit = JSON.parse(await fs.readFile(effectAuditPath, "utf8"));
const manifest = JSON.parse(await fs.readFile(path.join(root, "data/wow/content-manifest.json"), "utf8"));

const sources = [
  {
    kind: "spell_en",
    locale: "en",
    table: "Spell",
    url: `https://wago.tools/db2/Spell/csv?build=${gameBuild}&locale=enUS`,
    fileName: `wago-spell-${gameBuild.split(".").at(-1)}-enUS.csv`,
    sha256: "33de201115bf105308094aaff270b0a2af59595b1e2f0d0803f6bb7fd5357c8e",
  },
  {
    kind: "spell_ru",
    locale: "ru",
    table: "Spell",
    url: `https://wago.tools/db2/Spell/csv?build=${gameBuild}&locale=ruRU`,
    fileName: `wago-spell-${gameBuild.split(".").at(-1)}-ruRU.csv`,
    sha256: "ac76bf4d60786aa21a4582a6081eb5436c0c1629e0943b279325f35b96876b2d",
  },
  {
    kind: "journal_section_en",
    locale: "en",
    table: "JournalEncounterSection",
    url: `https://wago.tools/db2/JournalEncounterSection/csv?build=${gameBuild}&locale=enUS`,
    fileName: `wago-journal-section-${gameBuild.split(".").at(-1)}-enUS.csv`,
    sha256: "749743a68e984821ebcaf4c2619fc89fafb47217d59fd9e6299d8e0ccd27cf18",
  },
  {
    kind: "journal_section_ru",
    locale: "ru",
    table: "JournalEncounterSection",
    url: `https://wago.tools/db2/JournalEncounterSection/csv?build=${gameBuild}&locale=ruRU`,
    fileName: `wago-journal-section-${gameBuild.split(".").at(-1)}-ruRU.csv`,
    sha256: "dfe7a41e9d066ae4002cbae51ee5907a58fd72bccddd899f1e077a00f4db3bd7",
  },
  {
    kind: "spell_name_en",
    locale: "en",
    table: "SpellName",
    url: `https://wago.tools/db2/SpellName/csv?build=${gameBuild}&locale=enUS`,
    fileName: `wago-spell-name-${gameBuild.split(".").at(-1)}-enUS.csv`,
    sha256: "99629cf0bc20d889d80df64d9be7dbd9be1498f958055e6f74de83be33927bc5",
  },
  {
    kind: "spell_name_ru",
    locale: "ru",
    table: "SpellName",
    url: `https://wago.tools/db2/SpellName/csv?build=${gameBuild}&locale=ruRU`,
    fileName: `wago-spell-name-${gameBuild.split(".").at(-1)}-ruRU.csv`,
    sha256: "082c3ead14f49ab8c965fc651588109e6a10c891899c584977589ed8e98b4f2c",
  },
  {
    kind: "spell_misc_en",
    locale: "en",
    table: "SpellMisc",
    url: `https://wago.tools/db2/SpellMisc/csv?build=${gameBuild}&locale=enUS`,
    fileName: `wago-spell-misc-${gameBuild.split(".").at(-1)}-enUS.csv`,
    sha256: "83e46ad55ed2cf1245a2358ecfb72889a434b1df5e1138b41208f4e134b65781",
  },
  {
    kind: "spell_duration_en",
    locale: "en",
    table: "SpellDuration",
    url: `https://wago.tools/db2/SpellDuration/csv?build=${gameBuild}&locale=enUS`,
    fileName: `wago-spell-duration-${gameBuild.split(".").at(-1)}-enUS.csv`,
    sha256: "ba8dd9dfdbd9866523db2c5d467af3849ead709d7df2e9322829d7751b02b2c5",
  },
  {
    kind: "rendered_guide_entombed_sentinels_en",
    locale: "en",
    table: "RenderedAdventureGuide",
    url: "https://warcraft.wiki.gg/wiki/Entombed_Sentinels",
    fileName: "warcraft-wiki-entombed-sentinels.html",
    hashMode: "normalized_ability_fragment",
    sha256: "2ae35ac11bdc6e92e71362866cc2162efeaff090e77676a7cdf8663761187ac4",
    sourcePriority: 3,
  },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function renderedVitriolicStasisEvidence(buffer) {
  const html = buffer.toString("utf8");
  const marker = '<span id="Ability:Vitriolic&#95;Stasis">';
  const start = html.indexOf(marker);
  const end = start >= 0 ? html.indexOf("</span>", start) : -1;
  if (start < 0 || end < 0) throw new Error("rendered Vitriolic Stasis fragment is missing");
  const fragment = html.slice(start, end + "</span>".length);
  const normalized = fragment
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#160;", " ")
    .replaceAll("&#8212;", "—")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();
  const duration = /\bover (\d+) Sec\./.exec(normalized);
  const reduction = /\bdamage taken by (\d+)%/.exec(normalized);
  return {
    spellId: 1284588,
    directSpellLink: fragment.includes('href="https://www.wowhead.com/spell=1284588"'),
    normalizedFragmentSha256: sha256(Buffer.from(normalized)),
    durationMs: duration ? Number(duration[1]) * 1_000 : null,
    reductionPercent: reduction ? Number(reduction[1]) : null,
  };
}

function resolvePinnedStaticModifierTokens(text, spellId, durationBySpellId, locale, renderedEvidence) {
  if (spellId !== 1284588 || (text.match(/\$s1/g) ?? []).length !== 1) return null;
  const duration = resolveExactDurationTokens(text, spellId, durationBySpellId, locale);
  if (!duration || renderedEvidence.durationMs !== duration.resolutions[0]?.durationMs) return null;
  const effect = effectAudit.evidence?.find((record) => record.key === "1284588:effect_value:$s1:1284588:0");
  const row = effect?.sourceRows?.[0];
  const effectMatches = effect?.sourceRows?.length === 1
    && row?.SpellID === 1284588
    && row?.DifficultyID === 0
    && row?.EffectIndex === 0
    && row?.Effect === 6
    && row?.EffectAura === 87
    && row?.EffectBasePointsF === -99
    && renderedEvidence.directSpellLink
    && renderedEvidence.reductionPercent === Math.abs(row.EffectBasePointsF);
  if (!effectMatches) return null;
  const description = duration.description.replace("$s1", String(renderedEvidence.reductionPercent));
  if (classifyDescription(description) !== "publication_safe") return null;
  return {
    description,
    durations: duration.resolutions,
    effects: [{
      token: "$s1",
      spellId: 1284588,
      effectIndex: 0,
      effect: 6,
      effectAura: 87,
      rawBasePoints: -99,
      renderedValue: renderedEvidence.reductionPercent,
    }],
  };
}

function parseCsv(buffer) {
  const input = buffer.toString("utf8");
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field || record.length > 0) {
    record.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    records.push(record);
  }
  const headers = records.shift() ?? [];
  return records
    .filter((row) => row.length > 1 || row[0] !== "")
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function classifyDescription(text) {
  if (!text) return "empty";
  if (/^\$@spell(?:desc|aura|name)\d+$/.test(text)) return "reference_only";
  if (text.includes("$") || /\|(?:c[0-9A-Fa-f]{8}|Hspell:|h|r)/.test(text)) return "tokenized";
  return "publication_safe";
}

function extractTokens(text) {
  return [...new Set([
    ...(text.match(/\$@?[A-Za-z][A-Za-z0-9_]*/g) ?? []),
    ...(text.match(/\$\[|\$\]/g) ?? []),
    ...(text.match(/\|(?:c[0-9A-Fa-f]{8}|Hspell:\d+|h|r)/g) ?? []),
  ])].sort();
}

function rawTextEvidence(text) {
  return {
    classification: classifyDescription(text),
    length: [...text].length,
    sha256: sha256(Buffer.from(text)),
    tokens: extractTokens(text),
  };
}

function resolveExactDescriptionReference(spellRows, spellId, visited = []) {
  if (visited.includes(spellId)) return null;
  const row = spellRows.get(spellId);
  if (!row) return null;
  const description = row.Description_lang;
  if (classifyDescription(description) === "publication_safe") {
    return { description, referencedSpellIds: [...visited, spellId] };
  }
  const match = /^\$@spelldesc(\d+)$/.exec(description);
  if (!match) return null;
  return resolveExactDescriptionReference(spellRows, Number(match[1]), [...visited, spellId]);
}

function resolveExactSpellNameTokens(text, spellNames) {
  const resolutions = [];
  let missing = false;
  const resolved = text.replace(/\$@spellname(\d+)/g, (token, rawSpellId) => {
    const spellId = Number(rawSpellId);
    const name = spellNames.get(spellId);
    if (!name) {
      missing = true;
      return token;
    }
    resolutions.push({ token, spellId, name, nameSha256: sha256(Buffer.from(name)) });
    return name;
  });
  if (missing || resolutions.length === 0) return null;
  return { description: resolved, resolutions };
}

function formatDuration(milliseconds, locale) {
  if (milliseconds % 60_000 === 0) return `${milliseconds / 60_000} ${locale === "ru" ? "мин" : "min"}`;
  const seconds = milliseconds / 1_000;
  return `${Number.isInteger(seconds) ? seconds : String(seconds).replace(/0+$/, "").replace(/\.$/, "")} ${locale === "ru" ? "сек" : "sec"}`;
}

function resolveExactDurationTokens(text, currentSpellId, durationBySpellId, locale) {
  const resolutions = [];
  let missing = false;
  const description = text.replace(/\$(\d*)d\b/g, (token, rawSpellId) => {
    const spellId = rawSpellId ? Number(rawSpellId) : currentSpellId;
    const duration = durationBySpellId.get(spellId);
    if (!duration || duration.durationMs <= 0) {
      missing = true;
      return token;
    }
    const formatted = formatDuration(duration.durationMs, locale);
    resolutions.push({ token, spellId, durationIndex: duration.durationIndex, durationMs: duration.durationMs, formatted });
    return formatted;
  });
  if (missing || resolutions.length === 0) return null;
  return { description, resolutions };
}

function countBy(values) {
  return Object.fromEntries(
    [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map())]
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function stableAuditProjection(audit) {
  return {
    schemaVersion: audit.schemaVersion,
    scope: audit.scope,
    gameBuild: audit.gameBuild,
    method: audit.method,
    publicationPolicy: audit.publicationPolicy,
    limitations: audit.limitations,
    sources: audit.sources,
    summary: audit.summary,
    abilities: audit.abilities,
  };
}

async function loadSourceBuffers() {
  const buffers = new Map();
  for (const source of sources) {
    let buffer;
    if (online) {
      const response = await fetch(source.url, {
        headers: { "user-agent": "GildraVenomousDescriptionAudit/1.0" },
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) throw new Error(`${source.kind} returned HTTP ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
    } else if (inputDir) {
      buffer = await fs.readFile(path.join(inputDir, source.fileName));
    } else {
      return null;
    }
    const digest = source.hashMode === "normalized_ability_fragment"
      ? renderedVitriolicStasisEvidence(buffer).normalizedFragmentSha256
      : sha256(buffer);
    if (digest !== source.sha256) throw new Error(`${source.kind} hash mismatch: ${digest}`);
    buffers.set(source.kind, buffer);
  }
  return buffers;
}

function buildAudit(buffers, verifiedAt) {
  const expectedAbilities = sourceAudit.encounters.flatMap((encounter) =>
    encounter.overviewAbilities.map((ability) => ({
      encounterSlug: encounter.canonicalSlug,
      journalEncounterId: encounter.journalEncounterId,
      spellId: ability.spellId,
      names: ability.names,
    })),
  );
  const spellIds = new Set(expectedAbilities.map((ability) => ability.spellId));
  const parsed = Object.fromEntries([...buffers]
    .filter(([kind]) => sources.find((source) => source.kind === kind)?.hashMode !== "normalized_ability_fragment")
    .map(([kind, buffer]) => [kind, parseCsv(buffer)]));
  const renderedEvidence = renderedVitriolicStasisEvidence(buffers.get("rendered_guide_entombed_sentinels_en"));
  const allSpellRows = {
    en: new Map(parsed.spell_en.map((row) => [Number(row.ID), row])),
    ru: new Map(parsed.spell_ru.map((row) => [Number(row.ID), row])),
  };
  const spellRows = {
    en: new Map([...allSpellRows.en].filter(([spellId]) => spellIds.has(spellId))),
    ru: new Map([...allSpellRows.ru].filter(([spellId]) => spellIds.has(spellId))),
  };
  const spellNames = {
    en: new Map(parsed.spell_name_en.map((row) => [Number(row.ID), row.Name_lang])),
    ru: new Map(parsed.spell_name_ru.map((row) => [Number(row.ID), row.Name_lang])),
  };
  const durationRows = new Map(parsed.spell_duration_en.map((row) => [Number(row.ID), row]));
  const miscRowsBySpellId = Map.groupBy(parsed.spell_misc_en, (row) => Number(row.SpellID));
  const durationBySpellId = new Map([...miscRowsBySpellId].flatMap(([spellId, rowsForSpell]) => {
    const misc = rowsForSpell
      .sort((left, right) => (Number(left.DifficultyID) === 0 ? -1 : 1) - (Number(right.DifficultyID) === 0 ? -1 : 1) || Number(left.ID) - Number(right.ID))[0];
    const durationIndex = Number(misc?.DurationIndex);
    const duration = durationRows.get(durationIndex);
    const durationMs = Number(duration?.Duration);
    return Number.isInteger(durationIndex) && Number.isInteger(durationMs)
      ? [[spellId, { durationIndex, durationMs }]]
      : [];
  }));
  const sectionRows = {
    en: parsed.journal_section_en.filter((row) => spellIds.has(Number(row.SpellID))),
    ru: parsed.journal_section_ru.filter((row) => spellIds.has(Number(row.SpellID))),
  };

  for (const locale of ["en", "ru"]) {
    if (spellRows[locale].size !== expectedAbilities.length) {
      throw new Error(`${locale} Spell coverage is ${spellRows[locale].size}/${expectedAbilities.length}`);
    }
  }

  const abilities = expectedAbilities.map((ability) => {
    const localized = {};
    for (const locale of ["en", "ru"]) {
      const spellRow = spellRows[locale].get(ability.spellId);
      const description = spellRow.Description_lang;
      const auraDescription = spellRow.AuraDescription_lang;
      const linkedSections = sectionRows[locale]
        .filter((row) => Number(row.SpellID) === ability.spellId)
        .map((row) => ({
          sectionId: Number(row.ID),
          difficultyMask: Number(row.DifficultyMask),
          titleClassification: /^Section \d+$|^Раздел \d+$/.test(row.Title_lang) ? "generic" : "localized_name",
          titleSha256: sha256(Buffer.from(row.Title_lang)),
          bodyClassification: classifyDescription(row.BodyText_lang),
          bodyLength: [...row.BodyText_lang].length,
          bodySha256: sha256(Buffer.from(row.BodyText_lang)),
          ...(classifyDescription(row.BodyText_lang) === "publication_safe"
            ? { bodyText: row.BodyText_lang }
            : {}),
        }))
        .sort((left, right) => left.sectionId - right.sectionId || left.difficultyMask - right.difficultyMask);
      localized[locale] = {
        description: rawTextEvidence(description),
        auraDescription: rawTextEvidence(auraDescription),
        journalSections: linkedSections,
      };
    }
    const spellDescriptionsAreSafe = localized.en.description.classification === "publication_safe"
      && localized.ru.description.classification === "publication_safe";
    const exactReferencePair = {
      en: resolveExactDescriptionReference(allSpellRows.en, ability.spellId),
      ru: resolveExactDescriptionReference(allSpellRows.ru, ability.spellId),
    };
    const exactReferenceIsSafe = Boolean(
      exactReferencePair.en
      && exactReferencePair.ru
      && exactReferencePair.en.referencedSpellIds.length > 1
      && JSON.stringify(exactReferencePair.en.referencedSpellIds) === JSON.stringify(exactReferencePair.ru.referencedSpellIds),
    );
    const exactSpellNamePair = {
      en: resolveExactSpellNameTokens(spellRows.en.get(ability.spellId).Description_lang, spellNames.en),
      ru: resolveExactSpellNameTokens(spellRows.ru.get(ability.spellId).Description_lang, spellNames.ru),
    };
    const exactSpellNamesAreSafe = Boolean(
      exactSpellNamePair.en
      && exactSpellNamePair.ru
      && classifyDescription(exactSpellNamePair.en.description) === "publication_safe"
      && classifyDescription(exactSpellNamePair.ru.description) === "publication_safe"
      && JSON.stringify(exactSpellNamePair.en.resolutions.map((resolution) => resolution.spellId))
        === JSON.stringify(exactSpellNamePair.ru.resolutions.map((resolution) => resolution.spellId)),
    );
    const supportedTokenPair = Object.fromEntries(["en", "ru"].map((locale) => {
      const raw = spellRows[locale].get(ability.spellId).Description_lang;
      const names = resolveExactSpellNameTokens(raw, spellNames[locale]);
      const durations = resolveExactDurationTokens(names?.description ?? raw, ability.spellId, durationBySpellId, locale);
      return [locale, durations ? { description: durations.description, spellNames: names?.resolutions ?? [], durations: durations.resolutions } : null];
    }));
    const supportedTokensAreSafe = Boolean(
      supportedTokenPair.en
      && supportedTokenPair.ru
      && classifyDescription(supportedTokenPair.en.description) === "publication_safe"
      && classifyDescription(supportedTokenPair.ru.description) === "publication_safe"
      && JSON.stringify(supportedTokenPair.en.spellNames.map((resolution) => resolution.spellId))
        === JSON.stringify(supportedTokenPair.ru.spellNames.map((resolution) => resolution.spellId))
      && JSON.stringify(supportedTokenPair.en.durations.map((resolution) => [resolution.spellId, resolution.durationIndex, resolution.durationMs]))
        === JSON.stringify(supportedTokenPair.ru.durations.map((resolution) => [resolution.spellId, resolution.durationIndex, resolution.durationMs])),
    );
    const pinnedStaticModifierPair = Object.fromEntries(["en", "ru"].map((locale) => {
      const raw = spellRows[locale].get(ability.spellId).Description_lang;
      return [locale, resolvePinnedStaticModifierTokens(raw, ability.spellId, durationBySpellId, locale, renderedEvidence)];
    }));
    const pinnedStaticModifierIsSafe = Boolean(
      pinnedStaticModifierPair.en
      && pinnedStaticModifierPair.ru
      && JSON.stringify(pinnedStaticModifierPair.en.durations.map((resolution) => [resolution.spellId, resolution.durationIndex, resolution.durationMs]))
        === JSON.stringify(pinnedStaticModifierPair.ru.durations.map((resolution) => [resolution.spellId, resolution.durationIndex, resolution.durationMs]))
      && JSON.stringify(pinnedStaticModifierPair.en.effects) === JSON.stringify(pinnedStaticModifierPair.ru.effects),
    );
    const safeJournalPair = localized.en.journalSections
      .filter((section) => section.bodyClassification === "publication_safe")
      .map((section) => ({
        en: section,
        ru: localized.ru.journalSections.find((candidate) =>
          candidate.sectionId === section.sectionId && candidate.bodyClassification === "publication_safe"),
      }))
      .find((pair) => pair.ru);
    const publicationCandidate = spellDescriptionsAreSafe
      ? {
          sourceKind: "spell_description",
          sectionId: null,
          descriptions: {
            en: spellRows.en.get(ability.spellId).Description_lang,
            ru: spellRows.ru.get(ability.spellId).Description_lang,
          },
          sourceUrls: {
            en: sources.find((source) => source.kind === "spell_en").url,
            ru: sources.find((source) => source.kind === "spell_ru").url,
          },
        }
      : exactReferenceIsSafe
        ? {
            sourceKind: "spell_description_reference",
            sectionId: null,
            referencedSpellIds: exactReferencePair.en.referencedSpellIds,
            descriptions: {
              en: exactReferencePair.en.description,
              ru: exactReferencePair.ru.description,
            },
            sourceUrls: {
              en: sources.find((source) => source.kind === "spell_en").url,
              ru: sources.find((source) => source.kind === "spell_ru").url,
            },
          }
      : exactSpellNamesAreSafe
        ? {
            sourceKind: "spell_description_spell_names",
            sectionId: null,
            descriptions: {
              en: exactSpellNamePair.en.description,
              ru: exactSpellNamePair.ru.description,
            },
            spellNameResolutions: {
              en: exactSpellNamePair.en.resolutions,
              ru: exactSpellNamePair.ru.resolutions,
            },
            sourceUrls: {
              en: sources.find((source) => source.kind === "spell_en").url,
              ru: sources.find((source) => source.kind === "spell_ru").url,
              spellNameEn: sources.find((source) => source.kind === "spell_name_en").url,
              spellNameRu: sources.find((source) => source.kind === "spell_name_ru").url,
            },
          }
      : supportedTokensAreSafe
        ? {
            sourceKind: "spell_description_spell_names_duration",
            sectionId: null,
            descriptions: { en: supportedTokenPair.en.description, ru: supportedTokenPair.ru.description },
            spellNameResolutions: { en: supportedTokenPair.en.spellNames, ru: supportedTokenPair.ru.spellNames },
            durationResolutions: { en: supportedTokenPair.en.durations, ru: supportedTokenPair.ru.durations },
            sourceUrls: {
              en: sources.find((source) => source.kind === "spell_en").url,
              ru: sources.find((source) => source.kind === "spell_ru").url,
              spellNameEn: sources.find((source) => source.kind === "spell_name_en").url,
              spellNameRu: sources.find((source) => source.kind === "spell_name_ru").url,
              spellMisc: sources.find((source) => source.kind === "spell_misc_en").url,
              spellDuration: sources.find((source) => source.kind === "spell_duration_en").url,
            },
          }
      : pinnedStaticModifierIsSafe
        ? {
            sourceKind: "spell_description_static_modifier_duration",
            sectionId: null,
            descriptions: { en: pinnedStaticModifierPair.en.description, ru: pinnedStaticModifierPair.ru.description },
            durationResolutions: { en: pinnedStaticModifierPair.en.durations, ru: pinnedStaticModifierPair.ru.durations },
            effectResolutions: { en: pinnedStaticModifierPair.en.effects, ru: pinnedStaticModifierPair.ru.effects },
            renderedGuideEvidence: renderedEvidence,
            sourceUrls: {
              en: sources.find((source) => source.kind === "spell_en").url,
              ru: sources.find((source) => source.kind === "spell_ru").url,
              spellMisc: sources.find((source) => source.kind === "spell_misc_en").url,
              spellDuration: sources.find((source) => source.kind === "spell_duration_en").url,
              spellEffect: effectAudit.sources.find((source) => source.table === "SpellEffect").url,
              renderedGuide: sources.find((source) => source.kind === "rendered_guide_entombed_sentinels_en").url,
            },
          }
      : safeJournalPair
        ? {
            sourceKind: "journal_body",
            sectionId: safeJournalPair.en.sectionId,
            descriptions: {
              en: safeJournalPair.en.bodyText,
              ru: safeJournalPair.ru.bodyText,
            },
            sourceUrls: {
              en: sources.find((source) => source.kind === "journal_section_en").url,
              ru: sources.find((source) => source.kind === "journal_section_ru").url,
            },
          }
        : null;
    return {
      encounterSlug: ability.encounterSlug,
      journalEncounterId: ability.journalEncounterId,
      spellId: ability.spellId,
      names: ability.names,
      publicationSafe: Boolean(publicationCandidate),
      publicationCandidate,
      localeClassificationMatch:
        localized.en.description.classification === localized.ru.description.classification,
      localized,
    };
  });

  const localeSummary = Object.fromEntries(["en", "ru"].map((locale) => {
    const descriptions = abilities.map((ability) => ability.localized[locale].description.classification);
    const auraDescriptions = abilities.map((ability) => ability.localized[locale].auraDescription.classification);
    const journalRows = abilities.flatMap((ability) => ability.localized[locale].journalSections);
    return [locale, {
      spellRows: abilities.length,
      descriptionClassifications: countBy(descriptions),
      auraDescriptionClassifications: countBy(auraDescriptions),
      journalSectionRows: journalRows.length,
      journalUniqueSpells: abilities.filter((ability) => ability.localized[locale].journalSections.length > 0).length,
      journalBodyClassifications: countBy(journalRows.map((row) => row.bodyClassification)),
      journalTitleClassifications: countBy(journalRows.map((row) => row.titleClassification)),
      journalDifficultyMasks: countBy(journalRows.map((row) => String(row.difficultyMask))),
    }];
  }));

  return {
    schemaVersion: 1,
    scope: "venomous-abyss-live-overview-ability-descriptions",
    gameBuild,
    lastVerifiedAt: verifiedAt,
    method: "Exact ID selection from build-pinned Spell and JournalEncounterSection DB2 exports in EN and RU. Raw text is represented by hashes, lengths, token inventories, and classifications; no unresolved client tokens are published as prose.",
    publicationPolicy: "An ability description is publication-safe only when exact-build EN and RU text is non-empty and contains no unresolved $-tokens. A full-string $@spelldesc<ID> reference may be followed recursively only when both locales resolve through the same exact ID chain to token-free text in the same pinned Spell export. In-text $@spellname<ID> tokens may be replaced only through the same exact ID sequence in build-pinned EN/RU SpellName exports. Current-spell $d may be formatted only from an exact DifficultyID=0 SpellMisc.DurationIndex and matching SpellDuration row, with the same duration evidence for both locales. Vitriolic Stasis spell 1284588 is the sole effect-value allowlist: exact Effect=6/Aura=87/BasePoints=-99 metadata and 30000 ms duration must agree with a source-linked rendered Adventure Guide fragment for the same spell ID before the locale-native EN/RU templates may render 99% and 30 sec. The final result must contain no other client token or WoW markup. A directly linked Journal BodyText pair is otherwise eligible when both locale bodies are token-free; empty Journal bodies cannot substitute for descriptions.",
    limitations: [
      "DB2 Spell descriptions require client-side token and effect-value resolution before they can be displayed as player-facing prose.",
      "Only full-string $@spelldesc<ID> references, exact-ID spell names, durations backed by SpellMisc plus SpellDuration, and the one explicitly cross-rendered Vitriolic Stasis static modifier are resolved here; all other effect values, periods, radii, difficulty conditionals, and grammar tokens remain unresolved and unpublished.",
      "Most selected JournalEncounterSection rows contain titles and linkage but no player-facing BodyText; only exact paired non-empty bodies are eligible.",
      "This audit does not prove tactics, mechanic tags, role assignments, timings, difficulty deltas, or effect values.",
    ],
    sources: sources.map(({ fileName: _fileName, locale, table, ...source }) => ({ ...source, locale, table })),
    summary: {
      expectedAbilities: abilities.length,
      publicationSafeAbilities: abilities.filter((ability) => ability.publicationSafe).length,
      withheldAbilities: abilities.filter((ability) => !ability.publicationSafe).length,
      localeClassificationMismatches: abilities.filter((ability) => !ability.localeClassificationMatch).length,
      locales: localeSummary,
    },
    abilities,
  };
}

const issues = [];
const check = (condition, issue) => { if (!condition) issues.push(issue); };
let audit;
try {
  audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
} catch (error) {
  if (!write) throw error;
}

const sourceBuffers = await loadSourceBuffers();
if (sourceBuffers) {
  const generated = buildAudit(sourceBuffers, audit?.lastVerifiedAt ?? new Date().toISOString());
  if (write) {
    generated.lastVerifiedAt = new Date().toISOString();
    await fs.writeFile(auditPath, `${JSON.stringify(generated, null, 2)}\n`);
    audit = generated;
  } else {
    check(
      JSON.stringify(stableAuditProjection(audit)) === JSON.stringify(stableAuditProjection(generated)),
      "pinned-description-audit-does-not-match-source-bytes",
    );
  }
}

check(audit?.schemaVersion === 1, "audit-schema-version-invalid");
check(audit?.gameBuild === gameBuild, "audit-build-mismatch");
check(Number.isFinite(Date.parse(audit?.lastVerifiedAt)), "audit-last-verified-invalid");
check(audit?.summary?.expectedAbilities === 37, `ability-count-invalid:${audit?.summary?.expectedAbilities}`);
check(audit?.summary?.publicationSafeAbilities === 12, `safe-count-invalid:${audit?.summary?.publicationSafeAbilities}`);
check(audit?.summary?.withheldAbilities === 25, `withheld-count-invalid:${audit?.summary?.withheldAbilities}`);
check(audit?.summary?.locales?.en?.journalSectionRows === 68, `en-journal-row-count:${audit?.summary?.locales?.en?.journalSectionRows}`);
check(audit?.summary?.locales?.ru?.journalSectionRows === 68, `ru-journal-row-count:${audit?.summary?.locales?.ru?.journalSectionRows}`);
check(audit?.summary?.locales?.en?.journalBodyClassifications?.empty === 64, "en-journal-empty-count-invalid");
check(audit?.summary?.locales?.ru?.journalBodyClassifications?.empty === 64, "ru-journal-empty-count-invalid");
check(audit?.summary?.locales?.en?.journalBodyClassifications?.tokenized === 4, "en-journal-tokenized-count-invalid");
check(audit?.summary?.locales?.ru?.journalBodyClassifications?.tokenized === 4, "ru-journal-tokenized-count-invalid");

const auditedSpellIds = new Set();
for (const ability of audit?.abilities ?? []) {
  check(Number.isInteger(ability.spellId) && ability.spellId > 0, `spell-id-invalid:${ability.spellId}`);
  check(!auditedSpellIds.has(ability.spellId), `spell-id-duplicate:${ability.spellId}`);
  auditedSpellIds.add(ability.spellId);
  check(ability.publicationSafe === Boolean(ability.publicationCandidate), `ability-publication-state-inconsistent:${ability.spellId}`);
  check(Boolean(ability.names?.en && ability.names?.ru), `ability-name-missing:${ability.spellId}`);
  for (const locale of ["en", "ru"]) {
    const evidence = ability.localized?.[locale]?.description;
    check(["publication_safe", "tokenized", "reference_only"].includes(evidence?.classification), `description-classification-invalid:${locale}:${ability.spellId}`);
    check(/^[0-9a-f]{64}$/.test(evidence?.sha256 ?? ""), `description-hash-invalid:${locale}:${ability.spellId}`);
    if (evidence?.classification !== "publication_safe") {
      check((evidence?.tokens?.length ?? 0) > 0, `description-token-evidence-missing:${locale}:${ability.spellId}`);
    }
  }
  const manifestAbility = manifest.abilities.find((row) => row.refs?.spellId === ability.spellId);
  check(Boolean(manifestAbility), `manifest-ability-missing:${ability.spellId}`);
  check(manifestAbility?.build === gameBuild, `manifest-build-mismatch:${ability.spellId}`);
  if (ability.publicationCandidate) {
    check(
      manifestAbility?.descriptions?.en === ability.publicationCandidate.descriptions.en
        && manifestAbility?.descriptions?.ru === ability.publicationCandidate.descriptions.ru,
      `verified-description-not-published:${ability.spellId}`,
    );
    check(manifestAbility?.descriptionVerificationStatus === "verified", `description-status-missing:${ability.spellId}`);
    check(manifestAbility?.descriptionSourceKind === ability.publicationCandidate.sourceKind, `description-source-kind-mismatch:${ability.spellId}`);
    check(
      classifyDescription(manifestAbility?.descriptions?.en ?? "") === "publication_safe"
        && classifyDescription(manifestAbility?.descriptions?.ru ?? "") === "publication_safe",
      `verified-description-still-tokenized:${ability.spellId}`,
    );
    if (ability.publicationCandidate.sourceKind === "spell_description_reference") {
      check(
        JSON.stringify(manifestAbility?.descriptionReferenceSpellIds) === JSON.stringify(ability.publicationCandidate.referencedSpellIds),
        `description-reference-chain-mismatch:${ability.spellId}`,
      );
    }
    if (ability.publicationCandidate.sourceKind === "spell_description_spell_names") {
      const expectedIds = ability.publicationCandidate.spellNameResolutions.en.map((resolution) => resolution.spellId);
      check(
        JSON.stringify(manifestAbility?.descriptionSpellNameIds) === JSON.stringify(expectedIds),
        `description-spell-name-ids-mismatch:${ability.spellId}`,
      );
      check(
        manifestAbility?.sourceUrls?.descriptionSpellNameEn === ability.publicationCandidate.sourceUrls.spellNameEn
          && manifestAbility?.sourceUrls?.descriptionSpellNameRu === ability.publicationCandidate.sourceUrls.spellNameRu,
        `description-spell-name-source-mismatch:${ability.spellId}`,
      );
    }
    if (ability.publicationCandidate.sourceKind === "spell_description_spell_names_duration") {
      const expectedNameIds = ability.publicationCandidate.spellNameResolutions.en.map((resolution) => resolution.spellId);
      const expectedDurations = ability.publicationCandidate.durationResolutions.en.map(({ spellId, durationIndex, durationMs }) => ({ spellId, durationIndex, durationMs }));
      check(JSON.stringify(manifestAbility?.descriptionSpellNameIds) === JSON.stringify(expectedNameIds), `description-duration-name-ids-mismatch:${ability.spellId}`);
      check(JSON.stringify(manifestAbility?.descriptionDurations) === JSON.stringify(expectedDurations), `description-duration-evidence-mismatch:${ability.spellId}`);
      check(
        manifestAbility?.sourceUrls?.descriptionSpellMisc === ability.publicationCandidate.sourceUrls.spellMisc
          && manifestAbility?.sourceUrls?.descriptionSpellDuration === ability.publicationCandidate.sourceUrls.spellDuration,
        `description-duration-source-mismatch:${ability.spellId}`,
      );
    }
    if (ability.publicationCandidate.sourceKind === "spell_description_static_modifier_duration") {
      const expectedDurations = ability.publicationCandidate.durationResolutions.en.map(({ spellId, durationIndex, durationMs }) => ({ spellId, durationIndex, durationMs }));
      const expectedEffects = ability.publicationCandidate.effectResolutions.en;
      check(JSON.stringify(manifestAbility?.descriptionDurations) === JSON.stringify(expectedDurations), `description-static-duration-evidence-mismatch:${ability.spellId}`);
      check(JSON.stringify(manifestAbility?.descriptionEffects) === JSON.stringify(expectedEffects), `description-static-effect-evidence-mismatch:${ability.spellId}`);
      check(
        manifestAbility?.sourceUrls?.descriptionSpellMisc === ability.publicationCandidate.sourceUrls.spellMisc
          && manifestAbility?.sourceUrls?.descriptionSpellDuration === ability.publicationCandidate.sourceUrls.spellDuration
          && manifestAbility?.sourceUrls?.descriptionSpellEffect === ability.publicationCandidate.sourceUrls.spellEffect
          && manifestAbility?.sourceUrls?.descriptionRenderedGuide === ability.publicationCandidate.sourceUrls.renderedGuide,
        `description-static-source-mismatch:${ability.spellId}`,
      );
      check(
        manifestAbility?.descriptionRenderedGuideEvidence?.spellId === ability.spellId
          && manifestAbility?.descriptionRenderedGuideEvidence?.normalizedFragmentSha256 === ability.publicationCandidate.renderedGuideEvidence.normalizedFragmentSha256
          && manifestAbility?.descriptionRenderedGuideEvidence?.directSpellLink === true,
        `description-rendered-guide-evidence-mismatch:${ability.spellId}`,
      );
    }
  } else {
    check(manifestAbility?.descriptions?.en == null && manifestAbility?.descriptions?.ru == null, `unresolved-description-published:${ability.spellId}`);
    check(manifestAbility?.descriptionVerificationStatus === "withheld_unresolved_tokens", `withheld-status-missing:${ability.spellId}`);
  }
  check(manifestAbility?.verificationStatus === "identity_only", `description-status-overclaimed:${ability.spellId}`);
}
check(auditedSpellIds.size === 37, `audited-spell-count-invalid:${auditedSpellIds.size}`);

for (const source of audit?.sources ?? []) {
  check(
    /^https:\/\/wago\.tools\/db2\//.test(source.url)
      || source.url === "https://warcraft.wiki.gg/wiki/Entombed_Sentinels",
    `source-url-invalid:${source.kind}`,
  );
  check(/^[0-9a-f]{64}$/.test(source.sha256 ?? ""), `source-hash-invalid:${source.kind}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  gameBuild,
  online,
  sourceBytesCompared: Boolean(sourceBuffers),
  abilities: audit?.summary?.expectedAbilities ?? 0,
  publicationSafeAbilities: audit?.summary?.publicationSafeAbilities ?? null,
  withheldAbilities: audit?.summary?.withheldAbilities ?? null,
  journalRowsPerLocale: audit?.summary?.locales?.en?.journalSectionRows ?? null,
  journalNonEmptyBodies: 136
    - (audit?.summary?.locales?.en?.journalBodyClassifications?.empty ?? 0)
    - (audit?.summary?.locales?.ru?.journalBodyClassifications?.empty ?? 0),
  verified: issues.length === 0,
  violations: issues.length,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify({ summary, issues }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && issues.length > 0) process.exitCode = 1;
