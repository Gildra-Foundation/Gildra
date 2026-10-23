import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { AtlasButton } from "@/components/atlas";
import { AtlasInput } from "@gildra/atlas-ui/AtlasField";
import type { Lang } from "@/lib/i18n";
import { articlesCopy } from "../articlesCopy";
import { articlesListHref, hasFilters, WOW_CLASSES, wowClassIcon, type ArticleFilters as Filters } from "./model";
import styles from "./articles.module.css";

/**
 * Search, type and class filters as a GET form and plain links: every state
 * has its own URL, the server renders the result, no client JavaScript.
 */
export function ArticleFilters({ lang, filters, types, base, counts }: {
  lang: Lang;
  filters: Filters;
  types: Array<{ slug: string; title: string }>;
  base: string;
  /** Articles per type slug ("" = all), when the list knows them. */
  counts?: Record<string, number>;
}) {
  const t = articlesCopy[lang];
  const href = (patch: Partial<Filters>) => articlesListHref(lang, filters, patch, base);
  return (
    <div className={styles.filters} data-layout="bar">
      <form className={styles.search} action={base} method="get" role="search" aria-label={t.search}>
        {filters.type ? <input type="hidden" name="type" value={filters.type} /> : null}
        {filters.cls ? <input type="hidden" name="class" value={filters.cls} /> : null}
        <AtlasInput type="search" name="q" defaultValue={filters.q} placeholder={t.searchPlaceholder} aria-label={t.search} icon={<Search aria-hidden="true" />} />
        <AtlasButton type="submit" variant="secondary">{t.searchSubmit}</AtlasButton>
      </form>

      <nav className={styles.typeNav} aria-label={t.type}>
        <ul>
          {[{ slug: "", title: t.allTypes }, ...types].map((type) => {
            const active = (filters.type ?? "") === type.slug;
            return (
              <li key={type.slug || "all"}>
                <Link href={href({ type: type.slug || null })} aria-current={active ? "page" : undefined} className={styles.pill}>
                  {type.title}
                  {counts?.[type.slug] !== undefined ? <b>{counts[type.slug]}</b> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav className={styles.classNav} aria-label={t.wowClass}>
        <ul>
          <li>
            <Link href={href({ cls: null })} aria-current={!filters.cls ? "page" : undefined} className={styles.classAll}>{t.allClasses}</Link>
          </li>
          {WOW_CLASSES.map(([slug, name]) => (
            <li key={slug}>
              <Link href={href({ cls: slug })} aria-current={filters.cls === slug ? "page" : undefined} className={styles.classLink} title={name}>
                <Image src={wowClassIcon(slug)} alt="" width={28} height={28} />
                <span className={styles.srOnly}>{name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {hasFilters(filters) ? (
        <Link className={styles.reset} href={base}><X aria-hidden="true" />{t.reset}</Link>
      ) : null}
    </div>
  );
}
