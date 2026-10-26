import Image from "next/image";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { AtlasFrame, AtlasHero, AtlasSection, AtlasTile } from "@/components/atlas";
import { contentManifest } from "@/lib/data/wow";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { RaidSpellReference } from "./RaidSpellReference";
import { RaidReviewNotes } from "./RaidReviewNotes";
import { raidReviewCopy } from "./raidReviewCopy";
import styles from "./raidGuide.module.css";
import { RaidPullSection } from "./RaidPullSection";

type ManifestIdentity = { canonicalSlug: string; instance?: string; patch?: string; names: { en: string | null; ru: string | null }; sourceUrl?: string; lastVerifiedAt?: string };

const raid = contentManifest.instances.find((entry) => entry.canonicalSlug === "sporefall") as ManifestIdentity | undefined;
const boss = (contentManifest.encounters as ManifestIdentity[]).find((entry) => entry.instance === "sporefall");

/** Reviewed Sporefall identity and qualitative encounter guide. */
export function SporefallPage({ locale, view }: { locale: RaidLocale; view: "raid" | "boss" }) {
  const reviewCopy = raidReviewCopy[locale];
  const copy = raidGuideCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/sporefall`;
  if (!raid?.names.en || !raid.patch || !raid.sourceUrl || !raid.lastVerifiedAt || !boss?.names.en) {
    throw new Error("Sporefall identity projection is incomplete");
  }
  const crumbs = [{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.raids, href: `${prefix}/wow/raids` }];
  const isRaid = view === "raid";

  return (
    <AtlasFrame lang={locale} scene="sporefall">
      <AtlasHero
        breadcrumbs={isRaid ? [...crumbs, { label: wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined) }] : [...crumbs, { label: wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined), href: raidHref }, { label: wowSourceName(boss.names.en, locale, boss.names.ru ?? undefined) }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        emblem={<Image src="/assets/wow/raids/sporefall/rotmire-journal.png" alt="" width={128} height={64} />}
        emblemShape={isRaid ? "circle" : "diamond"}
        eyebrow={isRaid ? <>{copy.season(1)} · {copy.patch(raid.patch)}</> : <>{wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined)} · {copy.encounterOf(1, 1)}</>}
        title={isRaid ? wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined) : wowSourceName(boss.names.en, locale, boss.names.ru ?? undefined)}
        lede={reviewCopy.sporefallLede}
      />
      {isRaid && <RaidPullSection slug="sporefall" locale={locale} />}
      <RaidReviewNotes raidSlug="sporefall" bossSlug={isRaid ? undefined : boss.canonicalSlug} locale={locale} />
      {isRaid ? <AtlasSection>
        <div className={styles.stack}>
          {isRaid ? (
            <ol className={styles.pendingList}>
              <li><AtlasTile href={`${raidHref}/${boss.canonicalSlug}`} index="01" title={wowSourceName(boss.names.en, locale, boss.names.ru ?? undefined)} text={reviewCopy.sporefallGuide} /></li>
            </ol>
          ) : null}
        </div>
      </AtlasSection> : null}
      {!isRaid ? <RaidSpellReference raidSlug="sporefall" bossSlug={boss.canonicalSlug} exclude={[]} locale={locale} /> : null}
    </AtlasFrame>
  );
}
