"use client";

import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./deferredMount.module.css";

/** Keep below-fold features out of the initial render until the reader is close. */
export function DeferredMount({ children, minHeight = 320, rootMargin = "700px 0px" }: {
  children: ReactNode;
  minHeight?: number;
  rootMargin?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!("IntersectionObserver" in window)) {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      startTransition(() => setMounted(true));
    }, { rootMargin });
    observer.observe(host);
    return () => observer.disconnect();
  }, [rootMargin]);

  return (
    <div ref={hostRef} className={mounted ? styles.ready : styles.waiting} aria-busy={!mounted}>
      {mounted ? children : <div className={styles.placeholder} style={{ minHeight }} aria-hidden="true" />}
    </div>
  );
}
