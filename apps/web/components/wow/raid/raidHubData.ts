import { contentManifest } from "@/lib/data/wow";
import { midnightRaids, raidSceneArt, raidSlugs } from "@/lib/data/wow/raid/midnightRaidData";

export type RaidHubLocale = "ru" | "en";
export type RaidHubSlug = "venomous-abyss" | "the-voidspire" | "the-dreamrift" | "march-on-queldanas" | "sporefall";
type Localized = { en: string; ru: string };
type ManifestIdentity = {
  canonicalSlug: string;
  instance?: string;
  order?: number;
  names: { en: string | null; ru: string | null };
  descriptions: { en: string | null; ru: string | null };
  sourceUrl?: string;
};

export type RaidHubEntry = {
  slug: RaidHubSlug;
  section: "current" | "archive";
  names: Localized;
  descriptions?: Localized;
  location?: Localized;
  artwork: string;
  /** Only existing matching destination scenes participate in the art morph. */
  sceneArt?: string;
  accent: string;
  bosses: { slug: string; names: Localized; artwork?: string }[];
};

function localizedIdentity(value: ManifestIdentity["names"], label: string): Localized {
  if (!value.en || !value.ru) throw new Error(`Raid hub ${label} localization is incomplete`);
  return { en: value.en, ru: value.ru };
}

const instances = contentManifest.instances as ManifestIdentity[];
const encounters = contentManifest.encounters as ManifestIdentity[];
const current = instances.find((entry) => entry.canonicalSlug === "venomous-abyss");
const currentBosses = encounters.filter((entry) => entry.instance === "venomous-abyss")
  .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
const sporefall = instances.find((entry) => entry.canonicalSlug === "sporefall");
const rotmire = encounters.find((entry) => entry.instance === "sporefall");

if (!current || currentBosses.length !== 8 || !sporefall || !rotmire) {
  throw new Error("Raid hub identity projection is incomplete");
}

export const raidHubEntries: RaidHubEntry[] = [
  {
    slug: "venomous-abyss",
    section: "current",
    names: localizedIdentity(current.names, current.canonicalSlug),
    descriptions: localizedIdentity(current.descriptions, current.canonicalSlug),
    artwork: "/assets/wow/raids/hub/venomous-abyss.webp",
    accent: "#8bbd89",
    bosses: currentBosses.map((boss) => ({ slug: boss.canonicalSlug, names: localizedIdentity(boss.names, boss.canonicalSlug) })),
  },
  ...raidSlugs.map((slug): RaidHubEntry => {
    const raid = midnightRaids[slug];
    return {
      slug,
      section: "archive",
      names: { en: raid.nameEn, ru: raid.nameRu },
      descriptions: { en: raid.descriptionEn, ru: raid.descriptionRu },
      location: { en: raid.locationEn, ru: raid.locationRu },
      artwork: raid.artwork,
      sceneArt: raidSceneArt(raid),
      accent: raid.accent,
      bosses: raid.bosses.map((boss) => ({
        slug: boss.slug,
        names: { en: boss.nameEn, ru: boss.nameRu },
        artwork: boss.artwork,
      })),
    };
  }),
  {
    slug: "sporefall",
    section: "archive",
    names: localizedIdentity(sporefall.names, sporefall.canonicalSlug),
    location: { en: "Harandar", ru: "Харандар" },
    artwork: "/assets/wow/raids/hub/sporefall.webp",
    accent: "#c9a56e",
    bosses: [{
      slug: rotmire.canonicalSlug,
      names: localizedIdentity(rotmire.names, rotmire.canonicalSlug),
      artwork: "/assets/wow/raids/sporefall/rotmire-journal.png",
    }],
  },
];

export const raidHubStats = {
  raids: raidHubEntries.length,
  bosses: raidHubEntries.reduce((total, raid) => total + raid.bosses.length, 0),
};
