import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import type { RaidBoss, RaidDefinition } from "@/lib/data/wow/raid/midnightRaidData";
import { trail } from "@/lib/routes/registry";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { raidBossPlannerCopy } from "./raidBossPlannerCopy";
import { getVoidspireBossPlan } from "./voidspireBossPlans.server";
import { VoidspirePageBackdrop } from "./VoidspirePageBackdrop";
import { EncounterSwitcher, RaidPager } from "./RaidNavigation";
import { RaidPullWorkspace } from "./RaidPullWorkspace";
import { voidspirePlannerLayout } from "./voidspirePlannerLayout";
import backdrop from "./voidspirePageBackdrop.module.css";
import styles from "./raidBossPlanner.module.css";

/** The same material planner as the raid overview, with one encounter's stages. */
export function VoidspireBossGuide({ raid, boss, locale }: { raid: RaidDefinition; boss: RaidBoss; locale: RaidLocale }) {
  const copy = raidGuideCopy[locale];
  const t = raidBossPlannerCopy[locale];
  const prefix = locale === "ru" ? "/ru" : "";
  const raidHref = `${prefix}/wow/raids/${raid.slug}`;
  const name = locale === "ru" ? boss.nameRu : boss.nameEn;
  const raidName = locale === "ru" ? raid.nameRu : raid.nameEn;
  const order = raid.bosses.findIndex(entry => entry.slug === boss.slug);
  const encounters = raid.bosses.map(entry => ({ href: `${raidHref}/${entry.slug}`, name: locale === "ru" ? entry.nameRu : entry.nameEn, image: entry.artwork, current: entry.slug === boss.slug }));
  const plan = getVoidspireBossPlan(boss);
  return <AtlasFrame lang={locale} className={backdrop.page} morphKey={`/wow/raids/${raid.slug}/${boss.slug}`}>
    <VoidspirePageBackdrop />
    <AtlasHero breadcrumbs={trail(locale, "raids", { label: raidName, href: raidHref }, { label: name })} breadcrumbsLabel={copy.breadcrumbsLabel}
      eyebrow={<>{raidName} · {copy.encounterOf(order + 1, raid.bosses.length)}</>} title={<span data-testid="boss-title">{name}</span>}
      lede={plan.note[locale]} actions={<AtlasShareButton title={`${name} — ${raidName}`} locale={locale} />} />
    <div className={styles.shell} style={voidspirePlannerLayout(raid.slug)}>
      <EncounterSwitcher items={encounters} label={copy.encountersLabel} className={styles.encounters} />
      <AtlasSection id="plan" title={t.title} description={t.description}><RaidPullWorkspace key={boss.slug} plan={plan} locale={locale} /></AtlasSection>
      <RaidPager label={copy.pagerLabel} back={{ href: `${raidHref}#pulls`, label: t.back }} next={encounters[order + 1]} nextLabel={copy.nextBoss} className={styles.pager} />
    </div>
  </AtlasFrame>;
}
