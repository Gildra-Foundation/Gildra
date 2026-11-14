import paint from "@/components/library/libraryMaterial.module.css";
import { materialButtonStyle } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import { FOREVER_KIT } from "../foreverKit";
import { ForeverPagerNav } from "./ForeverPagerNav";
import { sharedCopy } from "./sharedCopy";

/**
 * Paging of a list, as the library of the live game pages its records: «Previous» and «Next» on the
 * section's painted buttons, the page between them. Plain links: paging works without JavaScript.
 */
export function ForeverPager({ lang, label, page, pages, prev, next }: {
  lang: Lang;
  /** Accessible name: what is paged («Items», «Class changes»). */
  label: string;
  page: number;
  pages: number;
  /** Address of the previous page (absent on the first). */
  prev?: string;
  /** Address of the next page (absent on the last). */
  next?: string;
}) {
  const t = sharedCopy[lang];
  if (!prev && !next) return null;
  return <div className={`${paint.painted} ${paint.pager}`} style={materialButtonStyle(FOREVER_KIT)}>
    <ForeverPagerNav label={label}
      prev={prev ? { href: prev, label: t.previous } : undefined}
      next={next ? { href: next, label: t.next } : undefined}
      status={`${page} / ${pages}`} />
  </div>;
}
