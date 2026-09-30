"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { loadBookNavigationDialog, type BookNavigationDialogComponent } from "./BookNavigationDialogLoader";
import bookStyles from "./bookNavigation.module.css";

export function WorkspaceNavigatorContent() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [warmed, setWarmed] = useState(false);
  const [BookNavigationDialog, setBookNavigationDialog] = useState<BookNavigationDialogComponent | null>(null);
  const prefetchTimer = useRef<number | null>(null);
  const dialogLoad = useRef<Promise<BookNavigationDialogComponent> | null>(null);
  const ru = /^\/ru(?:\/|$)/.test(pathname);
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
    <header className={bookStyles.toolbar}>
    <button className={bookStyles.launcher} type="button" onPointerEnter={prefetchAfterHover} onPointerLeave={cancelHoverPrefetch} onFocus={warmBookNavigation} onClick={() => { setOpen(true); warmBookNavigation(); }} aria-haspopup="dialog" aria-label={ru ? "Открыть оглавление книги" : "Open the book contents"}>
      <img src="/assets/wow/character-book/intro/chronicle-cover-toolbar.webp" width={20} height={30} decoding="async" alt="" />
      <span>{ru ? "Оглавление" : "Contents"}</span>
    </button>
      <span className={bookStyles.toolbarTitle}>GILDRA<small>WORLD OF WARCRAFT</small></span>
    </header>
      {warmed && BookNavigationDialog ? <BookNavigationDialog open={open} onClose={() => setOpen(false)} lang={ru ? "ru" : "en"} /> : null}
  </>;
}
