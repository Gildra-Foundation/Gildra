import { canBrowsePublication, isPublicationReady } from "@/lib/wow/publication";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Skull } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { AtlasMorphPreload } from "@gildra/atlas-ui/AtlasMorphPreload";
import { morphArtProps } from "@gildra/atlas-ui/morph";
import { contentManifest } from "@/lib/data/wow";
import { midnightRaids, raidSceneArt, raidSlugs } from "./midnightRaidData";
import { raidAtlasCopy } from "./raidAtlasCopy";
import styles from "./raidAtlasPage.module.css";
import { trail } from "@/lib/routes/registry";
import { artPlaceholder } from "@/lib/atlas/placeholders";

type Locale = "ru" | "en";

type ManifestIdentity = {
  canonicalSlug: string;
  instance?: string;
  order?: number;
  build: string | null;
  names: { en: string | null; ru: string | null };
  descriptions: { en: string | null; ru: string | null };
  refs: { encounterId: number | null; journalId: number | null };
  sourceUrl?: string;
  lastVerifiedAt?: string;
  verificationStatus?: string;
};

const currentRaid = contentManifest.instances.find((entry) => entry.canonicalSlug === "venomous-abyss") as ManifestIdentity | undefined;
const currentBosses = (contentManifest.encounters as ManifestIdentity[])
  .filter((entry) => entry.instance === "venomous-abyss")
  .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));


export function RaidAtlasPage({ locale }: { locale: Locale }) {
  const copy = raidAtlasCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const localized = (value: { en: string | null; ru: string | null }) => (locale === "ru" ? value.ru : value.en) ?? "";
  const archiveSlugs = raidSlugs.filter(slug => isPublicationReady(`/wow/raids/${slug}`));
  const seasonOneBosses = archiveSlugs.reduce((total, slug) => total + midnightRaids[slug].bosses.length, 0);
  const showCurrent = canBrowsePublication("/wow/raids/venomous-abyss");
  const publishedRaidCount = archiveSlugs.length + Number(showCurrent);
  const publishedBossCount = seasonOneBosses + (showCurrent ? currentBosses.length : 0);

  if (!currentRaid?.names.en || !currentRaid.names.ru || !currentRaid.descriptions.en || !currentRaid.descriptions.ru || currentBosses.length !== 8) {
    throw new Error("Raid atlas identity projection is incomplete");
  }

  return (
    <AtlasFrame lang={locale} scene="raids">
      <AtlasHero
        align="center"
        breadcrumbs={trail(locale, "raids")}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        eyebrow={copy.eyebrow}
        title={copy.title}
        lede={copy.lede}
        statsLabel={copy.statsLabel}
        stats={[
          { value: publishedRaidCount, label: copy.raids },
          { value: publishedBossCount, label: copy.bosses },
          { value: "S2", label: copy.season },
        ]}
      />

      {showCurrent && <AtlasSection id="current" title={copy.currentTitle} description={copy.currentText}>
        <AtlasCard
          layout="feature"
          headingLevel={3}
          href={`${prefix}/wow/raids/venomous-abyss`}
          image={{ src: "/assets/wow/mythic/backgrounds/altar.webp", alt: "", priority: true }}
          title={localized(currentRaid.names)}
          description={localized(currentRaid.descriptions)}
          meta={[{ icon: <Skull aria-hidden="true" />, label: copy.bossCount(currentBosses.length) }]}
          cta={copy.openRaid}
        />
      </AtlasSection>}

      {archiveSlugs.length > 0 && <AtlasSection id="archive" title={copy.archiveTitle} description={copy.archiveText}>
        <div className={styles.archiveGrid}>
          {archiveSlugs.map((slug) => {
            const raid = midnightRaids[slug];
            const name = locale === "ru" ? raid.nameRu : raid.nameEn;
            return (
              <article key={slug} className={styles.raid}>
                <Link className={styles.raidArt} href={`${prefix}/wow/raids/${slug}`} tabIndex={-1} aria-hidden="true">
                  {/* The picture morphs into the raid page's scene (AtlasFrame morphKey). */}
                  <Image src={raid.artwork} alt="" fill sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" {...artPlaceholder(raid.artwork)} {...morphArtProps(`/wow/raids/${slug}`)} />
                  <AtlasMorphPreload art={raidSceneArt(raid)} />
                  <span className={styles.shade} />
                </Link>
                <div className={styles.raidBody}>
                  <h3><Link href={`${prefix}/wow/raids/${slug}`}>{name}</Link></h3>
                  <ol className={styles.encounters} aria-label={copy.bossesLabel}>
                    {raid.bosses.map((boss) => (
                      <li key={boss.slug}>
                        <Image src={boss.artwork} alt="" width={28} height={28} />
                        <Link href={`${prefix}/wow/raids/${slug}/${boss.slug}`}>{locale === "ru" ? boss.nameRu : boss.nameEn}</Link>
                      </li>
                    ))}
                  </ol>
                  <footer className={styles.raidFooter}>
                    <span><Skull aria-hidden="true" />{copy.bossCount(raid.bosses.length)}</span>
                    <Link href={`${prefix}/wow/raids/${slug}`} aria-label={`${copy.openRaid}: ${name}`}><ArrowRight aria-hidden="true" /></Link>
                  </footer>
                </div>
              </article>
            );
          })}


        </div>
      </AtlasSection>}
    </AtlasFrame>
  );
}
