import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./league.module.css";

const categories = [
  ["Champions", "/league-of-legends"],
  ["Items", "/league-of-legends/content/items"],
  ["Runes", "/league-of-legends/content/runes"],
  ["Summoners", "/league-of-legends/content/summoner-spells"],
] as const;

export function LeagueShell({ children, active = "Champions", locale = "en_US" }: { children: ReactNode; active?: string; locale?: "en_US" | "ru_RU" }) {
  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/" aria-label="Gildra home">
        <Image src="/brand/helmet.png" width={28} height={28} alt="" priority />
        <span>GILDRA</span>
      </Link>
      <span className={styles.divider} />
      <Link className={styles.game} href="/league-of-legends">League of Legends <span>◆</span></Link>
      <nav className={styles.nav} aria-label="League catalog">
        {categories.map(([label, href]) => <Link key={label} href={`${href}?locale=${locale}`} className={active === label ? styles.active : undefined}>{label}</Link>)}
        <a href="https://api.gildra.net/league-of-legends/v1">API</a>
      </nav>
      <div className={styles.locale} aria-label="Language">
        <Link className={locale === "en_US" ? styles.localeActive : ""} href="?locale=en_US">EN</Link>
        <span>/</span>
        <Link className={locale === "ru_RU" ? styles.localeActive : ""} href="?locale=ru_RU">RU</Link>
      </div>
    </header>
    {children}
    <footer className={styles.footer}>
      <span>GILDRA · LEAGUE DATABASE</span>
      <p>League of Legends and Riot Games are trademarks of Riot Games, Inc. Gildra is not affiliated with Riot Games.</p>
      <a href="https://developer.riotgames.com/docs/lol#data-dragon">Official Data Dragon source ↗</a>
    </footer>
  </div>;
}
