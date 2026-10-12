"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtlasButton } from "@/components/atlas/AtlasButton";
import { readBrowserConsent, saveBrowserConsent, consentChanged } from "@/lib/browserConsent";
import styles from "./cookieNotice.module.css";

const copy = {
  ru: { text: "Gildra хранит настройки в браузере и собирает анонимную статистику использования. Подробнее — в", link: "политике конфиденциальности", accept: "Принять", decline: "Отклонить" },
  en: { text: "Gildra stores your preferences in the browser and collects anonymous usage statistics. See the", link: "privacy policy", accept: "Accept", decline: "Decline" },
} as const;

/**
 * The one cookie notice of the inner pages (the home scene asks inside its own
 * entry dialog; both write the same choice). Shown once; the choice lives in
 * localStorage. Honest: no trackers — only settings and anonymous statistics.
 * CookieNoticeGate decides where it may appear and loads it when idle.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);
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

  const choose = (value: "accepted" | "declined") => {
    saveBrowserConsent(value);
    setVisible(false);
  };

  if (!visible) return null;
  return (
    <aside className={styles.notice} role="region" aria-label="Cookies" data-atlas-scope>
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
