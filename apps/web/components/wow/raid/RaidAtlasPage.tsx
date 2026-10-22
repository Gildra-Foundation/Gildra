import { wowSourceName } from "@/lib/wow/sourceLocale";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Skull } from "lucide-react";
import { AtlasCard, AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { morphArtProps } from "@gildra/atlas-ui/morph";
import { contentManifest } from "@/lib/data/wow";
import { midnightRaids, raidSlugs } from "./midnightRaidData";
import { raidAtlasCopy } from "./raidAtlasCopy";
import { raidReviewCopy } from "./raidReviewCopy";
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
const sporefall = contentManifest.instances.find((entry) => entry.canonicalSlug === "sporefall") as ManifestIdentity | undefined;
const rotmire = (contentManifest.encounters as ManifestIdentity[]).find((entry) => entry.instance === "sporefall");

export function RaidAtlasPage({ locale }: { locale: Locale }) {
  const reviewCopy = raidReviewCopy[locale];
  const copy = raidAtlasCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const localized = (value: { en: string | null; ru: string | null }) => (locale === "ru" ? value.ru : value.en) ?? "";
  const seasonOneBosses = raidSlugs.reduce((total, slug) => total + midnightRaids[slug].bosses.length, 0);
  const publishedRaidCount = raidSlugs.length + 1 + (sporefall ? 1 : 0);
  const publishedBossCount = seasonOneBosses + currentBosses.length + (rotmire ? 1 : 0);

  if (!currentRaid?.names.en || !currentRaid.names.ru || !currentRaid.descriptions.en || !currentRaid.descriptions.ru || currentBosses.length !== 8 || !sporefall?.names.en || !rotmire?.names.en) {
    throw new Error("Raid atlas identity projection is incomplete");
  }

  return (
    <AtlasFrame lang={locale} scene="raids">
      <AtlasHero
        align="chapter"
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

      <AtlasSection id="current" title={copy.currentTitle} description={copy.currentText}>
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
      </AtlasSection>

      <AtlasSection id="archive" title={copy.archiveTitle} description={copy.archiveText}>
        <div className={styles.archiveGrid}>
          {raidSlugs.map((slug) => {
            const raid = midnightRaids[slug];
            const name = locale === "ru" ? raid.nameRu : raid.nameEn;
            return (
              <article key={slug} className={styles.raid}>
                <Link className={styles.raidArt} href={`${prefix}/wow/raids/${slug}`} tabIndex={-1} aria-hidden="true">
                  {/* The picture morphs into the raid page's scene (AtlasFrame morphKey). */}
                  <Image src={raid.artwork} alt="" fill sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" {...artPlaceholder(raid.artwork)} {...morphArtProps(`/wow/raids/${slug}`)} />
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

          <article className={styles.raid} data-testid="sporefall-identity-card">
            <Link className={`${styles.raidArt} ${styles.raidArtEmpty}`} href={`${prefix}/wow/raids/sporefall`} tabIndex={-1} aria-hidden="true">
              <Image src="/assets/wow/raids/sporefall/rotmire-journal.png" alt="" width={128} height={64} />
            </Link>
            <div className={styles.raidBody}>
              <h3><Link href={`${prefix}/wow/raids/sporefall`}>{wowSourceName(sporefall.names.en!,  locale, sporefall.names.ru ?? undefined)}</Link></h3>
              <p className={styles.pending}>{reviewCopy.sporefallCard}</p>
              <ol className={styles.encounters} aria-label={copy.bossesLabel}>
                <li><Skull aria-hidden="true" /><Link href={`${prefix}/wow/raids/sporefall/rotmire`}>{wowSourceName(rotmire.names.en!,  locale, rotmire.names.ru ?? undefined)}</Link></li>
              </ol>
              <footer className={styles.raidFooter}>
                <span><Skull aria-hidden="true" />{copy.bossCount(1)}</span>
                {sporefall.sourceUrl ? <a href={sporefall.sourceUrl} target="_blank" rel="noreferrer">{copy.officialSource} ↗</a> : null}
              </footer>
            </div>
          </article>
        </div>
      </AtlasSection>
    </AtlasFrame>
  );
}
