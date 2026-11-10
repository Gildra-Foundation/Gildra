import Image from "next/image";
import { midnightSpecializations } from "@/lib/data/wow/specializations";
import { HomeArtwork } from "./HomeArtwork";
import { HomeCharacterLookup } from "./HomeCharacterLookup";
import Link from "next/link";
import { ArrowRight, BookOpen, Coins, Layers3, Shirt, Swords, UserRound } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { materialStyles } from "@/components/wow/shared/materialAtlas";
import { HomePlaque as MaterialPlaque, HomeLinkButton as MaterialLinkButton } from "./HomeMaterials";
import { HomePreview } from "./HomePreview";
import { liveSeason } from "@/lib/data/season";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import type { Lang } from "@/lib/i18n";
import { wowHomeCopy } from "./wowHomeCopy";
import styles from "./wowHome.module.css";
import { JsonLd, websiteLd } from "@/lib/seo/jsonld";

const tools = [
  { key: "auction", href: "/wow/auction", icon: Coins },
  { key: "tierLists", href: "/tier-lists", icon: Layers3 },
  { key: "library", href: "/library", icon: BookOpen },
  { key: "transmog", href: "/wow/transmog", icon: Shirt },
  { key: "lairs", href: "/wow/lairs", icon: Swords },
  { key: "characters", href: "/wow/characters", icon: UserRound },
] as const;

type HomeRaid = {
  slug: string;
  names: { en: string; ru: string };
  location?: { en: string; ru: string };
  artwork: string;
  bosses: { slug: string; names: { en: string; ru: string }; anchor?: string }[];
};
type HomeRelease = { date: string; en: string; ru: string };

export function WowHome({ lang, raids, news }: { lang: Lang; raids: HomeRaid[]; news: HomeRelease[] }) {
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
  const classes = [...new Map(midnightSpecializations.map(spec => [spec.classSlug, spec])).values()].sort((a,b) => a.classId-b.classId);


  return <AtlasFrame lang={locale} scene="wow" art="" artLayer={<HomeArtwork />} className={styles.page} dataAttributes={{ "data-wow-atlas": true }}>
    <JsonLd data={websiteLd(locale, t.lede).map(thing => ({ ...thing, name: "WowArcana", ...(thing["@type"] === "WebSite" ? { publisher: { ...thing.publisher as object, name: "WowArcana" } } : {}) }))} />
    <AtlasHero align="start" className={styles.hero}
      eyebrow={season?.names[locale] ?? t.eyebrow} title={<>WowArcana<span className={styles.heroPromise}>{t.title}</span></>} lede={t.lede}
      actions={<div className={styles.heroContent}>
        <HomeCharacterLookup locale={locale} />
        <div className={styles.actions}>
          <Link href={href("/wow/mythic-plus")} prefetch={false} className={styles.textLink}>{t.play}<ArrowRight aria-hidden="true" /></Link>
          {raid && <Link href={href(`/wow/raids/${raid.slug}`)} prefetch={false} className={styles.textLink}>{raid.names[locale]}<ArrowRight aria-hidden="true" /></Link>}
        </div>
      </div>}
      aside={season && <MaterialPlaque kit="den-of-nalorakk" as="nav" aria-label={t.seasonTitle} className={styles.seasonNow}>
        <h2 className={materialStyles.title}>{season.names[locale]}</h2>
        <ul className={styles.liveLinks}>{seasonalDungeons.slice(0, 3).map(slug => <li key={slug}><Link href={href(`/wow/mythic-plus/${season.slug}/${slug}`)} prefetch={false}><span>{locale === "ru" ? dungeonRoutes[slug].nameRu : dungeonRoutes[slug].name}</span><span className={styles.timer}>{Math.floor(dungeonRoutes[slug].timerSeconds / 60)}:00</span></Link></li>)}</ul>
        <Link href={href("/wow/mythic-plus/meta")} prefetch={false} className={styles.textLink}>{t.meta}<ArrowRight aria-hidden="true" /></Link>
      </MaterialPlaque>}
    />

    <nav className={styles.strengths} aria-label={t.productLabel}>
      <Link href={href(`/wow/mythic-plus/${season?.slug ?? "midnight-season-2"}/ruby-life-pools`)} prefetch={false}>
        <div className={styles.miniRoute} aria-hidden="true"><HomePreview kind="ruby-route" /><svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.routeLine}><polyline points={previewStops.map(stop => `${stop.x},${stop.y}`).join(" ")} /></svg></div>
        <span><strong>{t.routeStrength}</strong><span>{t.routeDetail}</span></span><ArrowRight aria-hidden="true" />
      </Link>
      <Link href={href("/wow/map")} prefetch={false}>
        <div className={styles.miniMap} aria-hidden="true"><Image src={`/maps/tiles/${locale === "ru" ? "ru/" : ""}947/1/0_0.webp`} alt="" width={256} height={256} unoptimized loading="lazy" /></div>
        <span><strong>{t.mapStrength}</strong><span>{t.mapDetail}</span></span><ArrowRight aria-hidden="true" />
      </Link>
      <Link href={href("/wow/classes")} prefetch={false}>
        <div className={styles.miniClasses} aria-hidden="true">{classes.slice(0,3).map(spec => <Image key={spec.classSlug} src={spec.classIconUrl} alt="" width={48} height={48} quality={50} loading="lazy" />)}</div>
        <span><strong>{t.classStrength}</strong><span>{t.classDetail}</span></span><ArrowRight aria-hidden="true" />
      </Link>
    </nav>

    <AtlasSection id="season" title={t.seasonTitle}>
      <div className={styles.seasonGrid}>
        <article className={styles.feature}>
          <Link href={href(`/wow/mythic-plus/${season?.slug ?? "midnight-season-2"}/ruby-life-pools`)} tabIndex={-1} aria-hidden="true" prefetch={false}>
            <div className={`${styles.productPreview} ${styles.routePreview}`}>
              <HomePreview kind="ruby-route" />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={styles.routeLine} aria-hidden="true"><polyline points={previewStops.map(stop => `${stop.x},${stop.y}`).join(" ")} /></svg>
              {previewStops.map(stop => <span key={stop.id} className={styles.routeStop} style={{ left: `${stop.x}%`, top: `${stop.y}%` }}>{stop.id}</span>)}
              <span className={styles.previewTag}>{locale === "ru" ? route.nameRu : route.name}</span>
            </div>
          </Link>
          <MaterialPlaque kit="den-of-nalorakk" className={styles.featureBody}>
            <div className={styles.featureHeading}><h3 className={materialStyles.title}><Link href={href("/wow/mythic-plus")} prefetch={false}>Mythic+</Link></h3><Link className={styles.textLink} href={href("/wow/mythic-plus/meta")} prefetch={false}>{t.meta}<ArrowRight aria-hidden="true" /></Link></div>
            <p className={materialStyles.text}>{t.mythicText}</p>
            {season && seasonalDungeons.length > 0 && <ul className={styles.liveLinks}>{seasonalDungeons.slice(0, 2).map(slug => {
              const dungeon = dungeonRoutes[slug];
              return <li key={slug}><Link href={href(`/wow/mythic-plus/${season.slug}/${slug}`)} prefetch={false}><span>{locale === "ru" ? dungeon.nameRu : dungeon.name}</span><span className={styles.timer}>{Math.floor(dungeon.timerSeconds / 60)}:00</span></Link></li>;
            })}</ul>}
            {season && seasonalDungeons.length > 2 && <details className={styles.more}><summary>{t.moreDungeons}</summary><ul className={styles.liveLinks}>{seasonalDungeons.slice(2).map(slug => <li key={slug}><Link href={href(`/wow/mythic-plus/${season.slug}/${slug}`)} prefetch={false}><span>{locale === "ru" ? dungeonRoutes[slug].nameRu : dungeonRoutes[slug].name}</span><span className={styles.timer}>{Math.floor(dungeonRoutes[slug].timerSeconds / 60)}:00</span></Link></li>)}</ul></details>}
            <MaterialLinkButton kit="den-of-nalorakk" fit="block" href={href("/wow/mythic-plus")} iconAfter={<ArrowRight aria-hidden="true" />}>{t.dungeons}</MaterialLinkButton>
          </MaterialPlaque>
        </article>
        <article className={styles.feature}>
          <Link href={href(raid ? `/wow/raids/${raid.slug}` : "/wow/raids")} tabIndex={-1} aria-hidden="true" prefetch={false}>
            <div className={styles.productPreview}><HomePreview kind="venomous-abyss" /></div>
          </Link>
          <MaterialPlaque kit="den-of-nalorakk" className={styles.featureBody}>
            <div className={styles.featureHeading}><h3 className={materialStyles.title}><Link href={href(raid ? `/wow/raids/${raid.slug}` : "/wow/raids")} prefetch={false}>{raid?.names[locale] ?? t.raids}</Link></h3></div>
            <p className={materialStyles.text}>{raid?.location?.[locale] ?? t.raidText}</p>
            {currentRaids.map(current => <div key={current.slug}>
              {current !== raid && <h4 className={materialStyles.title}><Link href={href(`/wow/raids/${current.slug}`)} prefetch={false}>{current.names[locale]}</Link></h4>}
              <ul className={styles.liveLinks}>{current.bosses.slice(0,2).map(boss => <li key={boss.slug}><Link href={href(`/wow/raids/${current.slug}${boss.anchor ? `#${boss.anchor}` : `#boss=${boss.slug}`}`)} prefetch={false}><span>{boss.names[locale]}</span><ArrowRight aria-hidden="true" /></Link></li>)}</ul>
              {current.bosses.length > 2 && <details className={styles.more}><summary>{t.moreBosses}</summary><ul className={styles.liveLinks}>{current.bosses.slice(2).map(boss => <li key={boss.slug}><Link href={href(`/wow/raids/${current.slug}${boss.anchor ? `#${boss.anchor}` : `#boss=${boss.slug}`}`)} prefetch={false}><span>{boss.names[locale]}</span><ArrowRight aria-hidden="true" /></Link></li>)}</ul></details>}
            </div>)}
            <MaterialLinkButton kit="den-of-nalorakk" fit="block" href={href("/wow/raids")} iconAfter={<ArrowRight aria-hidden="true" />}>{t.raids}</MaterialLinkButton>
          </MaterialPlaque>
        </article>
      </div>
    </AtlasSection>

    <AtlasSection id="explore" title={t.explore}>
      <div className={styles.exploreGrid}>
        <article className={styles.mapCard}>
          <Link className={styles.mapArt} href={href("/wow/map")} tabIndex={-1} aria-hidden="true" prefetch={false}>
            <div className={`${styles.productPreview} ${styles.mapPreview}`}><div className={styles.mapPainting}>{[0,1].map(y => [0,1].map(x => <Image key={`${x}-${y}`} src={`/maps/tiles/${locale === "ru" ? "ru/" : ""}947/1/${x}_${y}.webp`} alt="" width={256} height={256} unoptimized loading="lazy" decoding="async" sizes="(max-width: 700px) 50vw, 35vw" />))}</div><span className={styles.mapDestination}>{t.mapDestination}<ArrowRight aria-hidden="true" /></span></div>
          </Link>
          <MaterialPlaque kit="den-of-nalorakk" className={styles.exploreBody}>
            <h3 className={materialStyles.title}><Link href={href("/wow/map")} prefetch={false}>{t.featured.map.title}<ArrowRight aria-hidden="true" /></Link></h3>
            <p className={materialStyles.text}>{t.featured.map.text}</p>
          </MaterialPlaque>
        </article>
        <MaterialPlaque kit="den-of-nalorakk" as="article" className={styles.classesCard}>
          <h3 className={materialStyles.title}><Link href={href("/wow/classes")} prefetch={false}>{t.featured.classes.title}<ArrowRight aria-hidden="true" /></Link></h3>
          <p className={materialStyles.text}>{t.featured.classes.text}</p>
          <ul className={styles.classIcons}>{classes.map(spec => <li key={spec.classSlug}><Link href={href(`/wow/classes/${spec.classSlug}`)} prefetch={false} title={locale === "ru" ? spec.classNameRu : spec.className} aria-label={locale === "ru" ? spec.classNameRu : spec.className}><Image src={spec.classIconUrl} alt="" width={48} height={48} quality={50} loading="lazy" decoding="async" /><span>{locale === "ru" ? spec.classNameRu : spec.className}</span></Link></li>)}</ul>
        </MaterialPlaque>
      </div>
    </AtlasSection>

    <AtlasSection id="tools" title={t.tools}>
      <nav aria-label={t.tools} className={styles.tools}>{tools.map(({ key, href: path, icon: Icon }) => <MaterialPlaque kit="den-of-nalorakk" key={key} className={styles.toolTile}><Link href={href(path)} prefetch={false}><Icon aria-hidden="true" /><span><strong>{t.toolsCopy[key]}</strong><span>{t.toolText[key]}</span></span><ArrowRight aria-hidden="true" /></Link></MaterialPlaque>)}</nav>
    </AtlasSection>

    {news.length > 0 && <AtlasSection id="news" title={t.news} aside={<Link className={styles.textLink} href={href("/wow/whats-new")} prefetch={false}>{t.allNews}<ArrowRight aria-hidden="true" /></Link>}>
      <ul className={styles.news}>{news.map((release, index) => <li key={`${release.date}-${index}`}><Link href={href(`/wow/whats-new#release-${release.date}`)} prefetch={false}><span className={styles.newsIndex} aria-hidden="true">✦</span><span><strong>{release[locale].split(":")[0].replace("The Venomous Abyss", raids.find(entry => entry.slug === "venomous-abyss")?.names[locale] ?? "The Venomous Abyss")}</strong><span>{release[locale].split(":").slice(1).join(":").trim()}</span></span><ArrowRight aria-hidden="true" /></Link></li>)}</ul>
    </AtlasSection>}
    <MaterialPlaque kit="den-of-nalorakk" as="nav" aria-label={t.closingLabel} className={styles.closing}>
      <div><h2 className={materialStyles.title}>{t.closingTitle}</h2></div>
      <MaterialLinkButton kit="den-of-nalorakk" variant="primary" fit="stack" href="#character-lookup" iconAfter={<UserRound aria-hidden="true" />}>{t.closingCharacter}</MaterialLinkButton>
      <Link href={href("/wow/map")} prefetch={false} className={styles.textLink}>{t.closingMap}<ArrowRight aria-hidden="true" /></Link>
    </MaterialPlaque>
  </AtlasFrame>;
}
