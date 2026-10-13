import type { CSSProperties } from "react";
import { physicalBookMaterials } from "./PhysicalBookFrame";
import { CHARACTER_BOOK_INTRO_TIMING } from "./characterBookIntroLifecycle";
import styles from "./characterBookIntro.module.css";
import { CharacterBookBackdrop } from "./CharacterBookBackdrop";

export const CHARACTER_BOOK_COVER = "/_next/image?url=%2Fassets%2Fwow%2Fcharacter-book%2Fintro%2Fchronicle-cover-v1.webp&w=640&q=75";
export const characterBookLoadingStyle = {
  ...physicalBookMaterials,
  "--book-duration": `${CHARACTER_BOOK_INTRO_TIMING.opening}ms`,
} as CSSProperties;

/** Identical geometry before and after the server's loading boundary resolves. */
export function CharacterBookLoadingScene({ locale, pending = false, characterName, labelId, scope = "character" }: {
  locale: "ru" | "en"; pending?: boolean; characterName?: string; labelId: string; scope?: "character" | "site";
}) {
  const ru = locale === "ru";
  const Heading = pending ? "h1" : "h2";
  return <>
    <div className={styles.curtain} aria-hidden="true"><CharacterBookBackdrop /></div>
    <div className={styles.ambience} aria-hidden="true"><i /><i /></div>
    <header className={styles.masthead} aria-hidden="true"><span>GILDRA</span><i />{ru ? "Хроники Азерота" : "Chronicles of Azeroth"}</header>
    <div className={styles.bookStage} aria-hidden="true">
      <div className={styles.book}>
        <div className={styles.pageBlock}><div className={styles.pageInscription}><span>G</span><i /><small>{scope === "site" ? (ru ? "ХРОНИКИ АЗЕРОТА" : "CHRONICLES OF AZEROTH") : (ru ? "ЛЕТОПИСЬ ГЕРОЯ" : "A HERO’S CHRONICLE")}</small></div></div>
        <div className={`${styles.leaf} ${styles.leafOne}`} />
        <div className={`${styles.leaf} ${styles.leafTwo}`} />
        <div className={styles.cover}>
          <img className={styles.coverFront} src={CHARACTER_BOOK_COVER} width={720} height={1080} alt="" fetchPriority="high" draggable={false} />
          <div className={styles.coverBack} />
        </div>
      </div>
    </div>
    <footer className={styles.caption}>
      <span>{scope === "site" ? (ru ? "Хроники Азерота" : "Chronicles of Azeroth") : (ru ? "Летопись героя" : "A hero’s chronicle")}</span>
      <Heading id={labelId}>{characterName || (scope === "site" ? (ru ? "Открываем книгу" : "Opening the book") : (ru ? "Загружаем персонажа…" : "Loading your character…"))}</Heading>
      <p role="status" aria-live="polite">{pending
        ? (scope === "site" ? (ru ? "Загружаем вашу страницу…" : "Loading your page…") : (ru ? "Получаем профиль, экипировку и таланты из Battle.net." : "Fetching your profile, equipment, and talents from Battle.net."))
        : (ru ? "Открываем вашу хронику…" : "Opening your chronicle…")}</p>
    </footer>
  </>;
}
