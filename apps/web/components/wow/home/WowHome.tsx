import Image from "next/image";
import { midnightSpecializations } from "@/lib/data/wow/specializations";
import { HomeArtwork } from "./HomeArtwork";
import { HomeCharacterLookup } from "./HomeCharacterLookup";
import Link from "next/link";
import { ArrowRight, BookOpen, Coins, Layers3, Shirt, Swords, UserRound, Map as MapIcon, ScrollText, ChartNoAxesCombined, Trophy, Route, Users, Hammer, Sparkles, Shield, type LucideIcon } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { HomePlaque, HomeSecondaryLink } from "./HomeMaterials";
import { HomeWeeklyMeta } from "./HomeWeeklyMeta";
import { homeStructuredData } from "./homeStructuredData";
import { HomePreview } from "./HomePreview";
import { liveSeason } from "@/lib/data/season";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import type { Lang } from "@/lib/i18n";
import { wowHomeCopy } from "./wowHomeCopy";
import styles from "./wowHome.module.css";
import { JsonLd } from "@/lib/seo/jsonld";
import { worldMapBundle } from "@/lib/wow/worldMap/data.server";
import { mapPagePath } from "@/lib/wow/worldMap/bundle";
import { HomeRecentCharacters } from "./HomeRecentCharacters";

import { homeGroups, homeVersions, type HomeFeature } from "./homeFeatures";
import type { NavigationIcon } from "@/components/platform/navigation/navigationMap";
const icons: Record<NavigationIcon, LucideIcon> = { characters: UserRound, classes: Shield, atlas: MapIcon, guide: ScrollText, meta: Layers3, comps: Users, stats: ChartNoAxesCombined, leaderboard: Trophy, routes: Route, journal: BookOpen, lairs: Swords, raidComp: Users, auction: Coins, professions: Hammer, transmog: Shirt, library: BookOpen, stories: ScrollText };

type HomeRaid = {
  slug: string;
  names: { en: string; ru: string };
  location?: { en: string; ru: string };
  artwork: string;
  bosses: { slug: string; names: { en: string; ru: string }; anchor?: string }[];
};
type HomeRelease = { date: string; en: string; ru: string };

export function WowHome({ lang, raids }: { lang: Lang; raids: HomeRaid[]; news?: HomeRelease[] }) {
  const locale = lang === "ru" ? "ru" : "en";
  const t = wowHomeCopy[locale];
  const href = (path: string) => `${locale === "ru" ? "/ru" : ""}${path}`;
  const season = liveSeason();
  // The manifest is the authority for season membership; never substitute archive raids.
  const currentRaids = season?.raids.flatMap(entry => { const raid = raids.find(raid => raid.slug === entry.slug); return raid ? [raid] : []; }) ?? [];
  const raid = currentRaids[0];
  const seasonalDungeons = season?.slug === "midnight-season-2" ? dungeonSlugs : [];
  const route = dungeonRoutes["ruby-life-pools"];
  const previewStops = route.stops.filter(stop => stop.floor === 1);
  const azeroth = worldMapBundle(locale).maps.find(map => map.slug === "azeroth" && map.type === "world");
  const continents = azeroth ? worldMapBundle(locale).maps.filter(map => map.parent === azeroth.id && map.type === "continent" && map.page) : [];
  const classes = [...new Map(midnightSpecializations.map(spec => [spec.classSlug, spec])).values()].sort((a,b) => a.classId-b.classId);


  return <AtlasFrame lang={locale} scene="wow" art="" artLayer={<HomeArtwork />} className={styles.page} dataAttributes={{ "data-wow-atlas": true }}>
    <JsonLd data={homeStructuredData(locale)} />
    <AtlasHero align="start" className={styles.hero}
      eyebrow={season?.names[locale] ?? t.eyebrow} title={<>WowArcana{" "}<span className={styles.heroPromise}>{t.title}</span></>} lede={t.lede}
      actions={<div className={styles.heroContent}>
        <HomeCharacterLookup locale={locale} />
        <div className={styles.actions}>
          <HomeSecondaryLink kit="den-of-nalorakk" href="#mythic" className={styles.textLink} iconAfter={<ArrowRight aria-hidden="true" />}>{t.play}</HomeSecondaryLink>

          <HomeRecentCharacters locale={locale} label={t.recentCharacters} />
        </div>
      </div>}
      aside={<HomeWeeklyMeta locale={locale} />}
    />

    <nav className={styles.overview} aria-label={t.productLabel}>{homeGroups.map(group => <a key={group.id} href={`#${group.id}`}>{group.short[locale]}<ArrowRight aria-hidden="true" /></a>)}</nav>

    {homeGroups.map(group => <AtlasSection key={group.id} id={group.id} className={styles.chapter} title={group.title[locale]}>
      <div className={styles.groupGrid}>
        <HomePlaque kit="den-of-nalorakk" as="article" className={styles.flagship}>
          {group.id === "mythic" && <div className={`${styles.productPreview} ${styles.routePreview}`}>
            <HomePreview kind="ruby-route" alt={t.routeAlt} />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.routeLine} aria-hidden="true"><polyline points={previewStops.map(stop => `${stop.x},${stop.y}`).join(" ")} /></svg>
            {previewStops.map(stop => <span key={stop.id} className={styles.routeStop} style={{ left: `${stop.x}%`, top: `${stop.y}%` }}>{stop.id}</span>)}
          </div>}
          {group.id === "raids" && raid && <div className={styles.productPreview}><HomePreview kind="venomous-abyss" alt={t.raidAlt} /></div>}
          {group.id === "world" && <div className={`${styles.productPreview} ${styles.mapPreview}`} role="img" aria-label={t.mapAlt}><div className={styles.mapPainting}>{[0,1].map(y => [0,1].map(x => <Image key={`${x}-${y}`} src={`/maps/tiles/${locale === "ru" ? "ru/" : ""}947/1/${x}_${y}.webp`} alt="" width={256} height={256} unoptimized loading="lazy" decoding="async" sizes="(max-width: 700px) 50vw, 35vw" />))}</div></div>}
          {group.id === "economy" && <div className={styles.productPreview}><Image src="/assets/wow/auction/hall-orgrimmar-20261106-768.webp" alt={t.auctionAlt} width={768} height={512} sizes="(max-width: 700px) calc(100vw - 64px), 560px" quality={50} loading="lazy" className={styles.previewImage} /></div>}
          <div className={styles.flagshipBody}>
            <h3>{group.lead.label[locale]}</h3>
            {group.id !== "raids" && <p>{group.id === "hero" ? t.classesIntro : group.id === "mythic" ? t.mythicText : group.id === "world" ? t.mapIntro : t.auctionIntro}</p>}
            {group.id === "mythic" && season && <>
              <ul className={styles.liveLinks}>{seasonalDungeons.slice(0,1).map(slug => <li key={slug}><Link href={href(`/wow/mythic-plus/${season.slug}/${slug}`)} prefetch={false}><span>{locale === "ru" ? dungeonRoutes[slug].nameRu : dungeonRoutes[slug].name}</span><span className={styles.timer}>{Math.floor(dungeonRoutes[slug].timerSeconds / 60)}:00</span></Link></li>)}</ul>
              <details className={styles.more}><summary>{t.moreDungeons}</summary><ul className={styles.liveLinks}>{seasonalDungeons.slice(1).map(slug => <li key={slug}><Link href={href(`/wow/mythic-plus/${season.slug}/${slug}`)} prefetch={false}><span>{locale === "ru" ? dungeonRoutes[slug].nameRu : dungeonRoutes[slug].name}</span><span className={styles.timer}>{Math.floor(dungeonRoutes[slug].timerSeconds / 60)}:00</span></Link></li>)}</ul></details>
            </>}
            {group.id === "raids" && currentRaids.map(current => <div key={current.slug}>
              <h4><Link href={href(`/wow/raids/${current.slug}`)} prefetch={false}>{current.names[locale]}</Link></h4>
              <ul className={styles.liveLinks}>{current.bosses.slice(0,1).map(boss => <li key={boss.slug}><Link href={href(`/wow/raids/${current.slug}${boss.anchor ? `#${boss.anchor}` : `#boss=${boss.slug}`}`)} prefetch={false}>{boss.names[locale]}<ArrowRight aria-hidden="true" /></Link></li>)}</ul>
              <details className={styles.more}><summary>{t.moreBosses}</summary><ul className={styles.liveLinks}>{current.bosses.slice(1).map(boss => <li key={boss.slug}><Link href={href(`/wow/raids/${current.slug}${boss.anchor ? `#${boss.anchor}` : `#boss=${boss.slug}`}`)} prefetch={false}>{boss.names[locale]}<ArrowRight aria-hidden="true" /></Link></li>)}</ul></details>
            </div>)}
            {group.id === "hero" && <ul className={styles.classRoster}>{classes.map(spec => <li key={spec.classSlug}><Link href={href(`/wow/classes#${spec.classSlug}`)} prefetch={false}><Image src={spec.classIconUrl} alt="" width={28} height={28} quality={50} loading="lazy" decoding="async" /><span>{locale === "ru" ? spec.classNameRu : spec.className}</span></Link></li>)}</ul>}
            {group.id === "world" && <details className={styles.more}><summary>{t.continentsLabel}</summary><ul className={styles.continents}>{continents.map(map => <li key={map.id}><Link href={href(mapPagePath(map))} prefetch={false}>{map.name}</Link></li>)}</ul></details>}
            <HomeSecondaryLink kit="den-of-nalorakk" fit="block" href={href(group.lead.href)} iconAfter={<ArrowRight aria-hidden="true" />}>{t.openGroup[group.id]}</HomeSecondaryLink>
          </div>
        </HomePlaque>
        <div className={styles.groupTools}>
          <nav aria-label={group.title[locale]}><ul className={styles.toolRows}>{group.tools.filter(link => !link.langs || link.langs.includes(locale)).map(link => <FeatureRow key={link.href} feature={link} locale={locale} />)}</ul></nav>
          {group.id === "world" && <nav className={styles.versions} aria-label={t.worldsLabel}>{homeVersions.map(portal => <Link key={portal.id} href={portal.href.startsWith("#") ? portal.href : href(portal.href)} prefetch={false}><Sparkles aria-hidden="true" /><span>{portal.label[locale]}<small>{portal.id === "retail" ? t.midnightContent : portal.id === "forever" ? t.foreverContent : t.mistsContent}</small></span><ArrowRight aria-hidden="true" /></Link>)}</nav>}
        </div>
      </div>
    </AtlasSection>)}
  </AtlasFrame>;
}

function FeatureRow({ feature, locale }: { feature: HomeFeature; locale: "en" | "ru" }) {
  const Icon = icons[feature.icon];
  return <li><Link href={`${locale === "ru" ? "/ru" : ""}${feature.href}`} prefetch={false}><Icon aria-hidden="true" /><span><strong>{feature.label[locale]}</strong><span>{feature.note[locale]}</span></span><ArrowRight aria-hidden="true" /></Link></li>;
}
