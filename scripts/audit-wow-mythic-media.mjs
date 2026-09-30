import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (file) => fs.readFile(path.join(root, file), "utf8");
const [rubyRoutes, dungeonRoutes, rubyMediaSource, seasonAbilitySource, seasonEnemySource, sourceAuditSource, npcSourceAuditSource] = await Promise.all([
  read("components/wow/mythic/rubyLifePoolsData.ts"),
  read("components/wow/mythic/dungeonRoutes.ts"),
  read("components/wow/mythic/rubyLifePoolsMedia.ts"),
  read("components/wow/mythic/seasonTwoMedia.json"),
  read("components/wow/mythic/seasonTwoEnemyMedia.json"),
  read("data/wow/mythic-ability-source-audit.json"),
  read("data/wow/mythic-npc-source-audit.json"),
]);

const seasonAbilities = JSON.parse(seasonAbilitySource);
const seasonEnemies = JSON.parse(seasonEnemySource);
const sourceAudit = JSON.parse(sourceAuditSource);
const npcSourceAudit = JSON.parse(npcSourceAuditSource);
const rejectedAbilityNames = new Set(sourceAudit.rejectedNames.map((row) => row.name));
const rejectedNpcLinks = new Set(npcSourceAudit.rejectedLinks.map((row) => `${row.name}:${row.rejectedNpcId}`));
const mustNotBeEnemyLabels = new Set(npcSourceAudit.mustNotBeEnemyLabels ?? []);
const rubyAbilities = Object.fromEntries([...rubyMediaSource.matchAll(/^\s*"([^"]+)": \{ spellId: (\d+), iconName: "([^"]+)", iconUrl: "([^"]+)" \}/gm)]
  .map((match) => [match[1], { spellId: Number(match[2]), iconName: match[3], iconUrl: match[4] }]));
const rubyEnemies = Object.fromEntries([...rubyMediaSource.matchAll(/^\s*"([^"]+)": \{ ([^}\n]+) \},$/gm)]
  .map((match) => {
    const body = match[2];
    const npcId = Number(body.match(/\bnpcId: (\d+)/)?.[1]);
    if (!Number.isInteger(npcId) || npcId <= 0) return null;
    const stringField = (name) => body.match(new RegExp(`\\b${name}: "([^"]+)"`))?.[1];
    const booleanField = (name) => body.match(new RegExp(`\\b${name}: (true|false)`))?.[1] === "true";
    return [match[1], {
      npcId,
      portraitUrl: stringField("portraitUrl"),
      identityVerified: booleanField("identityVerified"),
      identitySourceUrl: stringField("identitySourceUrl"),
      identityLastVerifiedAt: stringField("identityLastVerifiedAt"),
      portraitVerified: booleanField("portraitVerified"),
      portraitStatus: stringField("portraitStatus"),
      portraitSourceUrl: stringField("portraitSourceUrl"),
      portraitLastVerifiedAt: stringField("portraitLastVerifiedAt"),
    }];
  })
  .filter(Boolean));
const abilityMedia = { ...rubyAbilities, ...seasonAbilities };
const enemyMedia = { ...rubyEnemies, ...seasonEnemies };

const usedAbilities = new Set([...rubyRoutes.matchAll(/\{ name: "([^"]+)", action:/g)].map((match) => match[1]));
for (const match of dungeonRoutes.matchAll(/\["([^"]+)",\s*"(?:Кик|Стоп|Диспел|Пурж|Уклонение|Защита|Фокус)"/g)) usedAbilities.add(match[1]);
const usedEnemies = new Set([...rubyRoutes.matchAll(/\{ name: "([^"]+)", count:/g)].map((match) => match[1]));
for (const match of dungeonRoutes.matchAll(/\["([^"]+)",\s*\d+,\s*"(?:low|medium|high|boss)"/g)) usedEnemies.add(match[1]);

const localAssetIssue = async (url) => {
  if (!url?.startsWith("/assets/")) return null;
  try {
    const stat = await fs.stat(path.join(root, "public", url));
    return stat.isFile() && stat.size > 0 ? null : "local-media-empty";
  } catch {
    return "local-media-missing";
  }
};

const abilityRows = await Promise.all([...usedAbilities].sort().map(async (name) => {
  const media = abilityMedia[name];
  const issues = [];
  if (!media) issues.push("media-record-missing");
  if (media && (!Number.isInteger(media.spellId) || media.spellId <= 0)) issues.push("spell-id-invalid");
  if (media && !media.iconName) issues.push("icon-name-missing");
  const assetIssue = await localAssetIssue(media?.iconUrl);
  if (assetIssue) issues.push(assetIssue);
  return {
    name,
    spellId: media?.spellId ?? null,
    iconId: media?.iconId ?? null,
    iconName: media?.iconName ?? null,
    iconUrl: media?.iconUrl ?? null,
    identitySourceUrl: media?.identitySourceUrl ?? null,
    iconMappingSourceUrl: media?.iconMappingSourceUrl ?? null,
    actorEvidenceUrl: media?.actorEvidenceUrl ?? null,
    lastVerifiedAt: media?.lastVerifiedAt ?? null,
    issues,
    inventoryComplete: issues.length === 0,
  };
}));

const enemyRows = await Promise.all([...usedEnemies].sort().map(async (name) => {
  const media = enemyMedia[name];
  const issues = [];
  if (!media) issues.push("media-record-missing");
  if (media && (!Number.isInteger(media.npcId) || media.npcId <= 0)) issues.push("npc-id-invalid");
  const assetIssue = await localAssetIssue(media?.portraitUrl);
  if (assetIssue) issues.push(assetIssue);
  return {
    name,
    npcId: media?.npcId ?? null,
    portraitUrl: media?.portraitUrl ?? null,
    identityVerified: media?.identityVerified === true,
    identitySourceUrl: media?.identitySourceUrl ?? null,
    identityLastVerifiedAt: media?.identityLastVerifiedAt ?? null,
    portraitVerified: media?.portraitVerified === true,
    portraitStatus: media?.portraitStatus ?? null,
    portraitSourceUrl: media?.portraitSourceUrl ?? null,
    portraitLastVerifiedAt: media?.portraitLastVerifiedAt ?? null,
    issues,
    inventoryComplete: issues.length === 0,
  };
}));

const summary = {
  generatedAt: new Date().toISOString(),
  scope: "local route/media inventory only; no gameplay or API verification",
  abilitiesUsed: abilityRows.length,
  abilitiesWithCompleteLocalInventory: abilityRows.filter((row) => row.inventoryComplete).length,
  abilityInventoryViolations: abilityRows.filter((row) => !row.inventoryComplete).length,
  enemiesUsed: enemyRows.length,
  enemiesWithCompleteLocalInventory: enemyRows.filter((row) => row.inventoryComplete).length,
  enemyInventoryViolations: enemyRows.filter((row) => !row.inventoryComplete).length,
  rejectedNpcLinksUsed: enemyRows.filter((row) => rejectedNpcLinks.has(`${row.name}:${row.npcId}`)).length,
  invalidNpcLabelsUsed: enemyRows.filter((row) => mustNotBeEnemyLabels.has(row.name)).length,
  rejectedAbilityNamesUsed: abilityRows.filter((row) => rejectedAbilityNames.has(row.name)).length,
  sourceAuditBuild: sourceAudit.gameBuild,
  sourceAuditLastVerifiedAt: sourceAudit.lastVerifiedAt,
  npcSourceAuditLastVerifiedAt: npcSourceAudit.lastVerifiedAt,
};
const outputPath = path.join(root, "docs/reports/wow/mythic-media-inventory.json");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ summary, abilities: abilityRows, enemies: enemyRows }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (process.argv.includes("--strict") && (summary.abilityInventoryViolations || summary.enemyInventoryViolations || summary.rejectedAbilityNamesUsed || summary.rejectedNpcLinksUsed || summary.invalidNpcLabelsUsed)) process.exitCode = 1;
