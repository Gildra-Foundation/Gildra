"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readBrowserConsent, saveBrowserConsent, consentChanged } from "@/lib/browserConsent";

/** Уведомление о cookies: показывается один раз, выбор хранится в
 *  localStorage. Честно: сайт не ставит трекеры — только настройки
 *  и анонимная статистика хостинга. */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const lang = pathname === "/ru" || pathname?.startsWith("/ru/") ? "ru" : "en";
  const characterBook = /^\/(?:ru\/)?(?:login|wow\/characters(?:\/.*)?)\/?$/.test(pathname);
  const consentCopy = characterBook
    ? lang === "ru"
      ? "Gildra хранит настройки в браузере и собирает анонимную статистику. Подробнее —"
      : "Gildra stores browser settings and anonymous usage statistics. See the"
    : lang === "ru"
      ? "Gildra хранит настройки в вашем браузере и собирает анонимную статистику использования, чтобы улучшать продукт. Подробнее — в"
      : "Gildra stores your preferences in your browser and collects anonymous usage statistics to improve the product. See the";

  useEffect(() => {
    if (window.location.hostname === "api.gildra.net") return;
    try {
      if (!readBrowserConsent()) setVisible(true);
    } catch {
      /* приватный режим без localStorage — не показываем */
    }
  }, []);

  useEffect(() => {
    const update = () => setVisible(!readBrowserConsent());
    window.addEventListener(consentChanged, update);
    return () => window.removeEventListener(consentChanged, update);
  }, []);

  const choose = (value: "accepted" | "declined") => {
    saveBrowserConsent(value);
    setVisible(false);
  };

  if (
    !visible
    || pathname === "/" || pathname === "/ru" || pathname === "/ru/"
    || pathname.startsWith("/api-console")
    || pathname.includes("/talents")
    || pathname.includes("/wow/characters/")
  ) return null;

  return (
    <aside
      className={`cookie${characterBook ? " cookie-book" : ""}`}
      style={characterBook ? {
        "--cookie-book-paper": 'image-set(url("/_next/image?url=%2Fassets%2Fwow%2Fcharacter-book%2Ffolio-vellum-v1-optimized.webp&w=640&q=75") 1x, url("/_next/image?url=%2Fassets%2Fwow%2Fcharacter-book%2Ffolio-vellum-v1-optimized.webp&w=1920&q=75") 2x)',
        "--cookie-book-button": 'url("/_next/image?url=%2Fassets%2Fwow%2Fcharacter-book%2Fgrimoire-button-v1-optimized.webp&w=384&q=75")',
      } as CSSProperties : undefined}
      role="region"
      aria-label="Cookies"
    >
      <p className="cookie-text">
        {consentCopy}{" "}
        <Link href={lang === "ru" ? "/ru/privacy" : "/privacy"} prefetch={false}>{lang === "ru" ? "политике конфиденциальности" : "privacy policy"}</Link>.
      </p>
      <div className="cookie-actions">
        <button
          type="button"
          className="btn btn-primary cookie-ok"
          onClick={() => choose("accepted")}
        >
          {lang === "ru" ? "Принять" : "Accept"}
        </button>
        <button
          type="button"
          className="cookie-no"
          onClick={() => choose("declined")}
        >
          {lang === "ru" ? "Отклонить" : "Decline"}
        </button>
      </div>
    </aside>
  );
}
