import { Shield } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./characterBookRibbon.module.css";

export type CharacterBookRibbonItem = {
  number: string;
  label: string;
  href: string;
  active?: boolean;
};

type Props = {
  locale: "en" | "ru";
  contents: string;
  title: string;
  homeHref: string;
  items: CharacterBookRibbonItem[];
  englishHref?: string;
  russianHref?: string;
  ariaLabel?: string;
  className?: string;
  languageControl?: ReactNode;
};

export function CharacterBookRibbon({ locale, contents, title, homeHref, items, englishHref = "/wow/characters", russianHref = "/ru/wow/characters", ariaLabel, className = "", languageControl }: Props) {
  const ru = locale === "ru";
  return (
    <nav className={`${styles.ribbon} ${className}`} aria-label={ariaLabel ?? contents} data-character-book-ribbon>
      <a className={styles.brand} href={homeHref}>
        <Shield aria-hidden="true" />
        <span><small>{contents}</small><b>{title}</b></span>
      </a>
      <div className={styles.chapters}>
        {items.map((item) => (
          <a key={item.number} href={item.href} aria-current={item.active ? "location" : undefined}>
            <i>{item.number}</i>{item.label}
          </a>
        ))}
      </div>
      {languageControl ? <div className={styles.languageControl}>{languageControl}</div> : (
        <div className={styles.languages} role="group" aria-label={ru ? "Язык" : "Language"}>
          <a href={englishHref} lang="en" aria-current={locale === "en" ? "page" : undefined}>EN</a>
          <a href={russianHref} lang="ru" aria-current={locale === "ru" ? "page" : undefined}>RU</a>
        </div>
      )}
    </nav>
  );
}
