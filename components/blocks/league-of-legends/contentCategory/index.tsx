import Link from "next/link";
import { defineBlock, type BlockComponentProps, type RenderContext } from "@/lib/blocks/types";
import { GAMES, gameHref } from "@/lib/games/registry";
import { getLeagueContent, type LeagueContentEntry } from "@/lib/games/league-of-legends/api";
import { RuneGrid } from "@/components/league/RuneGrid";
import styles from "@/components/league/league.module.css";

export const CONTENT_CATEGORIES: Record<string, { label: string; title: string; description: string }> = {
  items: { label: "Items", title: "Item Database", description: "Every item and complete localized Data Dragon payload." },
  runes: { label: "Runes", title: "Rune Database", description: "Rune paths, keystones and minor runes from the active patch." },
  "summoner-spells": { label: "Summoners", title: "Summoner Spells", description: "Official spell descriptions and assets for every supported mode." },
  maps: { label: "Maps", title: "Map Database", description: "Map metadata and official Data Dragon assets." },
  "profile-icons": { label: "Profile icons", title: "Profile Icon Database", description: "The complete profile icon archive for the current patch." },
};

export type ContentCategoryProps = { category: string; cursor?: string };
export type ContentCategoryData = {
  entries: LeagueContentEntry[];
  nextCursor?: string;
};

const game = GAMES["league-of-legends"];

/** One static-data category: hero card, rune builder or entry grid, cursor pagination. */
function ContentCategory({ category, cursor, data, lang }: BlockComponentProps<ContentCategoryProps, ContentCategoryData>) {
  const config = CONTENT_CATEGORIES[category];
  const locale = game.apiLocale[lang];
  const base = gameHref(game, lang, `/content/${category}`);
  return <>
    <section className={styles.hero}><div><span className={styles.eyebrow}>GILDRA / STATIC DATA</span><h1>{config.title}</h1><p>{config.description}</p></div><div className={styles.patch}><span>SOURCE-PRESERVING</span><strong>{data.entries.length} entries</strong><small>This page · EN / RU</small></div></section>
    {category === "runes" ? <RuneGrid entries={data.entries} locale={locale} /> : <div className={styles.contentGrid}>{data.entries.map((entry) => <article key={entry.id}>
      <div>{entry.iconUrl ? <img src={entry.iconUrl} alt="" loading="lazy" /> : <span>◇</span>}</div>
      <section><small>{entry.category} · {entry.externalKey}</small><h2>{entry.name || entry.slug || entry.externalKey}</h2><p>{entry.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</p>{entry.tags.length > 0 && <footer>{entry.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</footer>}</section>
    </article>)}</div>}
    {data.entries.length === 0 && <div className={styles.empty}><strong>No published entries</strong><span>The first Data Dragon import will populate this category.</span></div>}
    <div className={styles.pagination}>{cursor && <Link href={base}>← First page</Link>}{data.nextCursor && <Link href={`${base}?cursor=${encodeURIComponent(data.nextCursor)}`}>Next 100 →</Link>}</div>
  </>;
}

export const contentCategoryBlock = defineBlock<ContentCategoryProps, ContentCategoryData>({
  type: "lol.contentCategory",
  Component: ContentCategory,
  load: async (ctx: RenderContext, props) => {
    const page = await getLeagueContent(props.category, game.apiLocale[ctx.lang], props.cursor ?? "");
    return { entries: page.data, nextCursor: page.pagination.nextCursor };
  },
  demo: { props: { category: "items" }, data: { entries: [] }, note: "Empty state — real entries come from the Go API.", layout: "full" },
});
