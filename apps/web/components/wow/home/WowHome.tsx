import Link from "next/link";
import { ArrowRight, BookOpen, Compass, Layers3, Shirt, Swords, UserRound } from "lucide-react";
import { AtlasFrame, AtlasHero, AtlasSection } from "@/components/atlas";
import { MaterialFrame, MaterialLinkButton, MaterialPlaque, materialStyles } from "@/components/wow/shared/materialAtlas";
import { liveSeason } from "@/lib/data/season";
import { dungeonRoutes, dungeonSlugs } from "@/lib/data/wow/mythic/dungeonRoutes";
import type { Lang } from "@/lib/i18n";
import { atlasScenes } from "@/lib/atlas/scenes";
import { wowHomeCopy } from "./wowHomeCopy";
import styles from "./wowHome.module.css";

const tools = [
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
type HomeRelease = { date: string; changes: { en: string; ru: string }[] };

export function WowHome({ lang, raids, news }: { lang: Lang; raids: HomeRaid[]; news: HomeRelease[] }) {
  const locale = lang === "ru" ? "ru" : "en";
  const t = wowHomeCopy[locale];
  const href = (path: string) => `${locale === "ru" ? "/ru" : ""}${path}`;
  const season = liveSeason();
  // The manifest is the authority for season membership; never substitute archive raids.
  const raid = season?.raids.map(entry => raids.find(raid => raid.slug === entry.slug)).find(Boolean);
  const seasonalDungeons = season?.slug === "midnight-season-2" ? dungeonSlugs.slice(0, 3) : [];
  const featured = [
    { key: "map", href: "/wow/map", art: `/maps/tiles/${locale === "ru" ? "ru/" : ""}947/0/0_0.webp`, position: "center top" },
    { key: "classes", href: "/wow/classes", art: atlasScenes.classes.art, position: "68% 62%" },
  ] as const;

  return <AtlasFrame lang={locale} scene="wow" className={styles.page} dataAttributes={{ "data-wow-atlas": true }}>
    <AtlasHero align="start" className={styles.hero}
      eyebrow={season?.names[locale] ?? t.eyebrow} title={t.title}
      actions={<div className={styles.actions}>
        <MaterialLinkButton kit="den-of-nalorakk" fit="stack" variant="primary" href={href("/wow/characters")} iconAfter={<UserRound aria-hidden="true" />}>{t.character}</MaterialLinkButton>
        <MaterialLinkButton kit="kings-rest" fit="stack" href="#season" iconAfter={<ArrowRight aria-hidden="true" />}>{t.play}</MaterialLinkButton>
      </div>}
    />

    <AtlasSection id="season" title={t.seasonTitle}>
      <div className={styles.seasonGrid}>
        <article className={styles.feature}>
          <Link href={href("/wow/mythic-plus")} tabIndex={-1} aria-hidden="true" prefetch={false}>
            <MaterialFrame kit="kings-rest" src={atlasScenes.mythicPlus.art} sizes="(max-width: 700px) 100vw, 50vw" />
          </Link>
          <MaterialPlaque kit="kings-rest" className={styles.featureBody}>
            <div className={styles.featureHeading}><h3 className={materialStyles.title}><Link href={href("/wow/mythic-plus")} prefetch={false}>Mythic+</Link></h3><Link className={styles.textLink} href={href("/wow/mythic-plus/meta")} prefetch={false}>{t.meta}<ArrowRight aria-hidden="true" /></Link></div>
            <p className={materialStyles.text}>{t.mythicText}</p>
            {season && seasonalDungeons.length > 0 && <ul className={styles.liveLinks}>{seasonalDungeons.map(slug => {
              const dungeon = dungeonRoutes[slug];
              return <li key={slug}><Link href={href(`/wow/mythic-plus/${season.slug}/${slug}`)} prefetch={false}><span>{locale === "ru" ? dungeon.nameRu : dungeon.name}</span><span className={styles.timer}>{Math.floor(dungeon.timerSeconds / 60)}:00</span></Link></li>;
            })}</ul>}
            <MaterialLinkButton kit="kings-rest" fit="block" href={href("/wow/mythic-plus")} iconAfter={<ArrowRight aria-hidden="true" />}>{t.dungeons}</MaterialLinkButton>
          </MaterialPlaque>
        </article>
        <article className={styles.feature}>
          <Link href={href(raid ? `/wow/raids/${raid.slug}` : "/wow/raids")} tabIndex={-1} aria-hidden="true" prefetch={false}>
            <MaterialFrame kit="kings-rest" src={raid?.artwork ?? atlasScenes.raids.art} sizes="(max-width: 700px) 100vw, 50vw" />
          </Link>
          <MaterialPlaque kit="kings-rest" className={styles.featureBody}>
            <div className={styles.featureHeading}><h3 className={materialStyles.title}><Link href={href(raid ? `/wow/raids/${raid.slug}` : "/wow/raids")} prefetch={false}>{raid?.names[locale] ?? t.raids}</Link></h3></div>
            <p className={materialStyles.text}>{raid?.location?.[locale] ?? t.raidText}</p>
            {raid && <ul className={styles.liveLinks}>{raid.bosses.slice(0, 3).map(boss => <li key={boss.slug}><Link href={href(`/wow/raids/${raid.slug}${boss.anchor ? `#${boss.anchor}` : `#boss=${boss.slug}`}`)} prefetch={false}><span>{boss.names[locale]}</span><ArrowRight aria-hidden="true" /></Link></li>)}</ul>}
            <MaterialLinkButton kit="kings-rest" fit="block" href={href("/wow/raids")} iconAfter={<ArrowRight aria-hidden="true" />}>{t.raids}</MaterialLinkButton>
          </MaterialPlaque>
        </article>
      </div>
    </AtlasSection>

    <AtlasSection id="explore" title={t.explore}>
      <div className={styles.exploreGrid}>{featured.map(item => <article key={item.key} className={styles.exploreCard}>
        <Link href={href(item.href)} tabIndex={-1} aria-hidden="true" prefetch={false}><MaterialFrame kit="den-of-nalorakk" src={item.art} position={item.position} sizes="(max-width: 700px) 40vw, 25vw" /></Link>
        <MaterialPlaque kit="den-of-nalorakk" className={styles.exploreBody}>
          <h3 className={materialStyles.title}><Link href={href(item.href)} prefetch={false}>{t.featured[item.key].title}<ArrowRight aria-hidden="true" /></Link></h3>
          <p className={materialStyles.text}>{t.featured[item.key].text}</p>
        </MaterialPlaque>
      </article>)}</div>
    </AtlasSection>

    <AtlasSection id="tools" title={t.tools}>
      <MaterialPlaque kit="den-of-nalorakk"><nav aria-label={t.tools} className={styles.tools}>{tools.map(({ key, href: path, icon: Icon }) => <Link key={key} href={href(path)} prefetch={false}><Icon aria-hidden="true" /><span>{t.toolsCopy[key]}</span><ArrowRight aria-hidden="true" /></Link>)}</nav></MaterialPlaque>
    </AtlasSection>

    {news.length > 0 && <AtlasSection id="news" title={t.news} aside={<Link className={styles.textLink} href={href("/wow/whats-new")} prefetch={false}>{t.allNews}<ArrowRight aria-hidden="true" /></Link>}>
      <ul className={styles.news}>{news.map(release => <li key={release.date}><Compass aria-hidden="true" /><p>{release.changes[0][locale]}</p></li>)}</ul>
    </AtlasSection>}
  </AtlasFrame>;
}
