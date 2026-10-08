"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { homeThemeCookie, isHomeTheme, type HomeThemeId } from "./homeThemes";
import styles from "./grimoireHome.module.css";

const ThemeContext = createContext<{ theme: HomeThemeId; selectTheme: (theme: HomeThemeId) => void } | null>(null);

export function HomeTheme({ initialTheme, children }: { initialTheme: HomeThemeId; children: ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    // Reconcile cached language pages and synchronize other open tabs.
    const restore = () => {
      try {
        const saved = localStorage.getItem(homeThemeCookie);
        if (isHomeTheme(saved)) setTheme(saved);
      } catch { /* Storage may be disabled; the current selection still works. */ }
    };
    restore();
    window.addEventListener("storage", restore);
    return () => window.removeEventListener("storage", restore);
  }, []);

  function selectTheme(next: HomeThemeId) {
    setTheme(next);
    document.cookie = `${homeThemeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try { localStorage.setItem(homeThemeCookie, next); } catch { /* Optional persistence. */ }
  }

  return <ThemeContext.Provider value={{ theme, selectTheme }}>
    <div className={styles.page} data-grimoire-home data-home-theme={theme}>{children}</div>
  </ThemeContext.Provider>;
}

export function useHomeTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Theme picker must be inside HomeTheme");
  return value;
}
