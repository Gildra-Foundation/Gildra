// Export the existing source-backed projections without changing verification
// dates or promoting draft tactics. No network requests or database writes.
const { root } = require("./register.cjs");
const fs = require("node:fs");
const path = require("node:path");
const { contentManifest, venomousAbyss, difficulties } = require(path.join(root, "lib/data/wow.ts"));
const venomousIntel = JSON.parse(JSON.stringify(require(path.join(root, "components/wow/raid/venomousAbyssIntel.ts"))));
const reviews = require(path.join(root, "data/wow/raid-reviews/published-reviews.json"));
const spellIdentities = require(path.join(root, "data/wow/raid-reviews/spell-identities.json")).abilities;
const { midnightRaids, raidSlugs } = require(path.join(root, "components/wow/raid/midnightRaidData.ts"));
const { getBossStrategy } = require(path.join(root, "components/wow/raid/raidStrategy.ts"));
const { dungeonRoutes } = require(path.join(root, "components/wow/mythic/dungeonRoutes.ts"));
const { getDungeonCombatIntel } = require(path.join(root, "components/wow/mythic/dungeonCombatIntel.server.ts"));
const { mythicVerification } = require(path.join(root, "components/wow/mythic/mythicVerification.ts"));

const season = contentManifest.seasons.find((entry) => entry.edition === "retail" && entry.status === "live");
if (!season) throw new Error("Verified current retail season is missing");
const seasonNumber = Number(season.canonicalSlug.match(/season-(\d+)$/)?.[1]);
if (!Number.isInteger(seasonNumber)) throw new Error("Season requires an explicit display number");
const seasonIdentity = { slug: season.canonicalSlug, number: seasonNumber, names: season.names, source: season.sourceUrl, checkedAt: season.lastVerifiedAt };
const raidInstances = contentManifest.instances.filter((entry) => entry.activity === "raid");
const entries = raidInstances.map((raid) => {
  const legacy = midnightRaids[raid.canonicalSlug];
  const bosses = legacy
    ? legacy.bosses.map((boss) => ({ slug: boss.slug, names: { en: boss.nameEn, ru: boss.nameRu }, artwork: boss.artwork }))
    : contentManifest.encounters.filter((boss) => boss.instance === raid.canonicalSlug).sort((a,b) => (a.order ?? 0)-(b.order ?? 0)).map((boss) => ({ slug: boss.canonicalSlug, names: boss.names }));
  return { slug: raid.canonicalSlug, entityId: raid.id, season: raid.season, patch: raid.patch, names: raid.names, localeFallback: raid.names.ru ? null : "en", descriptions: raid.descriptions, artwork: legacy?.artwork ?? null, sourceUrl: raid.sourceUrl, lastVerifiedAt: raid.lastVerifiedAt, verificationStatus: raid.verificationStatus, bosses };
});
const currentRaid = entries.find((entry) => entry.season === season.canonicalSlug);
if (!currentRaid) throw new Error("Current raid is missing");
const identity = (entry) => Object.fromEntries([
  "canonicalSlug", "instance", "order", "patch", "build", "names", "descriptions", "sourceUrl", "lastVerifiedAt", "verificationStatus",
].filter((key) => Object.hasOwn(entry, key)).map((key) => [key, entry[key]]));
// Public read models contain only the identity fields the views consume.
// Raw audits, histories, hidden spell candidates and unrelated activities
// remain in their source artifacts, outside the public release response.
const publicManifest = {
  instances: raidInstances.map(identity),
  encounters: contentManifest.encounters.filter((entry) => entries.some((raid) => raid.slug === entry.instance)).map(identity),
  seasons: contentManifest.seasons.map((entry) => ({ canonicalSlug: entry.canonicalSlug, names: entry.names })),
};
const strategies = {};
for (const slug of raidSlugs) {
  const raid = midnightRaids[slug];
  for (const boss of raid.bosses) strategies[boss.slug] = getBossStrategy(raid, boss);
}

const dungeons = {};
const combatIntel = {};
for (const [slug, route] of Object.entries(dungeonRoutes)) {
  // Stage-one migration preserves the published count as an explicit field.
  // The provenance says how it was obtained; future source collectors can
  // replace it with a journal-based count without changing the UI contract.
  const bossCount = route.stops.filter((stop) => stop.kind === "boss").length;
  dungeons[slug] = { ...route, bossCount, bossCountSource: "existing-published-route-inventory", bossCountVerificationStatus: "source_tracked" };
  combatIntel[slug] = getDungeonCombatIntel(route);
}
const payload = {
  schemaVersion: 1,
  context: { game: "wow", edition: "retail", channel: "live", region: "global", progressionKind: "none", progressionId: null },
  modules: [
    { moduleId: "raids", schemaVersion: 1, payload: {
      edition: "retail", catalog: { season: seasonIdentity, currentRaidSlug: currentRaid.slug, entries },
      manifest: publicManifest, legacyRaids: midnightRaids, venomousBosses: venomousAbyss, venomousIntel, difficulties, strategies, reviews, spellIdentities,
    } },
    { moduleId: "mythic-plus", schemaVersion: 1, payload: {
      edition: "retail", catalog: { season: seasonIdentity, dungeonOrder: Object.keys(dungeons) }, dungeons, combatIntel, verification: mythicVerification,
    } },
  ],
};
const target = process.argv[2];
if (!target) throw new Error("Usage: node export.cjs /absolute/path/seed.json");
fs.writeFileSync(path.resolve(target), `${JSON.stringify(payload)}\n`, { flag: "wx" });
console.log(JSON.stringify({ output: path.resolve(target), raids: entries.length, bosses: entries.reduce((n, r) => n+r.bosses.length, 0), dungeons: Object.keys(dungeons).length, verificationDatesPreserved: true }));
