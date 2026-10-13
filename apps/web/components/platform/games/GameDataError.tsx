"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import styles from "./gameDataError.module.css";
import { gameDataErrorCopy } from "./gameDataErrorCopy";

export function GameDataError({ game, lang, reset }: { game: string; lang: "en" | "ru"; reset: () => void }) {
  const prefix = lang === "ru" ? "/ru" : "";
  const slug = game === "Genshin Impact" ? "genshin" : "league-of-legends";
  return (
    <main className={styles.page}>
      <section className={styles.panel} role="alert">
        <span className={styles.sigil} aria-hidden="true"><AlertTriangle /></span>
        <p>{gameDataErrorCopy[lang].archiveTemporarilyUnavailable}</p>
        <h1>{lang === "ru" ? `Не удалось открыть данные ${game}` : `Could not open ${game} data`}</h1>
        <span>{gameDataErrorCopy[lang].theGameDatabaseConnection}</span>
        <div>
          <button type="button" onClick={reset}><RefreshCw />{gameDataErrorCopy[lang].retry}</button>
          <Link href={`${prefix}/${slug}`}><ArrowLeft />{gameDataErrorCopy[lang].backToCommandCenter}</Link>
        </div>
      </section>
    </main>
  );
}
