"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./grimoireHome.module.css";

export function HomeTheme({ children }: { children: ReactNode }) {
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
  return <div ref={page} className={styles.page} data-grimoire-home data-home-theme="arthas" data-cookie-notice-space>{children}</div>;
}
