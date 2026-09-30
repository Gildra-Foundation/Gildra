export type MidnightLairEncounter = {
  id: string;
  slug: string;
  name: string;
  kind: "lair" | "world-boss";
  season: "midnight-season-2";
  patch: "12.1";
  status: "live";
  verificationStatus: "identity_only";
  sourceUrl: string;
  lastVerifiedAt: string;
};

const sourceUrl = "https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live";

export const midnightLairEncounters: MidnightLairEncounter[] = [
  ["nymrissa-wavecaller", "Nymrissa Wavecaller", "lair"],
  ["luashal", "Lu'ashal", "world-boss"],
  ["cragpine", "Cragpine", "world-boss"],
  ["thormbelan", "Thorm'belan", "world-boss"],
  ["predaxas", "Predaxas", "world-boss"],
].map(([slug, name, kind]) => ({
  id: `wow:retail:midnight:${kind}:${slug}`,
  slug,
  name,
  kind: kind as MidnightLairEncounter["kind"],
  season: "midnight-season-2",
  patch: "12.1",
  status: "live",
  verificationStatus: "identity_only",
  sourceUrl,
  lastVerifiedAt: "2026-09-13",
}));

export function getMidnightLairEncounter(slug: string) {
  return midnightLairEncounters.find((entry) => entry.slug === slug);
}
