"use client";

import React, { useEffect, useState } from "react";

import { SITE_COOKIE } from "../admin/siteCookie";

/** Select `siteID` in the sidebar "Site" selector (cookie `payload-tenant`) and open `href`. */
export function chooseSite(siteID: string, href: string) {
  document.cookie = `${SITE_COOKIE}=${encodeURIComponent(siteID)}; Path=/; SameSite=Lax`;
  window.location.assign(href);
}

/**
 * Admin link scoped to one site. Payload's list and create views follow the
 * selected site, so the link switches the selector first; without JavaScript it
 * still opens `href` with whatever site is selected.
 */
export function SiteLink({
  siteID,
  href,
  className,
  children,
  title,
}: {
  siteID: string;
  href: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      title={title}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        chooseSite(siteID, href);
      }}
    >
      {children}
    </a>
  );
}

/** Date in the viewer's own time zone; the server renders the ISO date until hydration. */
export function LocalTime({ iso, lang }: { iso: string; lang: "ru" | "en" }) {
  const [text, setText] = useState(iso.slice(0, 10));
  useEffect(() => {
    const date = new Date(iso);
    const locale = lang === "ru" ? "ru-RU" : "en-GB";
    setText(new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date));
  }, [iso, lang]);
  return <time dateTime={iso}>{text}</time>;
}
