"use client";

import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";
import { bookLocale } from "./routeTransitionPolicy";
import styles from "./bookRouteLoading.module.css";
import { CharacterBookStateFrame } from "@/components/wow/characters/CharacterBookStateFrame";

/** The persistent shell watches this real Suspense marker, not an estimated progress bar. */
export function BookRouteLoading({ locale: explicitLocale }: { locale?: "ru" | "en" }) {
  const pathname = usePathname();
  const ru = (explicitLocale ?? bookLocale(pathname)) === "ru";
  return <CharacterBookStateFrame locale={ru ? "ru" : "en"} englishHref="/wow/characters" russianHref="/ru/wow/characters">
    <main className={styles.loading} data-book-route-loading aria-busy="true" role="status">
      <span className={styles.seal} aria-hidden="true"><BookOpen /></span>
      <small className={styles.rubric}>{ru ? "КНИГА ГЕРОЯ · BATTLE.NET" : "HERO'S BOOK · BATTLE.NET"}</small>
      <h1>{ru ? "Загружаем главу…" : "Loading the chapter…"}</h1>
      <p>{ru ? "Страница появится, как только данные будут готовы." : "The page will appear as soon as its data is ready."}</p>
      <span className={styles.divider} aria-hidden="true" />
    </main>
  </CharacterBookStateFrame>;
}
