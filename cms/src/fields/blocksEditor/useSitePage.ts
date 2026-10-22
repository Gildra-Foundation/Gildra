"use client";

import { useFormFields, useTranslation } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { findPage, type CmsPage, type Lang } from "../../blocks/contract";

type SiteInfo = { slug: string; publicUrl: string | null };
const sites = new Map<string, Promise<SiteInfo | null>>();

/** Slug and public URL of a site id, fetched once per admin session. */
function fetchSite(id: string): Promise<SiteInfo | null> {
  let hit = sites.get(id);
  if (!hit) {
    hit = fetch(`/api/sites/${encodeURIComponent(id)}?depth=0&select[slug]=true&select[publicUrl]=true`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: { slug?: unknown; publicUrl?: unknown } | null) =>
        typeof doc?.slug === "string" ? { slug: doc.slug, publicUrl: typeof doc.publicUrl === "string" ? doc.publicUrl : null } : null,
      )
      .catch(() => null);
    sites.set(id, hit);
  }
  return hit;
}

/** The document's site slug and catalog page, from the form's `site` and `slug` fields. */
export function useSitePage(): { site: string | null; publicUrl: string | null; pageId: string | null; page: CmsPage | null; lang: Lang } {
  const siteValue = useFormFields(([fields]) => fields.site?.value);
  const pageId = useFormFields(([fields]) => fields.slug?.value) as string | null | undefined;
  const { i18n } = useTranslation();
  const siteID = siteValue && typeof siteValue === "object" ? (siteValue as { id?: unknown }).id : siteValue;
  const [info, setInfo] = useState<SiteInfo | null>(null);
  useEffect(() => {
    let live = true;
    if (siteID === undefined || siteID === null || siteID === "") setInfo(null);
    else void fetchSite(String(siteID)).then((next) => live && setInfo(next));
    return () => {
      live = false;
    };
  }, [siteID]);
  const site = info?.slug ?? null;
  return { site, publicUrl: info?.publicUrl ?? null, pageId: pageId ?? null, page: findPage(site, pageId), lang: i18n.language === "ru" ? "ru" : "en" };
}
