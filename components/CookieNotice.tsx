"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { langOf, p, t } from "@/lib/i18n";

const KEY = "gildra-consent";

/** Уведомление о cookies: показывается один раз, выбор хранится в
 *  localStorage. Честно: сайт не ставит трекеры — только настройки
 *  и анонимная статистика хостинга. */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const lang = langOf(pathname);
  const tt = t(lang);

  useEffect(() => {
    if (window.location.hostname === "api.gildra.net") return;
    try {
      if (!localStorage.getItem(KEY)) setVisible(true);
    } catch {
      /* приватный режим без localStorage — не показываем */
    }
  }, []);

  const choose = (value: "accepted" | "declined") => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible || pathname.startsWith("/api-console") || pathname.includes("/talents")) return null;

  return (
    <aside className="cookie" role="region" aria-label="Cookies">
      <p className="cookie-text">
        {tt(
          "Gildra stores your preferences in your browser and collects anonymous usage statistics to improve the product. See the",
        )}{" "}
        <Link href={p(lang, "/privacy")}>{tt("privacy policy")}</Link>.
      </p>
      <div className="cookie-actions">
        <button
          type="button"
          className="btn btn-primary cookie-ok"
          onClick={() => choose("accepted")}
        >
          {tt("Accept")}
        </button>
        <button
          type="button"
          className="cookie-no"
          onClick={() => choose("declined")}
        >
          {tt("Decline")}
        </button>
      </div>
    </aside>
  );
}
