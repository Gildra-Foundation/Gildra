"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { altPath, type Lang } from "@/lib/i18n-paths";
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

/**
 * The EN/RU switch of the toolbar. The active-language pill slides to the
 * chosen side at once, the next document loads (two root layouts: always a
 * full load, without the App Router's useless RSC round-trip first) and its
 * content brightens in under a still toolbar (localeTransition.css).
 */
export function LocaleSwitch({ path, lang }: { path: string; lang: Lang }) {
  const root = useRef<HTMLElement>(null);
  const [pending, setPending] = useState<Lang | null>(null);

  useEffect(() => {
    prefetchOtherLanguage();
    // Back from the other language (bfcache) shows this document as it was left.
    const reset = (event: PageTransitionEvent) => { if (event.persisted) setPending(null); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const choose = (event: MouseEvent<HTMLAnchorElement>, to: Lang) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (to === lang || pending) return;
    const destination = altPath(path, to) + window.location.search;
    saveLocaleSwitch(destination, root.current?.closest("header") ?? null);
    setPending(to);
    window.location.assign(destination);
  };

  const shown = pending ?? lang;
  return <nav ref={root} className={styles.switch} data-locale-switch-root data-active={shown}
    aria-label={localeSwitchCopy[lang].label} aria-busy={pending ? true : undefined}>
    <span className={styles.pill} data-locale-switch-pill aria-hidden="true" />
    {languages.map(item => <a key={item} className={styles.option} href={altPath(path, item)} hrefLang={item} lang={item}
      aria-current={item === lang ? "true" : undefined} data-shown={item === shown || undefined}
      onClick={event => choose(event, item)}>{item.toUpperCase()}</a>)}
  </nav>;
}
