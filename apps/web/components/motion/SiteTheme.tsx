"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { homeThemeCookie, isHomeTheme, type HomeThemeId } from "../platform/home/homeThemes";

const CHANGE = "gildra-site-theme-change";
/** Presence marker only: the provider value never changes, so a theme update
 *  re-renders the components that read it and nothing else. (A changing value
 *  here reached every dehydrated Suspense boundary under the root and forced the
 *  lazy top bar to client-render, dropping it for ~0.5 s: CLS on every page.) */
const ThemeContext = createContext(false);

function apply(theme: HomeThemeId) {
  document.documentElement.dataset.siteTheme = theme;
  try { document.cookie = `${homeThemeCookie}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch { /* Optional persistence. */ }
  window.dispatchEvent(new Event(CHANGE));
}

/** Another tab chose a character: follow it in this document. */
function synchronize(event: StorageEvent) {
  if (event.key !== homeThemeCookie && event.key !== null) return;
  apply(isHomeTheme(event.newValue) ? event.newValue : "arthas");
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE, callback);
  return () => window.removeEventListener(CHANGE, callback);
}
function snapshot(): HomeThemeId {
  const theme = document.documentElement.dataset.siteTheme;
  return isHomeTheme(theme) ? theme : "arthas";
}
const serverSnapshot = () => null;

function selectTheme(next: HomeThemeId) {
  apply(next);
  try { localStorage.setItem(homeThemeCookie, next); } catch { /* The current tab and cookie still work. */ }
}

/** One preference for the document, portals, homepage scene and route effects. */
export function SiteTheme({ children }: { children: ReactNode }) {
  // Cross-tab synchronization on every page, without holding the theme in state here.
  useEffect(() => {
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);
  return <ThemeContext.Provider value={true}>{children}</ThemeContext.Provider>;
}

export function useSiteTheme() {
  if (!useContext(ThemeContext)) throw new Error("Site theme requires SiteTheme in the root document");
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { theme: theme ?? "arthas", ready: theme !== null, selectTheme };
}
