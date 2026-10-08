import type { ReactNode } from "react";
import { Shield, Users } from "lucide-react";
import "@/app/styles/atlas-theme.css";
// The shared toolbar mounts lazily; include its styles with this page.
import "@/components/platform/navigation/bookNavigation.module.css";
import styles from "./characterRosterPage.module.css";

export function CharacterAtlasShell({ locale, view, children }: {
  locale: "en" | "ru"; view: "entry" | "roster" | "error" | "loading"; children: ReactNode;
}) {
  const ru = locale === "ru";
  return (
    <main className={`gildra-atlas ${styles.roster}`} data-character-atlas data-roster-view={view} lang={locale}>
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.frame}>
        <div className={styles.contextBar}>
          <span>WORLD OF WARCRAFT <i aria-hidden="true">/</i> {ru ? "ГЕРОИ АЗЕРОТА" : "HEROES OF AZEROTH"}</span>
          <nav className={styles.languages} aria-label={ru ? "Язык" : "Language"}>
            <a href="/wow/characters" lang="en" aria-current={!ru ? "page" : undefined}>EN</a>
            <a href="/ru/wow/characters" lang="ru" aria-current={ru ? "page" : undefined}>RU</a>
          </nav>
        </div>
        {children}
      </div>
    </main>
  );
}

export function CharacterAtlasHeader({ title, intro, eyebrow, children }: {
  title: string; intro: string; eyebrow: string; children?: ReactNode;
}) {
  return (
    <header className={styles.hero} id="account-overview">
      <span className={styles.heroSeal} aria-hidden="true"><Users /></span>
      <div className={styles.identityCopy}>
        <span className={styles.eyebrow}><Shield aria-hidden="true" />{eyebrow}</span>
        <h1>{title}</h1><p>{intro}</p>
      </div>
      {children}
    </header>
  );
}
