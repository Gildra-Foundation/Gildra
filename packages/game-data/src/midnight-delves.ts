export type MidnightDelve = {
  id: string;
  slug: string;
  name: string;
  season: "midnight-season-1" | "midnight-season-2";
  patch: "12.0" | "12.1";
  build: string | null;
  status: "live" | "legacy";
  verificationStatus: "identity_only";
  sourceUrl: string;
  lastVerifiedAt: string;
};

const seasonOneSource = "https://worldofwarcraft.blizzard.com/en-us/news/24264417";
const seasonTwoSource = "https://worldofwarcraft.blizzard.com/en-us/news/24280285";

const seasonOne = [
  ["the-shadow-enclave", "The Shadow Enclave"],
  ["collegiate-calamity", "Collegiate Calamity"],
  ["parhelion-plaza", "Parhelion Plaza"],
  ["the-darkway", "The Darkway"],
  ["twilight-crypts", "Twilight Crypts"],
  ["atalaman", "Atal'Aman"],
  ["the-grudge-pit", "The Grudge Pit"],
  ["the-gulf-of-memory", "The Gulf of Memory"],
  ["sunkiller-sanctum", "Sunkiller Sanctum"],
  ["shadowguard-point", "Shadowguard Point"],
] as const;

const seasonTwo = [
  ["the-ring-of-glory", "The Ring of Glory"],
  ["gnarldor-isle", "Gnarldor Isle"],
  ["venomfall-deeps", "Venomfall Deeps"],
] as const;

export const midnightDelves: MidnightDelve[] = [
  ...seasonOne.map(([slug, name]) => ({
    id: `wow:retail:midnight:delve:${slug}`,
    slug,
    name,
    season: "midnight-season-1" as const,
    patch: "12.0" as const,
    build: null,
    status: "legacy" as const,
    verificationStatus: "identity_only" as const,
    sourceUrl: seasonOneSource,
    lastVerifiedAt: "2026-09-13",
  })),
  ...seasonTwo.map(([slug, name]) => ({
    id: `wow:retail:midnight:delve:${slug}`,
    slug,
    name,
    season: "midnight-season-2" as const,
    patch: "12.1" as const,
    build: null,
    status: "live" as const,
    verificationStatus: "identity_only" as const,
    sourceUrl: seasonTwoSource,
    lastVerifiedAt: "2026-09-13",
  })),
];

export function getMidnightDelve(slug: string) {
  return midnightDelves.find((delve) => delve.slug === slug);
}
