"use client";

import { useDocumentInfo, useFormFields, useLocale, useTranslation } from "@payloadcms/ui";
import React, { useEffect, useState } from "react";

import { articleUrl } from "../../admin/sitePaths";

type Completeness = Record<string, { title: boolean; summary: boolean; content: boolean }>;

const LOCALES = [
  { code: "ru", ru: "Русский", en: "Russian" },
  { code: "en", ru: "Английский", en: "English" },
];

const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/** Lexical document with at least one non-empty text node. */
function hasText(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { text?: unknown; children?: unknown[]; root?: unknown; type?: string };
  if (n.root) return hasText(n.root);
  if (typeof n.text === "string" && n.text.trim()) return true;
  if (n.type === "upload" || n.type === "block" || n.type === "relationship") return true;
  return Array.isArray(n.children) && n.children.some(hasText);
}

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
 * Sidebar card of an article: site, public links per language (after the first
 * publication) and which languages are complete. The language check reads the
 * latest draft of every locale, so it reflects what the editor just saved.
 */
export function ArticlePanel() {
  const { id, collectionSlug, hasPublishedDoc, lastUpdateTime } = useDocumentInfo();
  const locale = useLocale();
  const { i18n } = useTranslation();
  const ru = i18n.language !== "en";
  const slug = useFormFields(([f]) => f.slug?.value as string | undefined) ?? "";
  const site = {
    slug: useFormFields(([f]) => f.siteSlug?.value),
    name: useFormFields(([f]) => f.siteName?.value),
    publicUrl: useFormFields(([f]) => f.sitePublicUrl?.value),
  };
  const [langs, setLangs] = useState<Completeness | null>(null);
  // Russian typed into the English version is the most common slip: say so early.
  const typed = useFormFields(([f]) => `${f.title?.value ?? ""} ${f.summary?.value ?? ""}`);
  const cyrillicInEnglish = locale?.code === "en" && /[а-яё]/i.test(typed);
  // Pre-publish checklist for the language being edited.
  const title = useFormFields(([f]) => String(f.title?.value ?? "").trim());
  const summary = useFormFields(([f]) => String(f.summary?.value ?? "").trim());
  const words = useFormFields(([f]) => countWords(f.content?.value));
  const hasCover = useFormFields(([f]) => Boolean(f.hero?.value));
  const hasCategory = useFormFields(([f]) => Array.isArray(f.categories?.value) && (f.categories?.value as unknown[]).length > 0);
  const hasPatch = useFormFields(([f]) => Boolean(String(f["gameContext.patch"]?.value ?? "").trim()));

  useEffect(() => {
    if (!id || !collectionSlug) return;
    const controller = new AbortController();
    const q = "locale=all&draft=true&depth=0&select[title]=true&select[summary]=true&select[content]=true";
    fetch(`/api/${collectionSlug}/${id}?${q}`, { credentials: "include", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc: Record<string, Record<string, unknown> | undefined> | null) => {
        if (!doc) return;
        const out: Completeness = {};
        for (const { code } of LOCALES) {
          out[code] = {
            title: filled(doc.title?.[code]),
            summary: filled(doc.summary?.[code]),
            content: hasText(doc.content?.[code]),
          };
        }
        setLangs(out);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [id, collectionSlug, lastUpdateTime]);

  if (!id) return null;
  const switchTo = (code: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("locale", code);
    window.location.assign(url.toString());
  };

  return (
    <section className="gd-panel gd-article-panel" aria-label={ru ? "Статья на сайте" : "Article on the site"}>
      <p className="gd-article-panel__site">
        {typeof site.name === "string" ? site.name : ""}
        {typeof site.publicUrl === "string" ? <span> · {new URL(site.publicUrl).host}</span> : null}
      </p>
      {cyrillicInEnglish ? (
        <div className="gd-article-panel__alert" role="status">
          {ru
            ? "Похоже, текст на русском, а открыта английская версия статьи."
            : "This looks like Russian text in the English version."}
          <button type="button" onClick={() => switchTo("ru")}>
            {ru ? "Перейти к русской версии" : "Switch to Russian"}
          </button>
        </div>
      ) : null}
      <ul className="gd-article-panel__langs">
        {LOCALES.map(({ code, ...label }) => {
          const state = langs?.[code];
          const done = state && state.title && state.summary && state.content;
          const missing = state
            ? [
                !state.title && (ru ? "заголовок" : "title"),
                !state.summary && (ru ? "описание" : "summary"),
                !state.content && (ru ? "текст" : "text"),
              ].filter(Boolean)
            : [];
          const link = hasPublishedDoc && done ? articleUrl(site, slug, code) : null;
          return (
            <li key={code} className={code === locale?.code ? "is-current" : undefined}>
              <span className={`gd-dot ${state ? (done ? "gd-dot--ok" : "gd-dot--warn") : ""}`} aria-hidden="true" />
              <span className="gd-article-panel__lang">
                {ru ? label.ru : label.en}
                {code === locale?.code ? (
                  <em>{ru ? " — редактируете" : " — editing"}</em>
                ) : (
                  <button type="button" onClick={() => switchTo(code)}>
                    {ru ? "открыть" : "open"}
                  </button>
                )}
                {state && !done ? (
                  <small>
                    {ru ? "нет: " : "missing: "}
                    {missing.join(", ")}
                    {ru ? " — на сайте покажется другой язык" : " — the site falls back to another language"}
                  </small>
                ) : null}
              </span>
              {link ? (
                <a href={link} target="_blank" rel="noreferrer" className="gd-article-panel__open">
                  {ru ? "на сайте ↗" : "live ↗"}
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="gd-article-panel__check">
        <p className="gd-article-panel__words">
          {ru ? `≈ ${words} слов · ${Math.max(1, Math.round(words / 200))} мин чтения` : `≈ ${words} words · ${Math.max(1, Math.round(words / 200))} min read`}
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
              {label}
              {!ok && !required ? <em>{ru ? " — желательно" : " — recommended"}</em> : null}
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
  );
}
