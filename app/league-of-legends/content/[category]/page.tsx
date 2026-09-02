import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeagueShell } from "@/components/league/LeagueShell";
import { RuneGrid } from "@/components/league/RuneGrid";
import styles from "@/components/league/league.module.css";
import { getLeagueContent } from "@/lib/league";

const categories: Record<string, { label: string; title: string; description: string }> = {
  items: { label: "Items", title: "Item Database", description: "Every item and complete localized Data Dragon payload." },
  runes: { label: "Runes", title: "Rune Database", description: "Rune paths, keystones and minor runes from the active patch." },
  "summoner-spells": { label: "Summoners", title: "Summoner Spells", description: "Official spell descriptions and assets for every supported mode." },
  maps: { label: "Maps", title: "Map Database", description: "Map metadata and official Data Dragon assets." },
  "profile-icons": { label: "Profile icons", title: "Profile Icon Database", description: "The complete profile icon archive for the current patch." },
};

export const metadata: Metadata = { title: "League of Legends Content Database — Gildra" };

export default async function ContentPage({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<{ locale?: string; cursor?: string }> }) {
  const category = (await params).category;
  const config = categories[category]; if (!config) notFound();
  const query = await searchParams; const locale = query.locale === "ru_RU" ? "ru_RU" : "en_US";
  const page = await getLeagueContent(category, locale, query.cursor ?? "");
  return <LeagueShell locale={locale} active={config.label}>
    <main className={styles.main}>
      <section className={styles.hero}><div><span className={styles.eyebrow}>GILDRA / STATIC DATA</span><h1>{config.title}</h1><p>{config.description}</p></div><div className={styles.patch}><span>SOURCE-PRESERVING</span><strong>{page.data.length} entries</strong><small>This page · EN / RU</small></div></section>
      {category === "runes" ? <RuneGrid entries={page.data} locale={locale} /> : <div className={styles.contentGrid}>{page.data.map((entry) => <article key={entry.id}>
        <div>{entry.iconUrl ? <img src={entry.iconUrl} alt="" loading="lazy" /> : <span>◇</span>}</div>
        <section><small>{entry.category} · {entry.externalKey}</small><h2>{entry.name || entry.slug || entry.externalKey}</h2><p>{entry.description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()}</p>{entry.tags.length > 0 && <footer>{entry.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</footer>}</section>
      </article>)}</div>}
      {page.data.length === 0 && <div className={styles.empty}><strong>No published entries</strong><span>The first Data Dragon import will populate this category.</span></div>}
      <div className={styles.pagination}>{query.cursor && <Link href={`/league-of-legends/content/${category}?locale=${locale}`}>← First page</Link>}{page.pagination.nextCursor && <Link href={`/league-of-legends/content/${category}?locale=${locale}&cursor=${encodeURIComponent(page.pagination.nextCursor)}`}>Next 100 →</Link>}</div>
    </main>
  </LeagueShell>;
}
