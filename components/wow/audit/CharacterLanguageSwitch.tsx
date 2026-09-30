"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { altPath, type Lang } from "@/lib/i18n";
import styles from "./characterLanguageSwitch.module.css";

/** A full locale navigation reloads localized server data without copying
 * character names, changing account ownership or double-encoding the slug. */
export function CharacterLanguageSwitch({ lang }: { lang: Lang }) {
  const pathname = usePathname() ?? "/wow/characters";
  const [suffix, setSuffix] = useState("");
  useEffect(() => {
    const sync = () => setSuffix(window.location.search + window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [pathname]);
  return <div className={styles.switcher} data-language-switch role="group" aria-label={lang === "ru" ? "Язык страницы" : "Page language"}>
    {(["ru", "en"] as const).map((locale) => <a key={locale}
      href={`${altPath(pathname, locale)}${suffix}`} hrefLang={locale} lang={locale}
      aria-label={locale === "ru" ? "Русский" : "English"}
      aria-current={locale === lang ? "page" : undefined}
      onClick={(event) => {
        // Read the latest fragment even if navigation changed it this frame.
        event.currentTarget.href = altPath(pathname, locale) + window.location.search + window.location.hash;
      }}
    >{locale === "ru" ? "RU" : "EN"}</a>)}
  </div>;
}
