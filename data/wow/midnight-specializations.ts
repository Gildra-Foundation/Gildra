import { talentSpecThemes } from "@/lib/talentSpecThemes";

export const TALENT_SNAPSHOT = {
  build: "12.1.0.69814",
  observedAt: "2026-09-12T19:41:12.192Z",
  sourceUrl: "https://www.raidbots.com/static/data/live/talents.json",
  metadataUrl: "https://www.raidbots.com/static/data/live/metadata.json",
  verificationStatus: "source_tracked" as const,
};

const classSlugs: Record<string, string> = {
  druid: "druid", evoker: "evoker", priest: "priest", deathknight: "death-knight",
  hunter: "hunter", rogue: "rogue", shaman: "shaman", paladin: "paladin",
  mage: "mage", warrior: "warrior", warlock: "warlock", monk: "monk", demonhunter: "demon-hunter",
};

export const midnightSpecializations = talentSpecThemes.map((spec) => ({
  ...spec,
  classSlug: classSlugs[spec.classKey],
}));

export const midnightClasses = [...new Map(midnightSpecializations.map((spec) => [spec.classSlug, {
  slug: spec.classSlug,
  classId: spec.classId,
  nameEn: spec.className,
  nameRu: spec.classNameRu,
}])).values()];

export const getMidnightClass = (slug: string) => midnightClasses.find((entry) => entry.slug === slug);
export const getMidnightClassSpecs = (slug: string) => midnightSpecializations.filter((entry) => entry.classSlug === slug);
export const getMidnightClassSpec = (classSlug: string, specSlug: string) => midnightSpecializations.find((entry) => entry.classSlug === classSlug && entry.slug === specSlug);
