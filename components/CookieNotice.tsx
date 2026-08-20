"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "gildra-consent";

/** Уведомление о cookies: показывается один раз, выбор хранится в
 *  localStorage. Честно: сайт не ставит трекеры — только настройки
 *  и анонимная статистика хостинга. */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
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

  if (!visible) return null;

  return (
    <aside className="cookie" role="region" aria-label="Cookies">
      <p className="cookie-text">
        Gildra stores your preferences in your browser and collects anonymous
        usage statistics to improve the product. See the{" "}
        <Link href="/privacy">privacy&nbsp;policy</Link>.
      </p>
      <div className="cookie-actions">
        <button
          type="button"
          className="btn btn-primary cookie-ok"
          onClick={() => choose("accepted")}
        >
          Accept
        </button>
        <button
          type="button"
          className="cookie-no"
          onClick={() => choose("declined")}
        >
          Decline
        </button>
      </div>
    </aside>
  );
}
