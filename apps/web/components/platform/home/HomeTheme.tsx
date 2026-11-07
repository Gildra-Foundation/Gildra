"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useSiteTheme } from "@/components/motion/SiteTheme";
import type { HomeThemeId } from "./homeThemes";
import styles from "./grimoireHome.module.css";

const HomeContext = createContext<{ theme: HomeThemeId; selectTheme: (theme: HomeThemeId) => void } | null>(null);

export function HomeTheme({ initialTheme, children }: { initialTheme: HomeThemeId; children: ReactNode }) {
  const { theme, ready, selectTheme } = useSiteTheme();
  const selected = ready ? theme : initialTheme;
  const page = useRef<HTMLDivElement>(null);
  // The snowfall rests while it is scrolled out of view (the falls stay where they were).
  useEffect(() => {
    const element = page.current;
    const snow = element?.querySelector(`.${styles.snow}`);
    if (!element || !snow || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => { element.toggleAttribute("data-snow-rest", !entry.isIntersecting); });
    observer.observe(snow);
    return () => observer.disconnect();
  }, []);
  return <HomeContext.Provider value={{ theme: selected, selectTheme }}>
    <div ref={page} className={styles.page} data-grimoire-home data-home-theme={selected} data-cookie-notice-space>{children}</div>
  </HomeContext.Provider>;
}

// Preserve the server's selected art/quote until the document preference hydrates.
export function useHomeTheme() {
  const value = useContext(HomeContext);
  if (!value) throw new Error("Home scene requires HomeTheme");
  return value;
}
