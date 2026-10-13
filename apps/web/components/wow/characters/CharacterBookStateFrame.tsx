import type { ReactNode } from "react";
import "@/app/styles/atlas-theme.css";
import styles from "./characterBookStateFrame.module.css";

/** Shared atlas shell for real profile loading and API errors. */
export function CharacterBookStateFrame({ children, locale, englishHref, russianHref }: {
  children: ReactNode; locale: "en" | "ru"; englishHref: string; russianHref: string;
}) {
  return <div className={`gildra-atlas ${styles.page}`} data-character-atlas lang={locale}>
    <div className={styles.bookContent}>
      <nav className={styles.context} aria-label={locale === "ru" ? "Навигация по профилю" : "Profile navigation"}>
        <a href={locale === "ru" ? "/ru/wow/characters" : "/wow/characters"}>{locale === "ru" ? "Персонажи" : "Characters"}</a>
        <span><a href={englishHref} lang="en" aria-current={locale === "en" ? "page" : undefined}>EN</a><a href={russianHref} lang="ru" aria-current={locale === "ru" ? "page" : undefined}>RU</a></span>
      </nav>
      <section className={styles.manuscript}>{children}</section>
    </div>
  </div>;
}
