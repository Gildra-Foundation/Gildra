import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, Clock3 } from "lucide-react";
import type { ReactNode } from "react";

import { AtlasCard, AtlasEmpty, AtlasFrame, AtlasGrid, AtlasHero, AtlasNotice, AtlasPagination, AtlasSection, AtlasTooltip } from "@/components/atlas";
import { fetchArticle, fetchArticles } from "@/lib/cms/client";
import { cmsConfig } from "@/lib/cms/config";
import type { CmsLocale, PublicArticle } from "@/lib/cms/contract";
import { extractToc, readingMinutes, safeMediaUrl } from "@/lib/cms/richtext";
import type { Lang } from "@/lib/i18n";
import { CmsRichText } from "./CmsRichText";
import { articleHref, articlesIndexHref } from "./paths";
import styles from "./cms.module.css";
import { trail } from "@/lib/routes/registry";
import { AtlasAnchorSpy } from "@/components/atlas/AtlasAnchorSpy";

const TEXT = {
  en: {
    title: "World of Warcraft articles",
    lead: "Guides and explainers from the Gildra editors.",
    description: "World of Warcraft guides and explainers from the Gildra editors.",
    empty: "No articles have been published yet.",
    unavailable: "Articles are temporarily unavailable. Please try again later.",
    crumbs: "Breadcrumbs",
    articles: "Articles",
    contents: "Contents",
    minutes: (n: number) => `${n} min read`,
    by: (name: string) => `By ${name}`,
    patch: (v: string) => `Patch ${v}`,
    reviewed: (d: string) => `Reviewed ${d}`,
    fallback: "This article is not available in Russian yet; the English original is shown.",
    fallbackBadge: "EN",
    otherOnly: "This article is only available in Russian; the Russian original is shown.",
    prev: "Newer",
    next: "Older",
    pages: "Pages",
    pageOf: (page: number, total: number) => `Page ${page} of ${total}`,
  },
  ru: {
    title: "Статьи о World of Warcraft",
    lead: "Гайды и разборы от редакции Gildra.",
    description: "Гайды и разборы World of Warcraft от редакции Gildra.",
    empty: "Статьи ещё не опубликованы.",
    unavailable: "Статьи временно недоступны. Попробуйте позже.",
    crumbs: "Хлебные крошки",
    articles: "Статьи",
    contents: "Содержание",
    minutes: (n: number) => `${n} мин чтения`,
    by: (name: string) => `Автор: ${name}`,
    patch: (v: string) => `Патч ${v}`,
    reviewed: (d: string) => `Проверено ${d}`,
    fallback: "Перевода на русский пока нет — показан английский оригинал.",
    fallbackBadge: "EN",
    otherOnly: "Статья доступна только на английском — показан английский оригинал.",
    prev: "Новее",
    next: "Старее",
    pages: "Страницы",
    pageOf: (page: number, total: number) => `Страница ${page} из ${total}`,
  },
} as const;

const PAGE_SIZE = 24;
const locale = (lang: Lang): CmsLocale => (lang === "ru" ? "ru" : "en");

function formatDate(value: string | null, lang: Lang): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "en-GB", { dateStyle: "long" }).format(date);
}

/** hreflang only for languages that really exist in the published version. */
export function articleAlternates(article: Pick<PublicArticle, "slug" | "availableLocales" | "resolvedLocale">): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of article.availableLocales) languages[l] = articleHref(l, article.slug);
  if (article.availableLocales.includes("en")) languages["x-default"] = articleHref("en", article.slug);
  const canonical = articleHref(article.resolvedLocale ?? "en", article.slug);
  return { canonical, languages: Object.keys(languages).length > 1 ? languages : undefined };
}

export async function articleMetadata(slug: string, lang: Lang): Promise<Metadata> {
  const result = await fetchArticle(slug, locale(lang));
  if (result.status !== "ok") return { robots: { index: false } };
  const a = result.data;
  const served = a.resolvedLocale;
  const image = safeMediaUrl(a.seo.image?.url ?? a.cover?.url, cmsConfig().mediaOrigins, cmsConfig().publicUrl || undefined);
  return {
    title: `${a.seo.title || a.title || slug} — Gildra`,
    description: a.seo.description || a.summary || undefined,
    alternates: articleAlternates(a),
    // A requested language that only falls back to another one is a duplicate page.
    robots: a.seo.noIndex || served !== locale(lang) ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "article",
      title: a.seo.title || a.title || undefined,
      description: a.seo.description || a.summary || undefined,
      locale: served === "ru" ? "ru_RU" : "en_US",
      publishedTime: a.publishedAt ?? undefined,
      images: image ? [image] : undefined,
    },
  };
}

export function articlesIndexMetadata(lang: Lang): Metadata {
  const t = TEXT[lang];
  return {
    title: `${t.title} — Gildra`,
    description: t.description,
    alternates: {
      canonical: articlesIndexHref(lang),
      languages: { en: articlesIndexHref("en"), ru: articlesIndexHref("ru"), "x-default": articlesIndexHref("en") },
    },
  };
}

export async function ArticlesIndexPage({ lang, page = 1 }: { lang: Lang; page?: number }) {
  const t = TEXT[lang];
  const result = await fetchArticles(locale(lang), page, PAGE_SIZE);
  if (result.status === "disabled") notFound();
  const docs = result.status === "ok" ? result.data.docs : [];
  const totalPages = result.status === "ok" ? result.data.totalPages : 0;


  return (
    <AtlasFrame lang={lang} scene="articles">
      <AtlasHero
        breadcrumbs={trail(lang, "articles")}
        breadcrumbsLabel={t.crumbs}
        title={t.title}
        lede={t.lead}
      />
      <AtlasSection>
        {result.status === "error" ? <AtlasNotice tone="caution" title={t.unavailable} /> : null}
        {result.status === "ok" && docs.length === 0 ? <AtlasEmpty title={t.empty} /> : null}
        {docs.length > 0 ? (
          <AtlasGrid min={320} fit>
            {docs.map((a) => {
              const fallback = a.resolvedLocale !== null && a.resolvedLocale !== locale(lang);
              const date = formatDate(a.publishedAt, lang);
              return (
                <AtlasCard
                  key={a.id}
                  href={articleHref(lang, a.slug)}
                  eyebrow={a.categories[0]?.title}
                  title={<span lang={a.resolvedLocale ?? undefined}>{a.title}</span>}
                  description={a.summary || undefined}
                  meta={[
                    ...(date ? [{ icon: <CalendarDays aria-hidden="true" />, label: date }] : []),
                    ...(fallback ? [{ label: <AtlasTooltip content={t.fallback}><span>{a.resolvedLocale?.toUpperCase()}<span className="sr-only"> — {t.fallback}</span></span></AtlasTooltip> }] : []),
                  ]}
                />
              );
            })}
          </AtlasGrid>
        ) : null}
        {totalPages > 1 ? (
          <AtlasPagination
            label={t.pages}
            prev={page > 1 ? { href: `${articlesIndexHref(lang)}${page > 2 ? `?page=${page - 1}` : ""}`, label: t.prev } : undefined}
            next={page < totalPages ? { href: `${articlesIndexHref(lang)}?page=${page + 1}`, label: t.next } : undefined}
            status={t.pageOf(page, totalPages)}
          />
        ) : null}
      </AtlasSection>
    </AtlasFrame>
  );
}

export async function ArticleDetailPage({ slug, lang }: { slug: string; lang: Lang }) {
  const result = await fetchArticle(slug, locale(lang));
  if (result.status === "disabled" || result.status === "not-found") notFound();
  // Transient CMS errors throw: Next keeps serving the last good render, and
  // an uncached page shows the error boundary instead of invented content.
  if (result.status === "error") throw new Error(`CMS article unavailable (${result.reason})`);
  const a = result.data;
  if (!a.resolvedLocale || a.slug !== slug) notFound();
  return <ArticleView article={a} lang={lang} />;
}

/**
 * Article page markup, shared by the published page and the CMS draft preview
 * (`/cms-preview`), so a preview looks exactly like the site. `banner` renders
 * above the article inside the page frame.
 */
export function ArticleView({ article: a, lang, banner }: { article: PublicArticle; lang: Lang; banner?: ReactNode }) {
  const t = TEXT[lang];
  const slug = a.slug;
  const config = cmsConfig();
  const toc = extractToc(a.content);
  const cover = a.cover ? safeMediaUrl(a.cover.url, config.mediaOrigins, config.publicUrl || undefined) : null;
  const fallback = a.resolvedLocale !== locale(lang);
  const published = formatDate(a.publishedAt, lang);
  const reviewed = formatDate(a.game.lastReviewedAt, lang);


  return (
    <AtlasFrame lang={lang}>
      {banner}
      <article lang={a.resolvedLocale ?? undefined}>
        <AtlasHero
          breadcrumbs={trail(lang, "articles", { label: a.title ?? slug })}
          breadcrumbsLabel={t.crumbs}
          eyebrow={a.categories[0]?.title}
          title={a.title ?? slug}
          lede={a.summary || undefined}
        />
        <p className={styles.meta}>
          {a.author?.name ? <span>{t.by(a.author.name)}</span> : null}
          {published ? <span><CalendarDays aria-hidden="true" /><time dateTime={a.publishedAt!}>{published}</time></span> : null}
          <span><Clock3 aria-hidden="true" />{t.minutes(readingMinutes(a.content))}</span>
          {a.game.patch ? <span>{t.patch(a.game.patch)}</span> : null}
          {reviewed ? <span>{t.reviewed(reviewed)}</span> : null}
        </p>
        {fallback ? <AtlasNotice title={locale(lang) === "ru" ? t.fallback : t.otherOnly} /> : null}
        {cover ? (
          <figure className={styles.cover}>
            {/* eslint-disable-next-line @next/next/no-img-element -- origin allow-listed server-side; no remotePatterns wildcard */}
            <img src={cover} alt={a.cover?.alt ?? ""} width={a.cover?.width ?? undefined} height={a.cover?.height ?? undefined} />
          </figure>
        ) : null}
        {/* Reading progress: a hairline under the toolbar that fills as the page scrolls (CSS only). */}
        <div className={styles.progress} aria-hidden="true" />
        <div className={`${styles.layout} ${toc.length > 1 ? styles.withToc : ""}`}>
          {toc.length > 1 ? (
            <nav className={styles.toc} aria-label={t.contents}>
              <p>{t.contents}</p>
              <ol>
                {toc.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>{item.text}</a>
                  </li>
                ))}
              </ol>
              {/* Marks the chapter being read (aria-current), as on every atlas chapter strip. */}
              <AtlasAnchorSpy />
            </nav>
          ) : null}
          <CmsRichText content={a.content} lang={lang} />
        </div>
      </article>
    </AtlasFrame>
  );
}
