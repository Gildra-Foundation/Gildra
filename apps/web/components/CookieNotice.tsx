"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtlasButton } from "@gildra/atlas-ui/AtlasButton";
import { readBrowserConsent, saveBrowserConsent, consentChanged } from "@/lib/browserConsent";
import styles from "./cookieNotice.module.css";

const copy = {
  ru: { label: "Файлы cookie", text: "Gildra хранит настройки в браузере и собирает анонимную статистику использования. Подробнее — в", link: "политике конфиденциальности", accept: "Принять", decline: "Отклонить" },
  en: { label: "Cookies", text: "Gildra stores your preferences in the browser and collects anonymous usage statistics. See the", link: "privacy policy", accept: "Accept", decline: "Decline" },
} as const;

/**
 * The one cookie notice of the inner pages (the home scene asks inside its own
 * entry dialog; both write the same choice). Shown once; the choice lives in
 * localStorage. Honest: no trackers — only settings and anonymous statistics.
 * CookieNoticeGate decides where it may appear and loads it when idle.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const notice = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const text = copy[pathname === "/ru" || pathname?.startsWith("/ru/") ? "ru" : "en"];

  useEffect(() => {
    if (window.location.hostname === "api.gildra.net") return;
    const update = () => {
      try {
        setVisible(!readBrowserConsent());
      } catch {
        // Private mode without localStorage: never nag.
      }
    };
    update();
    window.addEventListener(consentChanged, update);
    return () => window.removeEventListener(consentChanged, update);
  }, []);

  // The space the notice covers at the bottom of the viewport (--cookie-notice-space):
  // atlas pages reserve it under their content (app/styles/atlas-pages.css), so a
  // short page's legal line rests just above the notice and a long one scrolls clear.
  useEffect(() => {
    const element = notice.current;
    if (!visible || !element) return;
    const root = document.documentElement;
    const measure = () => {
      const bottom = Number.parseFloat(getComputedStyle(element).bottom) || 0;
      root.style.setProperty("--cookie-notice-space", `${Math.ceil(element.offsetHeight + bottom)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--cookie-notice-space");
    };
  }, [visible]);

  const choose = (value: "accepted" | "declined") => {
    saveBrowserConsent(value);
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <aside ref={notice} className={styles.notice} role="region" aria-label={text.label} data-atlas-scope>
      <p className={styles.text}>
        {text.text}{" "}
        <Link href={text === copy.ru ? "/ru/privacy" : "/privacy"} prefetch={false}>{text.link}</Link>.
      </p>
      <div className={styles.actions}>
        <AtlasButton variant="primary" size="sm" onClick={() => choose("accepted")}>{text.accept}</AtlasButton>
        <AtlasButton variant="ghost" size="sm" onClick={() => choose("declined")}>{text.decline}</AtlasButton>
      </div>
    </aside>
  );
}
