import type { Metadata } from "next";
import { ChampionCatalog } from "@/components/league/ChampionCatalog";
import { LeagueShell } from "@/components/league/LeagueShell";
import { getLeagueChampions, getLeagueStatus } from "@/lib/league";
import styles from "@/components/league/league.module.css";

export const metadata: Metadata = {
  title: "League of Legends Champion Database — Gildra",
  description: "Every League of Legends champion, ability, skin and official Data Dragon asset in one bilingual database.",
};

export default async function LeaguePage({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  const locale = (await searchParams).locale === "ru_RU" ? "ru_RU" : "en_US";
  const [champions, status] = await Promise.all([getLeagueChampions(locale), getLeagueStatus()]);
  return <LeagueShell locale={locale}>
    <main className={styles.main}>
      <section className={styles.hero}>
        <div><span className={styles.eyebrow}>GILDRA / GAME DATABASE</span><h1>Champion Database</h1><p>Explore every champion, ability, skin and official asset.</p></div>
        <div className={styles.patch}><span>LIVE DATA</span><strong>Patch {status?.ddragonVersion ?? "—"}</strong><small>{status?.ready ? "Riot Data Dragon · EN / RU" : "Catalog awaiting first import"}</small></div>
      </section>
      {champions.length > 0 ? <ChampionCatalog champions={champions} locale={locale} /> : <div className={styles.unavailable}><span>◇</span><strong>Catalog is ready for its first import</strong><p>Run the official Data Dragon importer to publish champions and assets atomically.</p><code>lol-import --version latest --confirm</code></div>}
    </main>
  </LeagueShell>;
}
