import Link from "next/link";
import { notFound } from "next/navigation";
import { defineBlock, type BlockComponentProps, type RenderContext } from "@/lib/blocks/types";
import { GAMES, gameHref } from "@/lib/games/registry";
import { getLeagueChampion, type LeagueChampionDetail } from "@/lib/games/league-of-legends/api";
import { SkillPathPreview } from "@/components/league/SkillPathPreview";
import styles from "@/components/league/league.module.css";

export type ChampionDetailProps = { slug: string };
export type ChampionDetailData = { champion: LeagueChampionDetail | null };

const game = GAMES["league-of-legends"];
export const clean = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const statLabels: Record<string, string> = { hp: "Health", hpregen: "Health regen", mp: "Resource", mpregen: "Resource regen", armor: "Armor", spellblock: "Magic resist", attackdamage: "Attack damage", attackspeed: "Attack speed", movespeed: "Move speed", attackrange: "Attack range" };

/** Champion page body: splash hero → local section nav → lore/stats → abilities → skill path → skins → assets. */
function ChampionDetail({ data, lang }: BlockComponentProps<ChampionDetailProps, ChampionDetailData>) {
  const champion = data.champion;
  if (!champion) {
    return <div className={styles.empty}><strong>Champion unavailable</strong><span>The catalog has not published this champion yet.</span></div>;
  }
  const locale = game.apiLocale[lang];
  const shownStats = Object.entries(champion.stats).filter(([key]) => key in statLabels).slice(0, 10);
  const distinctSkins = champion.skins.filter((skin, index, values) => index === values.findIndex((candidate) => candidate.assets.splash === skin.assets.splash));
  return <>
    <div className={styles.breadcrumb}><Link href={gameHref(game, lang, "/")}>Champions</Link><span>/</span><strong>{champion.name}</strong></div>
    <section className={styles.championHero}>
      {champion.assets.splash && <img src={champion.assets.splash} alt="" />}
      <div className={styles.heroShade} />
      <div className={styles.championIdentity}>
        {champion.assets.icon && <img src={champion.assets.icon} alt="" />}
        <div><span>{champion.tags.join(" · ")}</span><h1>{champion.name}</h1><p>{champion.title}</p></div>
      </div>
      <div className={styles.heroId}>RIOT ID {champion.id}</div>
    </section>
    <nav className={styles.sectionNav} aria-label="Champion sections"><a href="#overview">Overview</a><a href="#abilities">Abilities</a><a href="#skill-path">Skill path</a><a href="#skins">Skins</a><a href="#assets">Assets</a></nav>
    <section className={styles.overview} id="overview">
      <article><span className={styles.eyebrow}>CHAMPION LORE</span><h2>{champion.title}</h2><p>{clean(champion.lore || champion.blurb)}</p></article>
      <aside><span className={styles.eyebrow}>BASE STATISTICS</span><div className={styles.statGrid}>{shownStats.map(([key, value]) => <div key={key}><span>{statLabels[key]}</span><strong>{Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 })}</strong></div>)}</div></aside>
    </section>
    <section className={styles.detailSection} id="abilities">
      <header><div><span className={styles.eyebrow}>KIT REFERENCE</span><h2>Abilities</h2></div><p>{champion.abilities.length} official Data Dragon records</p></header>
      <div className={styles.abilities}>{champion.abilities.map((ability) => <article key={`${ability.slot}-${ability.key}`}>
        <div className={styles.abilityIcon}>{ability.iconUrl ? <img src={ability.iconUrl} alt="" /> : <span>{ability.slot}</span>}<b>{ability.slot}</b></div>
        <div><span>{ability.kind}</span><h3>{ability.name}</h3><p>{clean(ability.description)}</p></div>
      </article>)}</div>
    </section>
    <SkillPathPreview abilities={champion.abilities} locale={locale} />
    <section className={styles.detailSection} id="skins">
      <header><div><span className={styles.eyebrow}>OFFICIAL ARTWORK</span><h2>Skins</h2></div><p>{champion.skins.length} records · {distinctSkins.length} distinct artworks</p></header>
      <div className={styles.skinGrid}>{distinctSkins.slice(0, 24).map((skin) => <article key={skin.id}>{skin.assets.splash && <img src={skin.assets.splash} alt="" loading="lazy" />}<div><strong>{skin.name === "default" ? champion.name : skin.name}</strong><span>#{skin.number}{skin.hasChromas ? " · Chromas" : ""}</span></div></article>)}</div>
      {distinctSkins.length > 24 && <p className={styles.galleryNote}>Showing 24 artworks. The complete set remains available through the public API.</p>}
    </section>
    <section className={styles.assetsPanel} id="assets"><span className={styles.eyebrow}>ASSET DELIVERY</span><h2>Official assets, cached locally</h2><p>Icon, splash, loading and tile files are mirrored from Riot Data Dragon, verified, deduplicated by SHA‑256 and served with immutable caching.</p><div>{Object.entries(champion.assets).map(([key, value]) => value && <a key={key} href={value}>{key} ↗</a>)}</div></section>
  </>;
}

export const championDetailBlock = defineBlock<ChampionDetailProps, ChampionDetailData>({
  type: "lol.championDetail",
  Component: ChampionDetail,
  load: async (ctx: RenderContext, props) => {
    const champion = await getLeagueChampion(props.slug, game.apiLocale[ctx.lang]);
    if (!champion) notFound();
    return { champion };
  },
  demo: { props: { slug: "demo" }, data: { champion: null }, note: "Empty state — real champions come from the Go API." },
});
