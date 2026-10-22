"use client";

import { useDocumentInfo, useFormFields, useLocale, useTranslation } from "@payloadcms/ui";
import React, { useEffect, useState } from "react";

import { AdminSurface } from "../AdminSurface";
import { Button } from "../valyro-ui/basic/Button";
import type { PublishedLink } from "../../articles/publishedLinks";
import { useSwitchLocale } from "./useLocaleStates";

/** Words of a Lexical document: text nodes plus the text fields of blocks (titles, bodies, list items). */
function countWords(node: unknown, depth = 0): number {
  if (!node || typeof node !== "object" || depth > 40) return 0;
  const n = node as { root?: unknown; text?: unknown; children?: unknown[]; fields?: Record<string, unknown> };
  if (n.root) return countWords(n.root, depth + 1);
  const words = (value: unknown): number => (typeof value === "string" ? value.split(/\s+/).filter(Boolean).length : 0);
  let total = words(n.text);
  if (n.fields && typeof n.fields === "object") {
    for (const [key, value] of Object.entries(n.fields)) {
      if (["url", "blockType", "blockName", "id", "tone", "style"].includes(key)) continue;
      if (Array.isArray(value)) for (const item of value) for (const v of Object.values((item ?? {}) as Record<string, unknown>)) total += words(v);
      else total += words(value);
    }
  }
  for (const child of n.children ?? []) total += countWords(child, depth + 1);
  return total;
}

/**
 * Sidebar card of an article: site, public links per language (after the
 * first publication) and a pre-publish checklist for the language being
 * edited. Language status and switching live in the language bar above the
 * form; this card shares its data (no extra requests while typing).
 */
export function ArticlePanel() {
  const { id, hasPublishedDoc, lastUpdateTime } = useDocumentInfo();
  const locale = useLocale();
  const { i18n } = useTranslation();
  const ru = i18n.language !== "en";
  const { switchTo } = useSwitchLocale();
  const site = {
    slug: useFormFields(([f]) => f.siteSlug?.value),
    name: useFormFields(([f]) => f.siteName?.value),
    publicUrl: useFormFields(([f]) => f.sitePublicUrl?.value),
  };
  // Russian typed into the English version is the most common slip: say so early.
  const cyrillicInEnglish = useFormFields(
    ([f]) => locale?.code === "en" && /[а-яё]/i.test(`${f.title?.value ?? ""} ${f.summary?.value ?? ""}`),
  );
  // Pre-publish checklist for the language being edited.
  const title = useFormFields(([f]) => String(f.title?.value ?? "").trim());
  const summary = useFormFields(([f]) => String(f.summary?.value ?? "").trim());
  const words = useFormFields(([f]) => countWords(f.content?.value));
  const hasCover = useFormFields(([f]) => Boolean(f.hero?.value));
  const hasCategory = useFormFields(([f]) => Array.isArray(f.categories?.value) && (f.categories?.value as unknown[]).length > 0);
  const hasPatch = useFormFields(([f]) => Boolean(String(f["gameContext.patch"]?.value ?? "").trim()));

  const [published, setPublished] = useState<{ key: string; links: PublishedLink[] } | null>(null);
  const key = `${id}:${lastUpdateTime}`;
  useEffect(() => {
    if (!id || !hasPublishedDoc) return;
    const controller = new AbortController();
    void fetch(`/api/admin/article-links?id=${encodeURIComponent(id)}`, { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as { links: PublishedLink[] } : { links: [] })
      .then((result) => { if (!controller.signal.aborted) setPublished({ key, links: result.links }); })
      .catch(() => { if (!controller.signal.aborted) setPublished({ key, links: [] }); });
    return () => controller.abort();
  }, [id, hasPublishedDoc, key]);
  if (!id) return null;
  const live = hasPublishedDoc && published?.key === key ? published.links : [];

  return (
    <AdminSurface lang={ru ? "ru" : "en"}>
    <section className="gd-panel gd-article-panel" aria-label={ru ? "Статья на сайте" : "Article on the site"}>
      <p className="gd-article-panel__site">
        {typeof site.name === "string" ? site.name : ""}
        {typeof site.publicUrl === "string" ? <span> · {new URL(site.publicUrl).host}</span> : null}
      </p>
      {cyrillicInEnglish ? (
        <div className="gd-article-panel__alert" role="status">
          {ru ? "Похоже, текст на русском, а открыта английская версия статьи." : "This looks like Russian text in the English version."}
          <Button type="button" variant="accent" className="gd-article-panel__switch" onClick={() => switchTo("ru")}>
            {ru ? "Перейти к русской версии" : "Switch to Russian"}
          </Button>
        </div>
      ) : null}
      {live.length > 0 ? (
        <p className="gd-article-panel__live">
          {ru ? "На сайте: " : "Live: "}
          {live.map((l) => (
            <Button key={l.code} asChild variant="secondary" size="sm">
            <a href={l.url as string} target="_blank" rel="noreferrer" aria-label={`${ru ? "Открыть опубликованную версию" : "Open published version"}: ${l.short}`}>
              {l.short} ↗
            </a>
            </Button>
          ))}
        </p>
      ) : null}
      <div className="gd-article-panel__check">
        <p className="gd-article-panel__words">
          {ru
            ? `≈ ${words} слов · ${Math.max(1, Math.round(words / 200))} мин чтения`
            : `≈ ${words} words · ${Math.max(1, Math.round(words / 200))} min read`}
        </p>
        <ul>
          {(
            [
              [Boolean(title), ru ? "Заголовок" : "Title", true],
              [Boolean(summary) && summary.length <= 220, ru ? "Краткое описание, до 220 знаков" : "Summary, up to 220 characters", true],
              [words >= 80, ru ? "Текст статьи, от 80 слов" : "Article text, 80+ words", true],
              [hasCover, ru ? "Обложка" : "Cover image", false],
              [hasCategory, ru ? "Рубрика" : "Category", false],
              [hasPatch, ru ? "Патч, к которому относится статья" : "Game patch it is written for", false],
            ] as const
          ).map(([ok, label, required]) => (
            <li key={label} className={ok ? "is-ok" : required ? "is-missing" : "is-optional"}>
              <span aria-hidden="true">{ok ? "✓" : required ? "!" : "·"}</span>
              <span>
                {label}
                {!ok && !required ? <em>{ru ? " — желательно" : " — recommended"}</em> : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {!hasPublishedDoc ? (
        <p className="gd-muted gd-article-panel__note">
          {ru ? "Ссылки на сайт появятся после публикации." : "Links to the site appear after publishing."}
        </p>
      ) : null}
    </section>
    </AdminSurface>
  );
}
