"use client";

import { useTenantSelection } from "@payloadcms/plugin-multi-tenant/client";
import { useRouteTransition } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { SITE_COOKIE } from "../admin/siteCookie";

/**
 * Select a site in the sidebar "Site" selector (cookie `payload-tenant`) and
 * open `href` inside the app, without reloading the page. Payload's list and
 * create views follow the selected site.
 */
export function useChooseSite() {
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const tenants = useTenantSelection();
  return useCallback(
    (siteID: string, href: string) => {
      const option = tenants?.options?.find((o) => String(o.value) === siteID);
      if (option && tenants?.setTenant) tenants.setTenant({ id: option.value, refresh: false });
      else document.cookie = `${SITE_COOKIE}=${encodeURIComponent(siteID)}; Path=/; SameSite=Lax`;
      startRouteTransition(() => router.push(href));
    },
    [router, startRouteTransition, tenants],
  );
}

/**
 * Admin link scoped to one site: switches the site selector first, then opens
 * `href`. Without JavaScript it still opens `href` with whatever site is selected.
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
  const chooseSite = useChooseSite();
  return (
    <a
      href={href}
      className={className}
      title={title}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
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
