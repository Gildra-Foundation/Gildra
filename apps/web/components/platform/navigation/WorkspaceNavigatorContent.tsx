"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { altPath } from "@/lib/i18n-paths";
import { loadBookNavigationDialog, type BookNavigationDialogComponent } from "./BookNavigationDialogLoader";
import { SiteSearch } from "@/components/platform/search/SiteSearch";
import toolbarStyles from "./atlasToolbar.module.css";

const noSubscribe = () => () => {};
/** The path the server drew the bar for. The 404 page is prerendered once (for
 *  "/_not-found", in English) and served for every URL, so during hydration the
 *  bar repeats what the HTML says (data-toolbar-path) and switches to the real
 *  URL right after: its language and the EN/RU links follow. */
const renderedPath = (fallback: string) => typeof document === "undefined"
  ? fallback
  : document.querySelector("[data-toolbar-path]")?.getAttribute("data-toolbar-path") ?? fallback;

export function WorkspaceNavigatorContent() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [warmed, setWarmed] = useState(false);
  const [BookNavigationDialog, setBookNavigationDialog] = useState<BookNavigationDialogComponent | null>(null);
  const prefetchTimer = useRef<number | null>(null);
  const dialogLoad = useRef<Promise<BookNavigationDialogComponent> | null>(null);
  const livePath = useSyncExternalStore(noSubscribe, () => pathname, () => renderedPath(pathname));
  const ru = /^\/ru(?:\/|$)/.test(livePath);
  const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
  const cancelHoverPrefetch = () => {
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };
  const prefetchAfterHover = () => {
    cancelHoverPrefetch();
    prefetchTimer.current = window.setTimeout(() => {
      prefetchTimer.current = null;
      warmBookNavigation();
    }, 80);
  };
  const warmBookNavigation = () => {
    setWarmed(true);
    if (BookNavigationDialog || dialogLoad.current) return;
    const load = loadBookNavigationDialog().then((module) => module.BookNavigationDialog);
    dialogLoad.current = load;
    void load.then((component) => setBookNavigationDialog(() => component)).catch(() => {
      dialogLoad.current = null;
    });
  };
  useEffect(() => () => {
    if (prefetchTimer.current !== null) window.clearTimeout(prefetchTimer.current);
  }, []);

  // The character routes use the same compact book-contents toolbar as every
  // other inner page. Their parchment ribbon handles chapter navigation; the
  // old persistent left rail is intentionally not mounted here.
  if (path === "/") return null;

  return <>
    <header className={toolbarStyles.toolbar} data-atlas-scope data-toolbar-path={livePath}>
    <a className={toolbarStyles.skip} href="#atlas-content">{ru ? "К содержанию" : "Skip to content"}</a>
    <button className={toolbarStyles.launcher} type="button" onPointerEnter={prefetchAfterHover} onPointerLeave={cancelHoverPrefetch} onFocus={warmBookNavigation} onClick={() => { setOpen(true); warmBookNavigation(); }} aria-haspopup="dialog" aria-label={ru ? "Открыть оглавление книги" : "Open the book contents"}>
      <img src="/assets/wow/character-book/intro/chronicle-cover-toolbar.webp" width={20} height={30} decoding="async" alt="" />
      <span>{ru ? "Оглавление" : "Contents"}</span>
    </button>
      <div className={toolbarStyles.end}>
        <SiteSearch lang={ru ? "ru" : "en"} />
        <nav className={toolbarStyles.locale} aria-label={ru ? "Язык" : "Language"}>
          <Link href={altPath(livePath, "en")} hrefLang="en" lang="en" aria-current={ru ? undefined : "true"} prefetch={false}>EN</Link>
          <Link href={altPath(livePath, "ru")} hrefLang="ru" lang="ru" aria-current={ru ? "true" : undefined} prefetch={false}>RU</Link>
        </nav>
        <span className={toolbarStyles.title}>GILDRA<small>WORLD OF WARCRAFT</small></span>
      </div>
    </header>
      {warmed && BookNavigationDialog ? <BookNavigationDialog open={open} onClose={() => setOpen(false)} lang={ru ? "ru" : "en"} /> : null}
  </>;
}
