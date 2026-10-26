import { wowSourceName, wowSourceText } from "@/lib/wow/sourceLocale";
import { Castle, ExternalLink, Layers, MapPin } from "lucide-react";
import { AtlasDisclosure, AtlasFrame, AtlasGrid, AtlasHero, AtlasMetaList, AtlasPanel, AtlasSection, AtlasTable, AtlasTile } from "@/components/atlas";
import { contentManifest, venomousAbyss } from "@/lib/data/wow";
import {
  gloryAchievements,
  headlineRewards,
  raidFinderWings,
  raidLootBands,
  tierRewards,
  venomousRaidLocationSource,
  venomousRaidLootSource,
  venomousRaidOverviewSource,
  venomousRaidVerifiedAt,
} from "./venomousAbyssIntel";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { venomousCopy } from "./venomousCopy";
import styles from "./venomous.module.css";
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

const waypoints = [
  { code: "/way #2509 47.11 28.30", source: "Icy Veins", href: venomousRaidOverviewSource },
  { code: "/way #2509 47.2 21.7", source: "Wowhead", href: venomousRaidLocationSource },
];

export function VenomousAbyssPage({ locale }: { locale: RaidLocale }) {
  const shared = raidGuideCopy[locale];
  const copy = venomousCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  if (!raid?.names.en || !raid.descriptions.en || !raid.descriptions.ru || !raid.patch || bosses.length !== 8) {
    throw new Error("Verified Venomous Abyss identity projection is incomplete");
  }
  const bossName = (slug: string) => bosses.find((boss) => boss.canonicalSlug === slug)?.names[locale] ?? "";

  return (
    <AtlasFrame lang={locale} scene="venomousAbyss">
      <AtlasHero
        breadcrumbs={trail(locale, "raids", { label: raid.names[locale] ?? "" })}
        breadcrumbsLabel={shared.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={raid.names[locale] ?? ""}
        lede={locale === "ru" ? raid.descriptions.ru : raid.descriptions.en}
        statsLabel={copy.statsLabel}
        stats={[{ value: bosses.length, label: copy.bossesStat(bosses.length) }, { value: raid.patch, label: copy.patchStat }]}
      />

      <RaidPullSection slug="venomous-abyss" locale={locale} />
      <RaidReviewNotes raidSlug="venomous-abyss" locale={locale} />

      <AtlasSection id="bosses" title={copy.bossesTitle} description={copy.bossesText}>
        <AtlasGrid min={320} gap="sm" as="ol" className={styles.bossGrid}>
          {bosses.map((boss, index) => {
            const guide = venomousAbyss.find((entry) => entry.slug === boss.canonicalSlug);
            return (
              <li key={boss.canonicalSlug}>
                <AtlasTile
                  href={`${prefix}/wow/raids/venomous-abyss/${boss.canonicalSlug}`}
                  index={String(index + 1).padStart(2, "0")}
                  title={boss.names[locale] ?? ""}
                  text={guide ? guide.type[locale] : undefined}
                />
              </li>
            );
          })}
        </AtlasGrid>
      </AtlasSection>

      <AtlasSection id="access" title={copy.accessTitle} description={copy.accessText}>
        <div className={styles.accessGrid}>
          <AtlasPanel padding="none">
            <AtlasMetaList columns={1} className={styles.flush} items={[
              { icon: <MapPin />, label: copy.zone, value: wowSourceName("The Coiled Isle", locale) },
              { icon: <Castle />, label: copy.entrance, value: wowSourceName("Vaults of Atal’Utek", locale) },
              { icon: <Layers />, label: copy.difficulties, value: copy.difficultyList },
              {
                icon: <MapPin />,
                label: copy.waypoints,
                value: (
                  <span className={styles.waypoints}>
                    {waypoints.map((waypoint) => (
                      <span key={waypoint.code}><code>{waypoint.code}</code> <a href={waypoint.href} target="_blank" rel="noreferrer">{waypoint.source}</a></span>
                    ))}
                    <small>{copy.waypointsNote}</small>
                  </span>
                ),
              },
            ]} />
          </AtlasPanel>
          <div>
            <h3 className={styles.subheading}>{copy.wingsTitle}</h3>
            <ol className={styles.wings}>
              {raidFinderWings.map((wing) => (
                <li key={wing.number}>
                  <span className={styles.wingMeta}>{copy.wing(wing.number)} · <time>{locale === "ru" ? wing.dateRu : wing.dateEn}</time></span>
                  <strong>{wowSourceName(wing.name, locale)}</strong>
                  <span className={styles.wingBosses}>{wowSourceText(wing.bosses.join(" · "), locale)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </AtlasSection>

      <AtlasSection id="loot" title={copy.lootTitle} description={copy.lootText}>
        <AtlasTable
          label={copy.lootTableLabel}
          testId="raid-loot-bands"
          maxWidth="960px"
          layout="cards"
          rows={raidLootBands}
          rowKey={(row) => row.difficulty.en}
          columns={[
            { key: "difficulty", header: copy.difficulty, rowHeader: true, cell: (row) => row.difficulty[locale] },
            ...copy.bossBand.map((band, index) => ({ key: `band-${index}`, header: band, numeric: true, cell: (row: (typeof raidLootBands)[number]) => row.levels[index] })),
            { key: "track", header: copy.track, cell: (row) => copy.tracks[row.track] },
          ]}
        />
        <dl className={styles.tokens}>
          <dt>{copy.tierTokens}</dt>
          {Object.entries(tierRewards).map(([slug, reward]) => <dd key={slug}><span>{bossName(slug)}</span>{wowSourceText(reward[locale], locale)}</dd>)}
        </dl>
        <p className={styles.footnote}>
          {copy.dropChance} <a href={venomousRaidLootSource} target="_blank" rel="noreferrer">{copy.lootSource}<ExternalLink aria-hidden="true" /></a> · {copy.checked(venomousRaidVerifiedAt)}
        </p>
      </AtlasSection>

      <AtlasSection id="rewards" title={copy.rewardsTitle}>
        <ul className={styles.rewards}>
          {headlineRewards.map((reward) => (
            <li key={wowSourceName(reward.name, locale)}><span><strong>{wowSourceName(reward.name, locale)}</strong>{wowSourceText(reward.detail[locale], locale)}</span></li>
          ))}
        </ul>
        <AtlasDisclosure summary={<>{wowSourceName("Glory of the Venomous Raider", locale)} · {copy.gloryRequirements(gloryAchievements.length)}</>} className={styles.glory}>
          <ol className={styles.gloryList} data-testid="raid-glory-requirements">
            {gloryAchievements.map((achievement) => (
              <li key={wowSourceName(achievement.name, locale)}><strong>{wowSourceName(achievement.name, locale)}</strong><span>{wowSourceText(achievement.requirement[locale], locale)}</span></li>
            ))}
          </ol>
          <p className={styles.footnote}>
            {copy.gloryReward} <a href={venomousRaidOverviewSource} target="_blank" rel="noreferrer">{copy.source}<ExternalLink aria-hidden="true" /></a>
          </p>
        </AtlasDisclosure>
      </AtlasSection>
    </AtlasFrame>
  );
}
