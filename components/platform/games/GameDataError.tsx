"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import styles from "./gameDataError.module.css";

export function GameDataError({ game, lang, reset }: { game: string; lang: "en" | "ru"; reset: () => void }) {
  const prefix = lang === "ru" ? "/ru" : "";
  const slug = game === "Genshin Impact" ? "genshin" : "league-of-legends";
  return (
    <main className={styles.page}>
      <section className={styles.panel} role="alert">
        <span className={styles.sigil} aria-hidden="true"><AlertTriangle /></span>
        <p>{lang === "ru" ? "АРХИВ ВРЕМЕННО НЕДОСТУПЕН" : "ARCHIVE TEMPORARILY UNAVAILABLE"}</p>
        <h1>{lang === "ru" ? `Не удалось открыть данные ${game}` : `Could not open ${game} data`}</h1>
        <span>{lang === "ru" ? "Соединение с игровой базой прервалось. Уже открытые разделы остаются доступны — повторите запрос через несколько секунд." : "The game database connection was interrupted. Existing sections remain available; retry in a few seconds."}</span>
        <div>
          <button type="button" onClick={reset}><RefreshCw />{lang === "ru" ? "Повторить" : "Retry"}</button>
          <Link href={`${prefix}/${slug}`}><ArrowLeft />{lang === "ru" ? "В командный центр" : "Back to command center"}</Link>
        </div>
      </section>
    </main>
  );
}
