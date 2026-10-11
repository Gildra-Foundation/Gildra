import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock3, Newspaper } from "lucide-react";

import { AtlasCard, AtlasFrame, AtlasGrid, AtlasHero, AtlasNotice, AtlasSection } from "@/components/atlas";
import { fetchArticle, fetchArticles } from "@/lib/cms/client";
import { cmsConfig } from "@/lib/cms/config";
import type { CmsLocale, PublicArticle } from "@/lib/cms/contract";
import { extractToc, readingMinutes, safeMediaUrl } from "@/lib/cms/richtext";
import type { Lang } from "@/lib/i18n";
import { CmsRichText } from "./CmsRichText";
import { articleHref, articlesIndexHref } from "./paths";
import styles from "./cms.module.css";

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
    prev: "← Newer",
    next: "Older →",
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
    prev: "← Новее",
    next: "Старее →",
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

  const wow = lang === "ru" ? "/ru/wow" : "/wow";

  return (
    <AtlasFrame lang={lang}>
      <AtlasHero
        breadcrumbs={[{ label: "World of Warcraft", href: wow }, { label: t.articles }]}
        breadcrumbsLabel={t.crumbs}
        emblem={<Newspaper />}
        eyebrow="World of Warcraft"
        title={t.title}
        lede={t.lead}
      />
      <AtlasSection>
        {result.status === "error" ? <AtlasNotice tone="caution" title={t.unavailable} /> : null}
        {result.status === "ok" && docs.length === 0 ? <AtlasNotice title={t.empty} /> : null}
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
                    ...(fallback ? [{ label: <span title={t.fallback}>{a.resolvedLocale?.toUpperCase()}</span> }] : []),
                  ]}
                />
              );
            })}
          </AtlasGrid>
        ) : null}
        {totalPages > 1 ? (
          <nav className={styles.pager} aria-label="Pagination">
            {page > 1 ? <Link href={`${articlesIndexHref(lang)}${page > 2 ? `?page=${page - 1}` : ""}`}>{t.prev}</Link> : null}
            {page < totalPages ? <Link href={`${articlesIndexHref(lang)}?page=${page + 1}`}>{t.next}</Link> : null}
          </nav>
        ) : null}
      </AtlasSection>
    </AtlasFrame>
  );
}

export async function ArticleDetailPage({ slug, lang }: { slug: string; lang: Lang }) {
  const t = TEXT[lang];
  const result = await fetchArticle(slug, locale(lang));
  if (result.status === "disabled" || result.status === "not-found") notFound();
  // Transient CMS errors throw: Next keeps serving the last good render, and
  // an uncached page shows the error boundary instead of invented content.
  if (result.status === "error") throw new Error(`CMS article unavailable (${result.reason})`);
  const a = result.data;
  if (!a.resolvedLocale || a.slug !== slug) notFound();

  const config = cmsConfig();
  const toc = extractToc(a.content);
  const cover = a.cover ? safeMediaUrl(a.cover.url, config.mediaOrigins, config.publicUrl || undefined) : null;
  const fallback = a.resolvedLocale !== locale(lang);
  const published = formatDate(a.publishedAt, lang);
  const reviewed = formatDate(a.game.lastReviewedAt, lang);

  const wow = lang === "ru" ? "/ru/wow" : "/wow";

  return (
    <AtlasFrame lang={lang}>
      <article lang={a.resolvedLocale}>
        <AtlasHero
          breadcrumbs={[{ label: "World of Warcraft", href: wow }, { label: t.articles, href: articlesIndexHref(lang) }, { label: a.title ?? slug }]}
          breadcrumbsLabel={t.crumbs}
          emblem={<Newspaper />}
          eyebrow={a.categories[0]?.title ?? "World of Warcraft"}
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
            </nav>
          ) : null}
          <CmsRichText content={a.content} lang={lang} />
        </div>
      </article>
    </AtlasFrame>
  );
}
