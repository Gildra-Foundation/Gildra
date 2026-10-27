import { wowSourceName, wowSourceText } from "@/lib/wow/sourceLocale";
import { ArrowDown, ExternalLink } from "lucide-react";
import { AtlasDisclosure, AtlasFrame, AtlasHero, AtlasSection, AtlasTable } from "@/components/atlas";
import { contentManifest } from "@/lib/data/wow";
import { CopyWaypointButton } from "./lairs/CopyWaypointButton";
import {
  gloryAchievements,
  headlineRewards,
  raidFinderWings,
  raidLootBands,
  tierRewards,
  venomousRaidLootSource,
  venomousRaidOverviewSource,
} from "./venomousAbyssIntel";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { venomousCopy } from "./venomousCopy";
import page from "./raidPage.module.css";
import { RaidBossChips } from "./RaidBossChips";
import { RaidHubBackdrop } from "./RaidHubBackdrop";
import { RaidLinkButton, RaidPlaque } from "./raidMaterial";
import { RaidReviewNotes } from "./RaidReviewNotes";
import { trail } from "@/lib/routes/registry";
import { RaidPullSection } from "./RaidPullSection";

type ManifestIdentity = {
  canonicalSlug: string;
  instance?: string;
  order?: number;
  patch?: string;
  build: string | null;
  names: { en: string | null; ru: string | null };
  descriptions: { en: string | null; ru: string | null };
};

// Raid and encounter identity come from the canonical content manifest (server only).
const raid = contentManifest.instances.find((entry) => entry.canonicalSlug === "venomous-abyss") as ManifestIdentity | undefined;
const bosses = (contentManifest.encounters as ManifestIdentity[])
  .filter((entry) => entry.instance === "venomous-abyss")
  .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

const waypoint = "/way #2509 47.2 21.7";

export function VenomousAbyssPage({ locale }: { locale: RaidLocale }) {
  const shared = raidGuideCopy[locale];
  const copy = venomousCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  if (!raid?.names.en || !raid.descriptions.en || !raid.descriptions.ru || !raid.patch || bosses.length !== 8) {
    throw new Error("Verified Venomous Abyss identity projection is incomplete");
  }
  const bossName = (slug: string) => bosses.find((boss) => boss.canonicalSlug === slug)?.names[locale] ?? "";
  const wingName = (wing: (typeof raidFinderWings)[number]) => locale === "ru" && "nameRu" in wing ? wing.nameRu : wowSourceName(wing.name, locale);

  return (
    <AtlasFrame lang={locale} still className={page.page} dataAttributes={{ "data-raid-page": "venomous-abyss" }}>
      <RaidHubBackdrop />
      <AtlasHero
        className={page.hero}
        breadcrumbs={trail(locale, "raids", { label: raid.names[locale] ?? "" })}
        breadcrumbsLabel={shared.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={raid.names[locale] ?? ""}
        lede={copy.lede}
        actions={<div className={page.actions}>
          <RaidLinkButton raid="venomous-abyss" fit="stack" href="#pulls" variant="primary" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.toPulls}</RaidLinkButton>
          <RaidLinkButton raid="venomous-abyss" fit="stack" href="#bosses" iconAfter={<ArrowDown aria-hidden="true" />}>{copy.bossesTitle}</RaidLinkButton>
        </div>}
        statsLabel={copy.statsLabel}
        stats={[{ value: bosses.length, label: copy.bossesStat(bosses.length) }, { value: raidFinderWings.length, label: copy.wingsStat }, { value: "S2", label: copy.seasonStat }]}
      />

      <RaidPullSection slug="venomous-abyss" locale={locale} />

      <AtlasSection id="bosses" title={copy.bossesTitle}>
        <RaidBossChips raid="venomous-abyss" label={copy.bossesLabel} bosses={bosses.map((boss) => ({
          href: `${prefix}/wow/raids/venomous-abyss/${boss.canonicalSlug}`,
          name: boss.names[locale] ?? "",
        }))} />
      </AtlasSection>

      <RaidReviewNotes raidSlug="venomous-abyss" locale={locale} />

      <AtlasSection id="access" title={copy.accessTitle} description={copy.accessText}>
        <div className={page.plaqueGrid}>
          <RaidPlaque raid="venomous-abyss" className={page.plaque}>
            <dl className={page.facts}>
              <div><dt>{copy.zone}</dt><dd>{wowSourceName("The Coiled Isle", locale)}</dd></div>
              <div><dt>{copy.entrance}</dt><dd>{wowSourceName("Vaults of Atal’Utek", locale)}</dd></div>
              <div><dt>{copy.difficulties}</dt><dd>{copy.difficultyList}</dd></div>
            </dl>
            <div className={page.waypoint}>
              <CopyWaypointButton waypoint={waypoint} labels={{ label: copy.copyWaypoint, copied: copy.copied, failed: copy.copyFailed }} />
            </div>
          </RaidPlaque>
          <RaidPlaque raid="venomous-abyss" className={page.plaque}>
            <h3>{copy.wingsTitle}</h3>
            <ol className={page.rows}>
              {raidFinderWings.map((wing) => (
                <li key={wing.number}>
                  <small>{copy.wing(wing.number)} · <time>{locale === "ru" ? wing.dateRu : wing.dateEn}</time></small>
                  <strong>{wingName(wing)}</strong>
                  <span>{wowSourceText(wing.bosses.join(" · "), locale)}</span>
                </li>
              ))}
            </ol>
          </RaidPlaque>
        </div>
      </AtlasSection>

      <AtlasSection id="loot" title={copy.lootTitle} description={copy.lootText}>
        <div className={page.plaqueStack}>
          <RaidPlaque raid="venomous-abyss" className={page.plaque}>
            <AtlasTable
              label={copy.lootTableLabel}
              testId="raid-loot-bands"
              layout="cards"
              rows={raidLootBands}
              rowKey={(row) => row.difficulty.en}
              columns={[
                { key: "difficulty", header: copy.difficulty, rowHeader: true, cell: (row) => row.difficulty[locale] },
                ...copy.bossBand.map((band, index) => ({ key: `band-${index}`, header: band, numeric: true, cell: (row: (typeof raidLootBands)[number]) => row.levels[index] })),
                { key: "track", header: copy.track, cell: (row) => copy.tracks[row.track] },
              ]}
            />
            <h3 className={page.subheading}>{copy.tierTokens}</h3>
            <ul className={page.tokens}>
              {Object.entries(tierRewards).map(([slug, reward]) => <li key={slug}><span>{bossName(slug)}</span>{wowSourceText(reward[locale], locale)}</li>)}
            </ul>
            <p className={page.quiet}><a href={venomousRaidLootSource} target="_blank" rel="noreferrer">{copy.lootSource}<ExternalLink aria-hidden="true" /></a></p>
          </RaidPlaque>
          <ul className={page.plaqueGrid4}>
            {headlineRewards.map((reward) => (
              <RaidPlaque as="li" raid="venomous-abyss" key={reward.name} className={page.plaque}>
                <h3>{wowSourceName(reward.name, locale)}</h3>
                <p>{wowSourceText(reward.detail[locale], locale)}</p>
              </RaidPlaque>
            ))}
          </ul>
          <AtlasDisclosure summary={<>{wowSourceName("Glory of the Venomous Raider", locale)} · {copy.gloryRequirements(gloryAchievements.length)}</>}>
            <ol className={page.rows} data-testid="raid-glory-requirements">
              {gloryAchievements.map((achievement) => (
                <li key={achievement.name}><strong>{wowSourceName(achievement.name, locale)}</strong><span>{wowSourceText(achievement.requirement[locale], locale)}</span></li>
              ))}
            </ol>
            <p className={page.quiet}>{copy.gloryReward} <a href={venomousRaidOverviewSource} target="_blank" rel="noreferrer">{copy.source}<ExternalLink aria-hidden="true" /></a></p>
          </AtlasDisclosure>
        </div>
      </AtlasSection>
    </AtlasFrame>
  );
}
