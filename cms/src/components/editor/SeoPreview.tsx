"use client";

import { useFormFields, useLocale, useTranslation } from "@payloadcms/ui";
import React from "react";

import { articleUrl } from "../../admin/sitePaths";

const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 160;

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

function Counter({ length, limit, ru }: { length: number; limit: number; ru: boolean }) {
  const over = length > limit;
  return (
    <span className={over ? "gd-seo__count gd-seo__count--over" : "gd-seo__count"}>
      {length}/{limit}
      {over ? (ru ? " — поисковик обрежет" : " — search engines will cut it") : ""}
    </span>
  );
}

/**
 * How the article will look in search results for the language being edited.
 * Empty SEO fields fall back to the article title and summary, exactly as the
 * sites do, so the preview shows what is really published.
 */
export function SeoPreview() {
  const locale = useLocale();
  const { i18n } = useTranslation();
  const ru = i18n.language !== "en";
  const seoTitle = useFormFields(([f]) => text(f["seo.title"]?.value));
  const seoDescription = useFormFields(([f]) => text(f["seo.description"]?.value));
  const title = useFormFields(([f]) => text(f.title?.value));
  const summary = useFormFields(([f]) => text(f.summary?.value));
  const slug = useFormFields(([f]) => text(f.slug?.value));
  const noIndex = useFormFields(([f]) => Boolean(f["seo.noIndex"]?.value));
  const site = {
    slug: useFormFields(([f]) => f.siteSlug?.value),
    name: useFormFields(([f]) => f.siteName?.value),
    publicUrl: useFormFields(([f]) => f.sitePublicUrl?.value),
  };
  const shownTitle = seoTitle || title;
  const shownDescription = seoDescription || summary;
  const url = articleUrl(site, slug || "…", locale?.code ?? "en");

  return (
    <div className="gd-seo">
      <p className="gd-seo__label">{ru ? "Так статья выглядит в поиске" : "Search result preview"}</p>
      <div className="gd-seo__card">
        <p className="gd-seo__url">{url ?? (typeof site.publicUrl === "string" ? site.publicUrl : "")}</p>
        <p className="gd-seo__title">
          {shownTitle ? `${shownTitle}${typeof site.name === "string" ? ` — ${site.name}` : ""}` : ru ? "Нет заголовка" : "No title"}
        </p>
        <p className="gd-seo__desc">{shownDescription || (ru ? "Нет описания" : "No description")}</p>
      </div>
      <p className="gd-seo__meta">
        {ru ? "Заголовок" : "Title"} <Counter length={shownTitle.length} limit={TITLE_LIMIT} ru={ru} />
        {" · "}
        {ru ? "Описание" : "Description"} <Counter length={shownDescription.length} limit={DESCRIPTION_LIMIT} ru={ru} />
      </p>
      {!seoTitle || !seoDescription ? (
        <p className="gd-muted gd-seo__hint">
          {ru
            ? "Пустые поля ниже берутся из заголовка и краткого описания статьи."
            : "Empty fields below fall back to the article title and summary."}
        </p>
      ) : null}
      {noIndex ? <p className="gd-seo__warn">{ru ? "Статья скрыта от поисковиков." : "Hidden from search engines."}</p> : null}
    </div>
  );
}
