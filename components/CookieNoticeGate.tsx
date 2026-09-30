"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const CONSENT_KEY = "gildra-consent";
type CookieNoticeComponent = typeof import("./CookieNotice").CookieNotice;
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function CookieNoticeGate() {
  const pathname = usePathname();
  const [needsNotice, setNeedsNotice] = useState(false);
  const [CookieNotice, setCookieNotice] = useState<CookieNoticeComponent | null>(null);
  const hidden = pathname.startsWith("/api-console")
    || pathname.includes("/talents")
    || pathname.includes("/wow/characters/");

  useEffect(() => {
    if (hidden || window.location.hostname === "api.gildra.net") {
      setNeedsNotice(false);
      return;
    }
    try {
      if (window.localStorage.getItem(CONSENT_KEY)) {
        setNeedsNotice(false);
        return;
      }
    } catch {
      setNeedsNotice(false);
      return;
    }
    setNeedsNotice(true);
    let active = true;
    let timeout: number | null = null;
    let idleHandle: number | null = null;
    const loadNotice = () => {
      void import("./CookieNotice").then((module) => {
        if (active) setCookieNotice(() => module.CookieNotice);
      });
    };
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(loadNotice, { timeout: 1200 });
    } else {
      timeout = window.setTimeout(loadNotice, 300);
    }
    return () => {
      active = false;
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [hidden]);

  return needsNotice && !hidden && CookieNotice ? <CookieNotice /> : null;
}
