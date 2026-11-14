"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { altPath, type Lang } from "@/lib/i18n-paths";
import { singleLanguagePaths } from "@/lib/routes/registry";
import { saveLocaleSwitch } from "./localeSwitch";
import { localeSwitchCopy } from "./localeSwitchCopy";
import styles from "./localeSwitch.module.css";
import "./localeTransition.css";

const languages = ["en", "ru"] as const satisfies readonly Lang[];

/**
 * Hover or press on the other language fetches its document in the background
 * (speculation rules; ignored where unsupported). Prefetch only: a prerender
 * would run the page's analytics before the reader chose it. Added once per
 * document — a script React renders on the client would never run.
 */
function prefetchOtherLanguage() {
  if (document.getElementById("gildra-locale-prefetch") || !HTMLScriptElement.supports?.("speculationrules")) return;
  const rules = document.createElement("script");
  rules.id = "gildra-locale-prefetch";
  rules.type = "speculationrules";
  rules.textContent = JSON.stringify({
    prefetch: [{ where: { selector_matches: "[data-locale-switch-root] a:not([aria-current])" }, eagerness: "moderate" }],
  });
  document.head.append(rules);
}

/** A switch whose document never came (offline, stopped): the page comes back after this long. */
const ABANDON_MS = 6000;

function still() {
  return document.documentElement.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function markLeaving(to: Lang) {
  document.documentElement.dataset.localeLeaving = to;
}

function clearLeaving() {
  delete document.documentElement.dataset.localeLeaving;
}

/**
 * The EN/RU switch of the toolbar. The active-language pill slides to the
 * chosen side at once, the next document loads (two root layouts: always a
 * full load, without the App Router's useless RSC round-trip first) while this
 * page's content dissolves, and the other language resolves from there under
 * a still toolbar (localeTransition.css). A second press on the language of
 * the page takes the switch back while the other one is still on its way.
 */
export function LocaleSwitch({ path, lang }: { path: string; lang: Lang }) {
  const root = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<Lang | null>(null);
  const abandon = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    prefetchOtherLanguage();
    // Back from the other language (bfcache) shows this document as it was left.
    const reset = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      clearLeaving();
      setPending(null);
    };
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      clearTimeout(abandon.current);
    };
  }, []);

  const choose = (event: MouseEvent<HTMLAnchorElement>, to: Lang) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (pending && to === lang) {
      // Changed their mind: stay on this page as it was.
      window.stop();
      clearTimeout(abandon.current);
      clearLeaving();
      root.current?.setAttribute("data-active", lang);
      root.current?.removeAttribute("aria-busy");
      setPending(null);
      return;
    }
    if (to === lang || pending) return;
    const destination = altPath(path, to) + window.location.search;
    saveLocaleSwitch(destination, root.current?.closest("header") ?? null);
    setPending(to);
    // The pill, the loading line and the dissolve start on this frame, not
    // after a React render that a busy page could push past the start of the navigation.
    root.current?.setAttribute("data-active", to);
    root.current?.setAttribute("aria-busy", "true");
    if (!still()) markLeaving(to);
    clearTimeout(abandon.current);
    abandon.current = setTimeout(() => {
      clearLeaving();
      root.current?.setAttribute("data-active", lang);
      root.current?.removeAttribute("aria-busy");
      setPending(null);
    }, ABANDON_MS);
    window.location.assign(destination);
  };

  // A section in one language has no other language to switch to.
  if (singleLanguagePaths.has(altPath(path, "en").replace(/\/$/, "") || "/")) return null;
  const shown = pending ?? lang;
  return <nav ref={root} className={styles.switch} data-locale-switch-root data-active={shown}
    aria-label={localeSwitchCopy[lang].label} aria-busy={pending ? true : undefined}>
    <span className={styles.pill} data-locale-switch-pill aria-hidden="true" />
    {languages.map(item => <a key={item} className={styles.option} href={altPath(path, item)} hrefLang={item} lang={item}
      aria-current={item === lang ? "true" : undefined} data-shown={item === shown || undefined}
      onClick={event => choose(event, item)}>{item.toUpperCase()}</a>)}
  </nav>;
}
