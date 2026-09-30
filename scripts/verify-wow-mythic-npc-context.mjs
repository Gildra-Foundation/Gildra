import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const timeoutMs = Math.max(5_000, Number(process.env.MYTHIC_CONTEXT_TIMEOUT_MS ?? 30_000) || 30_000);
const userAgent = "GildraMythicNpcContextVerifier/1.0";
const routeBlocks = {
  altarOfFangs: "altar-of-fangs",
  murderRow: "murder-row",
  denOfNalorakk: "den-of-nalorakk",
  blindingVale: "the-blinding-vale",
  voidscarArena: "voidscar-arena",
  kingsRest: "kings-rest",
  templeOfSethraliss: "temple-of-sethraliss",
};

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${response.status}:${url}`);
  return response.text();
}

function extractEnemyNames(source, pattern) {
  return new Set([...source.matchAll(pattern)].map((match) => match[1]));
}

const [rubyRoutes, dungeonRoutes, rubyMediaSource, seasonMediaSource] = await Promise.all([
  fs.readFile(path.join(root, "components/wow/mythic/rubyLifePoolsData.ts"), "utf8"),
  fs.readFile(path.join(root, "components/wow/mythic/dungeonRoutes.ts"), "utf8"),
  fs.readFile(path.join(root, "components/wow/mythic/rubyLifePoolsMedia.ts"), "utf8"),
  fs.readFile(path.join(root, "components/wow/mythic/seasonTwoEnemyMedia.json"), "utf8"),
]);

const routeEnemies = {
  "ruby-life-pools": extractEnemyNames(rubyRoutes, /\{ name: "([^"]+)", count:/g),
};
for (const [variable, slug] of Object.entries(routeBlocks)) {
  const start = dungeonRoutes.indexOf(`const ${variable} = buildStops([`);
  const end = dungeonRoutes.indexOf("\n]);", start);
  if (start < 0 || end < 0) throw new Error(`Unable to isolate route block: ${variable}`);
  routeEnemies[slug] = extractEnemyNames(
    dungeonRoutes.slice(start, end),
    /\["([^"]+)",\s*\d+,\s*"(?:low|medium|high|boss)"/g,
  );
}

const rubyMedia = Object.fromEntries([...rubyMediaSource.matchAll(/^\s*"([^"]+)": \{ npcId: (\d+), portraitUrl:/gm)]
  .map((match) => [match[1], { npcId: Number(match[2]) }]));
const media = { ...rubyMedia, ...JSON.parse(seasonMediaSource) };

const versionPageUrl = "https://keystone.guru/routes/expansion/midnight";
const versionPage = await fetchText(versionPageUrl);
const sourceVersion = versionPage.match(/compiled\\?\/(v[0-9.]+)/)?.[1];
if (!sourceVersion) throw new Error(`Unable to discover Keystone.guru data version from ${versionPageUrl}`);

const dungeonSources = Object.fromEntries(await Promise.all(Object.keys(routeEnemies).map(async (slug) => {
  const sourceUrl = `https://assets.keystone.guru/compiled/${sourceVersion}/mapcontext/data/${slug}/en_US.js`;
  const source = await fetchText(sourceUrl);
  const serialized = source.match(/let mapContextDungeonData = (.*);$/s)?.[1];
  if (!serialized) throw new Error(`Unable to parse map context: ${sourceUrl}`);
  const parsed = JSON.parse(serialized);
  if (!Array.isArray(parsed.dungeonNpcs)) throw new Error(`Missing dungeonNpcs: ${sourceUrl}`);
  return [slug, { sourceUrl, rows: parsed.dungeonNpcs }];
})));

const entities = [];
for (const [dungeonSlug, names] of Object.entries(routeEnemies)) {
  const source = dungeonSources[dungeonSlug];
  for (const name of [...names].sort()) {
    const npcId = media[name]?.npcId ?? null;
    const sourceCandidates = source.rows.filter((row) => row.name === name).map((row) => row.id);
    const issues = [];
    if (!Number.isInteger(npcId) || npcId <= 0) issues.push("route-media-npc-id-missing");
    if (sourceCandidates.length === 0) issues.push("route-context-exact-name-missing");
    else if (!sourceCandidates.includes(npcId)) issues.push("route-context-npc-id-mismatch");
    entities.push({
      dungeonSlug,
      name,
      npcId,
      sourceCandidates,
      sourceUrl: source.sourceUrl,
      contextVerified: issues.length === 0,
      issues,
    });
  }
}

const issueCounts = Object.fromEntries([...new Set(entities.flatMap((row) => row.issues))]
  .sort()
  .map((issue) => [issue, entities.filter((row) => row.issues.includes(issue)).length]));
const summary = {
  generatedAt: new Date().toISOString(),
  scope: "route NPC name and ID membership in the current Keystone.guru dungeon map context; no mechanic or tactic verification",
  versionPageUrl,
  sourceVersion,
  dungeonsChecked: Object.keys(routeEnemies).length,
  routeNpcUsages: entities.length,
  contextVerified: entities.filter((row) => row.contextVerified).length,
  contextViolations: entities.filter((row) => !row.contextVerified).length,
  issueCounts,
  releaseEligible: entities.every((row) => row.contextVerified),
};
const outputPath = path.join(root, "docs/reports/wow/mythic-npc-context-verification.json");
await fs.writeFile(outputPath, `${JSON.stringify({ summary, entities }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (strict && !summary.releaseEligible) process.exitCode = 1;
