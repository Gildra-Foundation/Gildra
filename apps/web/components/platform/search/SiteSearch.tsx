"use client";

import { useEffect, useEffectEvent, useState, useSyncExternalStore, type ComponentType } from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { pageTitle, rememberPage } from "./recentPages";
import { siteSearchCopy, type SiteSearchLang } from "./siteSearchCopy";
import { OPEN_SITE_SEARCH } from "./siteSearchIndex";
import styles from "./siteSearch.module.css";

type DialogComponent = ComponentType<{ onClose: () => void; lang: SiteSearchLang; initialQuery?: string }>;
let dialogLoad: Promise<DialogComponent> | null = null;
const loadDialog = () => (dialogLoad ??= import("./SiteSearchDialog").then((module) => module.SiteSearchDialog).catch((error: unknown) => {
  dialogLoad = null;
  throw error;
}));

const noSubscribe = () => () => {};
const isApple = () => /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Quick search of the toolbar: ⌘K / Ctrl+K anywhere, "/" when not typing.
 * The dialog and the index load on first use (hover or focus warms them).
 * `hotkeysOnly` keeps the shortcuts on pages whose toolbar is their own scene
 * (the landing page) without drawing a button there. Also remembers the inner
 * pages the reader opens for the dialog's "Recently opened".
 */
export function SiteSearch({ hotkeysOnly = false, lang: langProp, compact = false, onOpen }: { hotkeysOnly?: boolean; lang?: SiteSearchLang; compact?: boolean; onOpen?: () => void }) {
  const pathname = usePathname();
  // The toolbar passes its hydration-safe language; the landing page derives it from the URL.
  const lang: SiteSearchLang = langProp ?? (/^\/ru(?:\/|$)/.test(pathname) ? "ru" : "en");
  const copy = siteSearchCopy[lang];
  // The dialog belongs to the page it was opened on, so any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [initialQuery, setInitialQuery] = useState("");
  const open = openOn === pathname;
  const [Dialog, setDialog] = useState<DialogComponent | null>(null);
  const apple = useSyncExternalStore(noSubscribe, isApple, () => false);

  const warm = () => { void loadDialog().then((component) => setDialog(() => component), () => undefined); };
  const show = (query = "") => { onOpen?.(); warm(); setInitialQuery(query); setOpenOn(pathname); };

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey) return;
    const typing = (event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']");
    const combo = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.shiftKey;
    const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !typing;
    if (!combo && !slash) return;
    event.preventDefault();
    if (combo && open) setOpenOn(null);
    else show();
  });

  const onOpenRequest = useEffectEvent((event: Event) => show(typeof (event as CustomEvent).detail === "string" ? (event as CustomEvent<string>).detail : ""));

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    const request = (event: Event) => onOpenRequest(event);
    window.addEventListener("keydown", listener);
    window.addEventListener(OPEN_SITE_SEARCH, request);
    return () => {
      window.removeEventListener("keydown", listener);
      window.removeEventListener(OPEN_SITE_SEARCH, request);
    };
  }, []);

  // Remember the page once its title has settled.
  useEffect(() => {
    const path = pathname.replace(/^\/ru(?=\/|$)/, "") || "/";
    const timer = window.setTimeout(() => rememberPage(path, pageTitle()), 900);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // The accessible name contains the visible word ("Search" + "the site"); the
  // shortcut is drawn by CSS and announced through aria-keyshortcuts.
  return <>
    {hotkeysOnly ? null : (
      <button className={styles.trigger} data-compact={compact || undefined} type="button" onClick={() => show()} onPointerEnter={warm} onFocus={warm} aria-haspopup="dialog" aria-keyshortcuts={apple ? "Meta+K /" : "Control+K /"}>
        <Search size={16} strokeWidth={1.9} aria-hidden="true" />
        <span className={styles.triggerLabel}>{copy.button}<span className="sr-only">{copy.buttonRest}</span></span>
        <kbd className={styles.triggerKey} data-key={apple ? "⌘K" : "Ctrl K"} aria-hidden="true" />
      </button>
    )}
    {open && Dialog ? <Dialog onClose={() => setOpenOn(null)} lang={lang} initialQuery={initialQuery} /> : null}
  </>;
}
