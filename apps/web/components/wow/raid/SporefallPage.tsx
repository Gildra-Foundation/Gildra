import type { RaidPayload } from "@/lib/data/gamecontent/types";
import Image from "next/image";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { AtlasFrame, AtlasHero, AtlasSection, AtlasTile } from "@/components/atlas";
import { contentManifest as baselineManifest } from "@/lib/data/wow";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { RaidSpellReference } from "./RaidSpellReference";
import { RaidReviewNotes } from "./RaidReviewNotes";
import { raidReviewCopy } from "./raidReviewCopy";
import styles from "./raidGuide.module.css";

type ManifestIdentity = { canonicalSlug: string; instance?: string; patch?: string; names: { en: string | null; ru: string | null }; sourceUrl?: string; lastVerifiedAt?: string };

/** Reviewed Sporefall identity and qualitative encounter guide. */
export function SporefallPage({ locale, view, content }: { locale: RaidLocale; view: "raid" | "boss"; content?: RaidPayload }) {
  const contentManifest = content?.manifest ?? baselineManifest;
const raid = contentManifest.instances.find((entry) => entry.canonicalSlug === "sporefall") as ManifestIdentity | undefined;
const boss = (contentManifest.encounters as ManifestIdentity[]).find((entry) => entry.instance === "sporefall");


  const displayName = (names: { en: string | null; ru: string | null }) => content ? names[locale] || names.en || "" : wowSourceName(names.en || "", locale, names.ru ?? undefined);
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
        breadcrumbs={isRaid ? [...crumbs, { label: displayName(raid.names) }] : [...crumbs, { label: displayName(raid.names), href: raidHref }, { label: displayName(boss.names) }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        emblem={<Image src="/assets/wow/raids/sporefall/rotmire-journal.png" alt="" width={128} height={64} />}
        emblemShape={isRaid ? "circle" : "diamond"}
        eyebrow={isRaid ? <>{content ? content.manifest.seasons.find((entry) => entry.canonicalSlug === content.catalog.entries.find((entry) => entry.slug === "sporefall")?.season)?.names[locale] : copy.season(1)} · {copy.patch(raid.patch)}</> : <>{displayName(raid.names)} · {copy.encounterOf(1, 1)}</>}
        title={isRaid ? displayName(raid.names) : displayName(boss.names)}
        lede={reviewCopy.sporefallLede}
      />
      <RaidReviewNotes raidSlug="sporefall" bossSlug={isRaid ? undefined : boss.canonicalSlug} locale={locale} reviews={content?.reviews} />
      {isRaid ? <AtlasSection>
        <div className={styles.stack}>
          {isRaid ? (
            <ol className={styles.pendingList}>
              <li><AtlasTile href={`${raidHref}/${boss.canonicalSlug}`} index="01" title={displayName(boss.names)} text={reviewCopy.sporefallGuide} /></li>
            </ol>
          ) : null}
        </div>
      </AtlasSection> : null}
      {!isRaid ? <RaidSpellReference raidSlug="sporefall" bossSlug={boss.canonicalSlug} exclude={[]} locale={locale} identities={content?.spellIdentities} /> : null}
    </AtlasFrame>
  );
}
