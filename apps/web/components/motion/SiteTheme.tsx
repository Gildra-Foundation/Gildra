"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { homeThemeCookie, isHomeTheme, type HomeThemeId } from "../platform/home/homeThemes";

const CHANGE = "gildra-site-theme-change";
const ThemeContext = createContext<{
  theme: HomeThemeId;
  ready: boolean;
  selectTheme: (theme: HomeThemeId) => void;
} | null>(null);

function apply(theme: HomeThemeId) {
  document.documentElement.dataset.siteTheme = theme;
  try { document.cookie = `${homeThemeCookie}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch { /* Optional persistence. */ }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(callback: () => void) {
  const synchronize = (event: StorageEvent) => {
    if (event.key !== homeThemeCookie && event.key !== null) return;
    apply(isHomeTheme(event.newValue) ? event.newValue : "arthas");
  };
  window.addEventListener(CHANGE, callback);
  window.addEventListener("storage", synchronize);
  return () => {
    window.removeEventListener(CHANGE, callback);
    window.removeEventListener("storage", synchronize);
  };
}
function snapshot(): HomeThemeId {
  const theme = document.documentElement.dataset.siteTheme;
  return isHomeTheme(theme) ? theme : "arthas";
}
const serverSnapshot = () => null;

/** One preference for the document, portals, homepage scene and route effects. */
export function SiteTheme({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  function selectTheme(next: HomeThemeId) {
    apply(next);
    try { localStorage.setItem(homeThemeCookie, next); } catch { /* The current tab and cookie still work. */ }
  }
  return <ThemeContext.Provider value={{ theme: theme ?? "arthas", ready: theme !== null, selectTheme }}>{children}</ThemeContext.Provider>;
}

export function useSiteTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Site theme requires SiteTheme in the root document");
  return value;
}
