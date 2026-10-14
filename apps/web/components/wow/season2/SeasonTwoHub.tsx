import { IdentityStatusPage } from "@/components/wow/shared/IdentityStatusPage";
import { contentManifest } from "@/lib/data/wow";
import { seasonTwoHubCopy } from "./seasonTwoHubCopy";

type Locale = "ru" | "en";

const OFFICIAL_SEASON_SOURCE = "https://worldofwarcraft.blizzard.com/en-us/news/24294369/midnight-season-2-is-now-live";

export function SeasonTwoHub({ locale }: { locale: Locale }) {
  const raidName = contentManifest.instances.find((entry) => entry.canonicalSlug === "venomous-abyss")?.names[locale] ?? "";
  const copy = seasonTwoHubCopy[locale];
  return (
    <IdentityStatusPage
      art="/assets/wow/loading/raid-wow-optimized.webp"
      artPosition="center 40%"
      tint="rgba(122, 64, 196, .2)"
      locale={locale}
      eyebrow="Midnight"
      title={copy.title}
      summary={seasonTwoHubCopy[locale].blizzardSOfficialOverview}
      patch="12.1"
      season="Midnight Season 2"
      sourceUrl={OFFICIAL_SEASON_SOURCE}
      sourceLabel={seasonTwoHubCopy[locale].officialBlizzardOverview}
      lastVerifiedAt="2026-09-13"
      links={[
        { href: "/wow/raids/venomous-abyss", label: raidName },
        { href: "/wow/mythic-plus/seasons/midnight-season-2", label: copy.mythicSeason },
        { href: "/wow/delves", label: copy.delves },
        { href: "/wow/prey", label: copy.prey },
        { href: "/wow/lairs", label: copy.lairs },
      ]}
    />
  );
}
