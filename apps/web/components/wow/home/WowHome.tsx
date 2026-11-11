import { homeLookupCopy } from "./homeLookupCopy";
import Image from "next/image";
import { midnightSpecializations } from "@/lib/data/wow/specializations";
import { HomeArtwork } from "./HomeArtwork";
import { HomeCharacterLookup } from "./HomeCharacterLookup";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { HomePlaque } from "./HomeMaterials";
import { HomeWeeklyMeta } from "./HomeWeeklyMeta";
import { homeStructuredData } from "./homeStructuredData";
import { HomePreview } from "./HomePreview";
import { liveSeason } from "@/lib/data/season";
import { dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonBackdropSmall } from "@/lib/wow/dungeonArtDirection";
import type { Lang } from "@/lib/i18n";
import type { CSSProperties } from "react";
import { classColors } from "@/lib/atlas/dataPalette";
import { wowHomeCopy } from "./wowHomeCopy";
import styles from "./wowHome.module.css";
import { JsonLd } from "@/lib/seo/jsonld";
import { worldMapBundle } from "@/lib/wow/worldMap/data.server";
import { mapPagePath } from "@/lib/wow/worldMap/bundle";
import { HomeRecentCharacters } from "./HomeRecentCharacters";
import { HomeDungeons } from "./HomeDungeons";

import { homeGroups, homeVersions, type HomeFeature } from "./homeFeatures";
import { pageGlyphs, whatsNewGlyph } from "@/components/platform/navigation/SiteGlyphs";
const icons = pageGlyphs;
/** One painting per call to action; the world banner is the map of Azeroth in the page language. */
const bannerArt = {
  mythic: dungeonBackdropSmall("murder-row"),
  hero: "/assets/wow/loading/classes-heroes-20261106.webp",
  raids: "/assets/wow/home/light/venomous-abyss-768.webp",
  economy: "/assets/wow/auction/hall-orgrimmar-20261106-768.webp",
  world: "",
} as const;

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
  const seasonalDungeons = season?.slug === "midnight-season-2" ? dungeonSlugs : [];
  const azeroth = worldMapBundle(locale).maps.find(map => map.slug === "azeroth" && map.type === "world");
  const continents = azeroth ? worldMapBundle(locale).maps.filter(map => map.parent === azeroth.id && map.type === "continent" && map.page) : [];
  const classes = [...new Map(midnightSpecializations.map(spec => [spec.classSlug, spec])).values()].sort((a,b) => a.classId-b.classId);
  const more = (group: (typeof homeGroups)[number]) => <Link href={href(group.lead.href)} prefetch={false} className={styles.more}>{group.lead.label[locale]}<ArrowRight aria-hidden="true" /></Link>;
  const tools = (group: (typeof homeGroups)[number]) => <nav aria-label={group.title[locale]}><ul className={styles.toolRows}>{group.tools.filter(link => !link.langs || link.langs.includes(locale)).map(link => <FeatureRow key={link.href} feature={link} locale={locale} />)}</ul></nav>;

  return <AtlasFrame lang={locale} scene="wow" art="" artLayer={<HomeArtwork />} className={styles.page} dataAttributes={{ "data-wow-atlas": true }}>
    <JsonLd data={homeStructuredData(locale)} />
    <link rel="preload" href="/assets/wow/fonts/azeroth/azeroth-cyrillic.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
    <AtlasHero align="start" className={styles.hero}
      title={<span className={styles.heroPromise}>{t.title}</span>} lede={t.lede}
      actions={<HomeCharacterLookup locale={locale} recent={<HomeRecentCharacters locale={locale} label={t.recentCharacters} />} />}
      aside={<HomeWeeklyMeta locale={locale} />}
    />
    <nav className={styles.banners} aria-label={t.productLabel}><ul>{homeGroups.map(group => <li key={group.id} data-group={group.id}><a href={`#${group.id}`}>
      <Image src={group.id === "world" ? `/maps/tiles/${locale === "ru" ? "ru/" : ""}947/0/0_0.webp` : bannerArt[group.id]} alt="" width={480} height={270} sizes="(max-width: 1000px) 240px, 250px" quality={50} unoptimized={group.id === "world"} />
      <strong>{group.call[locale]}</strong>
      <span>{group.short[locale]}<ArrowDown aria-hidden="true" /></span>
    </a></li>)}</ul></nav>

    {homeGroups.map(group => <AtlasSection key={group.id} id={group.id} className={styles.chapter} title={group.title[locale]} aside={group.id === "mythic" || group.id === "hero" || group.id === "raids" ? more(group) : undefined}>
      <div className={styles.group} data-group={group.id}>
        {group.id === "mythic" && season && <HomeDungeons locale={locale} season={season.slug} slugs={seasonalDungeons} label={t.moreDungeons} />}
        {group.id === "hero" && <nav aria-label={group.lead.label[locale]}><ul className={styles.classRoster}>{classes.map(spec => <li key={spec.classSlug} style={{ "--class-color": classColors[spec.classSlug as keyof typeof classColors] } as CSSProperties}><Link href={href(`/wow/classes#${spec.classSlug}`)} prefetch={false}><Image src={spec.classIconUrl} alt="" width={56} height={56} quality={50} loading="lazy" decoding="async" /><span>{locale === "ru" ? spec.classNameRu : spec.className}</span></Link></li>)}</ul></nav>}
        {group.id === "raids" && currentRaids.map(current => <HomePlaque key={current.slug} kit="arcana" as="article" className={styles.flagship}>
          <div className={styles.productPreview}><HomePreview kind="venomous-abyss" alt={t.raidAlt} /></div>
          <div className={styles.flagshipBody}>
            <h3><Link href={href(`/wow/raids/${current.slug}`)} prefetch={false}>{current.names[locale]}<ArrowRight aria-hidden="true" /></Link></h3>
            <ul className={styles.bossGrid}>{current.bosses.map(boss => <li key={boss.slug}><Link href={href(`/wow/raids/${current.slug}${boss.anchor ? `#${boss.anchor}` : `#boss=${boss.slug}`}`)} prefetch={false}>{boss.names[locale]}<ArrowRight aria-hidden="true" /></Link></li>)}</ul>
          </div>
        </HomePlaque>)}
        {group.id === "economy" && <div className={styles.pair}>
          <HomePlaque kit="arcana" as="article" className={styles.flagship}>
            <div className={styles.productPreview}><Image src="/assets/wow/auction/hall-orgrimmar-20261106-768.webp" alt={t.auctionAlt} width={768} height={512} sizes="(max-width: 700px) calc(50vw - 40px), 560px" quality={50} loading="lazy" className={styles.previewImage} /></div>
            <div className={styles.flagshipBody}><h3><Link href={href(group.lead.href)} prefetch={false}>{group.lead.label[locale]}<ArrowRight aria-hidden="true" /></Link></h3><p>{t.auctionIntro}</p></div>
          </HomePlaque>
          <HomePlaque kit="arcana" as="article" className={styles.flagship}>
            <div className={styles.productPreview}><HomePreview kind="professions" alt={homeLookupCopy[locale].professionsAlt} /></div>
            <div className={styles.flagshipBody}><h3><Link href={href(group.tools[0].href)} prefetch={false}>{group.tools[0].label[locale]}<ArrowRight aria-hidden="true" /></Link></h3><p>{group.tools[0].note[locale]}</p></div>
          </HomePlaque>
        </div>}
        {group.id === "world" && <HomePlaque kit="arcana" as="article" className={styles.flagship}>
          <div className={`${styles.productPreview} ${styles.mapPreview}`} role="img" aria-label={t.mapAlt}><div className={styles.mapPainting}>{[0,1].map(y => [0,1].map(x => <Image key={`${x}-${y}`} src={`/maps/tiles/${locale === "ru" ? "ru/" : ""}947/1/${x}_${y}.webp`} alt="" width={256} height={256} unoptimized loading="lazy" decoding="async" sizes="(max-width: 700px) 50vw, 35vw" />))}</div></div>
          <div className={styles.flagshipBody}>
            <h3><Link href={href(group.lead.href)} prefetch={false}>{group.lead.label[locale]}<ArrowRight aria-hidden="true" /></Link></h3>
            <p>{t.mapIntro}</p>
            <nav aria-label={t.continentsLabel}><ul className={styles.continents}>{continents.map(map => <li key={map.id}><Link href={href(mapPagePath(map))} prefetch={false}>{map.name}</Link></li>)}</ul></nav>
          </div>
        </HomePlaque>}
        {group.id !== "economy" && tools(group)}
        {group.id === "world" && <nav className={styles.versions} aria-label={t.worldsLabel}>{homeVersions.map(portal => <Link key={portal.id} href={portal.href.startsWith("#") ? portal.href : href(portal.href)} prefetch={false}><span data-medallion="" aria-hidden="true"><Image src={`/assets/wow/versions/${portal.id}.png`} alt="" width={44} height={44} unoptimized loading="lazy" /></span><span>{portal.label[locale]}<small>{portal.id === "retail" ? t.midnightContent : portal.id === "forever" ? t.foreverContent : t.mistsContent}</small></span></Link>)}</nav>}
      </div>
    </AtlasSection>)}
  </AtlasFrame>;
}

function FeatureRow({ feature, locale }: { feature: HomeFeature; locale: "en" | "ru" }) {
  const Icon = feature.href === "/wow/whats-new" ? whatsNewGlyph : icons[feature.icon];
  return <li><Link href={`${locale === "ru" ? "/ru" : ""}${feature.href}`} prefetch={false}><span data-medallion="" aria-hidden="true"><Icon /></span><span><strong>{feature.label[locale]}</strong><span>{feature.note[locale]}</span></span></Link></li>;
}
