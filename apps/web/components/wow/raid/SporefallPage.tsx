import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { wowSourceName } from "@/lib/wow/sourceLocale";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { contentManifest } from "@/lib/data/wow";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { RaidSpellReference } from "./RaidSpellReference";
import { RaidReviewNotes } from "./RaidReviewNotes";
import { raidReviewCopy } from "./raidReviewCopy";
import { RaidPullSection } from "./RaidPullSection";
import { RaidBossChips } from "./RaidBossChips";
import { RaidPager } from "./RaidNavigation";
import { RaidLinkButton } from "./raidMaterial";
import page from "./raidPage.module.css";

type ManifestIdentity = { canonicalSlug: string; instance?: string; patch?: string; names: { en: string | null; ru: string | null }; sourceUrl?: string; lastVerifiedAt?: string };

const raid = contentManifest.instances.find((entry) => entry.canonicalSlug === "sporefall") as ManifestIdentity | undefined;
const boss = (contentManifest.encounters as ManifestIdentity[]).find((entry) => entry.instance === "sporefall");
// The fungal scene of the raid's own painted card (the shared "sporefall" scene is a Void sky).
const scene = "/assets/wow/raids/hub/sporefall.webp";
const portrait = "/assets/wow/raids/sporefall/rotmire-journal.png";

/** Sporefall raid page and its single boss, Rotmire. */
export function SporefallPage({ locale, view }: { locale: RaidLocale; view: "raid" | "boss" }) {
  const reviewCopy = raidReviewCopy[locale];
  const copy = raidGuideCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/sporefall`;
  if (!raid?.names.en || !boss?.names.en) throw new Error("Sporefall identity projection is incomplete");
  const raidName = wowSourceName(raid.names.en, locale, raid.names.ru ?? undefined);
  const bossName = wowSourceName(boss.names.en, locale, boss.names.ru ?? undefined);
  const bossHref = `${raidHref}/${boss.canonicalSlug}`;
  const crumbs = [{ label: copy.wow, href: `${prefix}/wow` }, { label: copy.raids, href: `${prefix}/wow/raids` }];
  const isRaid = view === "raid";

  return (
    <AtlasFrame lang={locale} scene="sporefall" art={scene} artPosition="center 45%" tint="rgba(202, 160, 120, .14)" className={page.page}>
      <AtlasHero
        className={page.hero}
        breadcrumbs={isRaid ? [...crumbs, { label: raidName }] : [...crumbs, { label: raidName, href: raidHref }, { label: bossName }]}
        breadcrumbsLabel={copy.breadcrumbsLabel}
        emblem={isRaid ? undefined : <Image src={portrait} alt="" width={128} height={64} />}
        emblemShape="diamond"
        eyebrow={isRaid ? <>{copy.season(1)} · {reviewCopy.harandar}</> : <>{raidName} · {copy.encounterOf(1, 1)}</>}
        title={isRaid ? raidName : bossName}
        lede={isRaid ? reviewCopy.sporefallLede : reviewCopy.rotmireLede}
        actions={isRaid ? <div className={page.actions}>
          <RaidLinkButton raid="sporefall" fit="stack" href={bossHref} variant="primary" iconAfter={<ArrowRight aria-hidden="true" />}>{bossName}</RaidLinkButton>
        </div> : undefined}
      />
      {isRaid && <RaidPullSection slug="sporefall" locale={locale} />}
      {isRaid && <AtlasSection id="bosses" title={copy.bossesTitle}>
        <RaidBossChips raid="sporefall" label={copy.encountersLabel} bosses={[{ href: bossHref, name: bossName, artwork: portrait }]} />
      </AtlasSection>}
      <RaidReviewNotes raidSlug="sporefall" bossSlug={isRaid ? undefined : boss.canonicalSlug} locale={locale} />
      {!isRaid ? <RaidSpellReference raid="sporefall" raidSlug="sporefall" bossSlug={boss.canonicalSlug} exclude={[]} locale={locale} /> : null}
      {!isRaid ? <RaidPager label={copy.pagerLabel} back={{ href: raidHref, label: copy.allBosses(raidName) }} nextLabel={copy.nextBoss} /> : null}
    </AtlasFrame>
  );
}
