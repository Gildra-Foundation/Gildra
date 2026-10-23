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
export function useSitePage(): { site: string | null; publicUrl: string | null; pageId: string | null; page: CmsPage | null; lang: Lang; loading: boolean } {
  const siteValue = useFormFields(([fields]) => fields.site?.value);
  const pageId = useFormFields(([fields]) => fields.slug?.value) as string | null | undefined;
  const { i18n } = useTranslation();
  const siteID = siteValue && typeof siteValue === "object" ? (siteValue as { id?: unknown }).id : siteValue;
  const [info, setInfo] = useState<SiteInfo | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = siteID === undefined || siteID === null || siteID === "" ? null : String(siteID);
  useEffect(() => {
    let live = true;
    if (key === null) setInfo(null);
    else
      void fetchSite(key).then((next) => {
        if (!live) return;
        setInfo(next);
        setLoadedFor(key);
      });
    return () => {
      live = false;
    };
  }, [key]);
  const loading = key !== null && loadedFor !== key;
  const site = loading ? null : (info?.slug ?? null);
  return { site, publicUrl: loading ? null : (info?.publicUrl ?? null), pageId: pageId ?? null, page: findPage(site, pageId), lang: i18n.language === "ru" ? "ru" : "en", loading };
}
