"use client";
import { useDungeonLocation } from "./map/navigation";
import { usePathname } from "next/navigation";
import { p, type Lang } from "@/lib/i18n-paths";
import { instanceCopy } from "./instanceCopy";
import styles from "@/components/atlas/AtlasFrame.module.css";
export function ForeverLanguageLinks({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const location = useDungeonLocation();
  const path = pathname?.replace(/^\/ru(?=\/)/, "") || "/wow/forever";
  return <nav className={styles.footerLanguages} aria-label={instanceCopy[lang].language}>
    <a href={p("en", path) + location} hrefLang="en" lang="en" aria-current={lang === "en" ? "true" : undefined}>English</a>
    <a href={p("ru", path) + location} hrefLang="ru" lang="ru" aria-current={lang === "ru" ? "true" : undefined}>Русский</a>
  </nav>;
}
