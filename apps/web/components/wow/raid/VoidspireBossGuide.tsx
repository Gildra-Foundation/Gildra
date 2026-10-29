import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { AtlasDisclosure } from "@gildra/atlas-ui/AtlasDisclosure";
import Link from "next/link";
import type { RaidBoss, RaidDefinition } from "@/lib/data/wow/raid/midnightRaidData";
import { trail } from "@/lib/routes/registry";
import { raidGuideCopy, type RaidLocale } from "./raidGuideCopy";
import { raidBossPlannerCopy } from "./raidBossPlannerCopy";
import { getVoidspireBossPlan } from "./voidspireBossPlans.server";
import { VoidspirePageBackdrop } from "./VoidspirePageBackdrop";
import { RaidPullWorkspace } from "./RaidPullWorkspace";
import backdrop from "./voidspirePageBackdrop.module.css";
import styles from "./voidspireOverview.module.css";

/** One compact stage view, shared with the raid's pull overview. */
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
      actions={<AtlasShareButton title={`${name} — ${raidName}`} locale={locale} />} />
    <AtlasSection id="plan" title={t.title}>
      <RaidPullWorkspace key={boss.slug} plan={plan} locale={locale} />
      <div className={styles.bossNavigation} data-raid-boss-navigation>
        <Link href={`${raidHref}#pulls`}>← {t.back}</Link>
        <AtlasDisclosure summary={copy.bossesTitle}><nav aria-label={copy.encountersLabel}><ul>{encounters.map(entry => <li key={entry.href}><Link href={entry.href} aria-current={entry.current ? "page" : undefined}>{entry.name}</Link></li>)}</ul></nav></AtlasDisclosure>
      </div>
    </AtlasSection>
  </AtlasFrame>;
}
