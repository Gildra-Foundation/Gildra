import Link from "next/link";
import clsx from "clsx";
import styles from "./AtlasLocaleSwitch.module.css";

/** EN / RU switch for a page; `path` is the route without the /ru prefix. */
export function AtlasLocaleSwitch({ locale, path, className }: { locale: "ru" | "en"; path: string; className?: string }) {
  return (
    <nav className={clsx(styles.switch, className)} aria-label={locale === "ru" ? "Язык страницы" : "Page language"}>
      <Link href={path} lang="en" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>EN</Link>
      <Link href={`/ru${path === "/" ? "" : path}`} lang="ru" hrefLang="ru" aria-current={locale === "ru" ? "page" : undefined}>RU</Link>
    </nav>
  );
}
