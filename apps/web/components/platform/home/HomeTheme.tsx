"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSiteTheme } from "@/components/motion/SiteTheme";
import type { HomeThemeId } from "./homeThemes";
import styles from "./grimoireHome.module.css";

const HomeContext = createContext<{ theme: HomeThemeId; selectTheme: (theme: HomeThemeId) => void } | null>(null);

export function HomeTheme({ initialTheme, children }: { initialTheme: HomeThemeId; children: ReactNode }) {
  const { theme, ready, selectTheme } = useSiteTheme();
  const selected = ready ? theme : initialTheme;
  return <HomeContext.Provider value={{ theme: selected, selectTheme }}>
    <div className={styles.page} data-grimoire-home data-home-theme={selected}>{children}</div>
  </HomeContext.Provider>;
}

// Preserve the server's selected art/quote until the document preference hydrates.
export function useHomeTheme() {
  const value = useContext(HomeContext);
  if (!value) throw new Error("Home scene requires HomeTheme");
  return value;
}
