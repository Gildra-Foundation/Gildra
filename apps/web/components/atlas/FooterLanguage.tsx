"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang } from "@/lib/i18n-paths";
import { footerLanguageHref } from "./footerLanguageHref";
import { footerCopy, footerLanguageNames } from "./footerLinks";
import styles from "./AtlasFrame.module.css";

/**
 * English / Русский of the footer: the same page in the other language
 * (hreflang pair). `missing` (the 404) sends both to the hubs.
 */
export function FooterLanguage({ locale, missing = false }: { locale: Lang; missing?: boolean }) {
  const pathname = usePathname();
  return <nav className={styles.footerLanguages} aria-label={footerCopy[locale].language}>
    {(["en", "ru"] as const).map(lang => <Link key={lang} href={footerLanguageHref(pathname, lang, missing)} lang={lang} hrefLang={lang} prefetch={false}
      aria-current={lang === locale ? "true" : undefined}>{footerLanguageNames[lang]}</Link>)}
  </nav>;
}
