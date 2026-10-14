import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock3, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { AtlasBadge, AtlasCard, AtlasEmpty, AtlasFrame, AtlasGrid, AtlasHero, AtlasLinkButton, AtlasNotice, AtlasPagination, AtlasSection, AtlasTooltip } from "@/components/atlas";
import { fetchArticle, fetchArticles } from "@/lib/cms/client";
import { cmsConfig } from "@/lib/cms/config";
import type { CmsLocale, PublicArticle } from "@/lib/cms/contract";
import { extractToc, readingMinutes, safeMediaUrl } from "@/lib/cms/richtext";
import type { Lang } from "@/lib/i18n";
import { CmsRichText } from "./CmsRichText";
import { articleHref, articlesIndexHref } from "./paths";
import styles from "./cms.module.css";
import { routeSections, sectionHref, trail } from "@/lib/routes/registry";
import { AtlasAnchorSpy } from "@gildra/atlas-ui/AtlasAnchorSpy";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { JsonLd, articleLd, breadcrumbListLd } from "@/lib/seo/jsonld";
import { pageOpenGraph } from "@/lib/seo/metadata";
import { articlesCopy } from "./articlesCopy";

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
    updated: (d: string) => `Updated ${d}`,
    tags: "Tags",
    more: "More articles",
    all: "All articles",
    emptyHint: "Meanwhile, the raid journal and the Mythic+ atlas are ready.",
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
    updated: (d: string) => `Обновлено ${d}`,
    tags: "Теги",
    more: "Другие статьи",
    all: "Все статьи",
    emptyHint: "А пока готовы рейдовый журнал и атлас Mythic+.",
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
  return Number.isNaN(date.valueOf()) ? null : new Intl.DateTimeFormat(articlesCopy[lang === "ru" ? "ru" : "en"].dateLocale, { dateStyle: "long" }).format(date);
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
  if (served !== locale(lang)) return { robots: { index: false, follow: true } };
  const alternates = articleAlternates(a);
  const title = a.seo.title || a.title || slug;
  const description = a.seo.description || a.summary || undefined;
  return {
    title: `${title} — Gildra`,
    description,
    alternates,
    // A requested language that only falls back to another one is a duplicate page.
    robots: a.seo.noIndex || served !== locale(lang) ? { index: false, follow: true } : undefined,
    // The picture is the article card of the route (opengraph-image.tsx).
    openGraph: {
      type: "article",
      siteName: "Gildra",
      locale: served === "ru" ? "ru_RU" : "en_US",
      title,
      description,
      url: String(alternates?.canonical ?? articleHref(lang, slug)),
      publishedTime: a.publishedAt ?? undefined,
      modifiedTime: a.updatedAt ?? undefined,
      section: a.categories[0]?.title,
      tags: a.tags.map((tag) => tag.title),
    },
  };
}

export async function articlesIndexMetadata(lang: Lang): Promise<Metadata> {
  const t = TEXT[lang];
  // An empty list is not worth a search result: indexed from the first published article on.
  const list = await fetchArticles(locale(lang), 1, 1);
  const empty = list.status !== "ok" || list.data.totalDocs === 0;
  return {
    ...(empty ? { robots: { index: false, follow: true } } : {}),
    title: `${t.title} — Gildra`,
    description: t.description,
    alternates: {
      canonical: articlesIndexHref(lang),
      languages: { en: articlesIndexHref("en"), ru: articlesIndexHref("ru"), "x-default": articlesIndexHref("en") },
    },
    openGraph: pageOpenGraph(lang === "ru" ? "ru" : "en", { title: t.title, description: t.description, path: articlesIndexHref(lang) }),
  };
}

export async function ArticlesIndexPage({ lang, page = 1 }: { lang: Lang; page?: number }) {
  const t = TEXT[lang];
  const result = await fetchArticles(locale(lang), page, PAGE_SIZE);
  if (result.status === "disabled") notFound();
  const docs = result.status === "ok" ? result.data.docs.filter((article) => article.resolvedLocale === locale(lang)) : [];
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
        {result.status === "ok" && docs.length === 0 ? (
          <AtlasEmpty
            title={t.empty}
            action={<>
              <AtlasLinkButton href={sectionHref("raids", lang)}>{routeSections.raids.title[lang]}</AtlasLinkButton>
              <AtlasLinkButton href={sectionHref("mythicPlus", lang)}>{routeSections.mythicPlus.title[lang]}</AtlasLinkButton>
            </>}
          >
            {t.emptyHint}
          </AtlasEmpty>
        ) : null}
        {docs.length > 0 ? (
          <AtlasGrid min={320} fit>
            {docs.map((a) => {
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
  if (a.resolvedLocale !== locale(lang) || a.slug !== slug) notFound();
  // Newest other articles for the end of the page (same cached list the index reads).
  const latest = await fetchArticles(locale(lang), 1, 4);
  const related = latest.status === "ok" ? latest.data.docs.filter((d) => d.slug !== a.slug && d.resolvedLocale === locale(lang)).slice(0, 3) : [];
  const config = cmsConfig();
  const image = safeMediaUrl(a.seo.image?.url ?? a.cover?.url, config.mediaOrigins, config.publicUrl || undefined);
  const path = articleHref(lang, a.slug);
  // Structured data only where the page is the indexable original, not a language fallback.
  const indexable = a.resolvedLocale === locale(lang) && !a.seo.noIndex;
  return (
    <>
      {indexable ? <JsonLd data={[articleLd(a, path, image), breadcrumbListLd(trail(lang, "articles", { label: a.title ?? slug }), path)]} /> : null}
      <ArticleView article={a} lang={lang} related={related} />
    </>
  );
}

const sameDay = (a: string | null, b: string | null) => !a || !b || a.slice(0, 10) === b.slice(0, 10);

/**
 * Article page markup, shared by the published page and the CMS draft preview
 * (`/cms-preview`), so a preview looks exactly like the site. `banner` renders
 * above the article inside the page frame; a preview has no share button (its
 * address carries the preview token) and no list of other articles.
 */
export function ArticleView({ article: a, lang, banner, related = [], preview = false }: { article: PublicArticle; lang: Lang; banner?: ReactNode; related?: PublicArticle[]; preview?: boolean }) {
  const t = TEXT[lang];
  const slug = a.slug;
  const config = cmsConfig();
  const toc = extractToc(a.content);
  const cover = a.cover ? safeMediaUrl(a.cover.url, config.mediaOrigins, config.publicUrl || undefined) : null;
  const fallback = a.resolvedLocale !== locale(lang);
  const published = formatDate(a.publishedAt, lang);
  const updated = sameDay(a.publishedAt, a.updatedAt) ? null : formatDate(a.updatedAt, lang);
  const reviewed = formatDate(a.game.lastReviewedAt, lang);
  const withToc = toc.length > 1;

  return (
    <AtlasFrame lang={lang} scene="articles">
      {banner}
      <article className={styles.article} lang={a.resolvedLocale ?? undefined}>
        <AtlasHero
          breadcrumbs={trail(lang, "articles", { label: a.title ?? slug })}
          breadcrumbsLabel={t.crumbs}
          eyebrow={a.categories[0]?.title}
          title={a.title ?? slug}
          lede={a.summary || undefined}
        />
        <div className={styles.byline}>
          <p className={styles.meta}>
            {a.author?.name ? <span>{t.by(a.author.name)}</span> : null}
            {published ? <span><CalendarDays aria-hidden="true" /><time dateTime={a.publishedAt!}>{published}</time></span> : null}
            {updated ? <span><RefreshCw aria-hidden="true" /><time dateTime={a.updatedAt!}>{t.updated(updated)}</time></span> : null}
            <span><Clock3 aria-hidden="true" />{t.minutes(readingMinutes(a.content))}</span>
            {a.game.patch ? <span>{t.patch(a.game.patch)}</span> : null}
            {reviewed ? <span>{t.reviewed(reviewed)}</span> : null}
          </p>
          {preview ? null : <AtlasShareButton title={a.title ?? slug} locale={locale(lang)} />}
        </div>
        {fallback ? <AtlasNotice title={locale(lang) === "ru" ? t.fallback : t.otherOnly} /> : null}
        {/* Reading progress: a hairline under the toolbar that fills as the page scrolls (CSS only). */}
        <div className={styles.progress} aria-hidden="true" />
        <div className={`${styles.layout} ${withToc ? styles.withToc : ""}`}>
          {withToc ? (
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
          <div className={styles.body}>
            {cover ? (
              <figure className={styles.cover}>
                {/* eslint-disable-next-line @next/next/no-img-element -- origin allow-listed server-side; no remotePatterns wildcard */}
                <img src={cover} alt={a.cover?.alt ?? ""} width={a.cover?.width ?? undefined} height={a.cover?.height ?? undefined} fetchPriority="high" />
                {a.cover?.caption ? <figcaption>{a.cover.caption}</figcaption> : null}
              </figure>
            ) : null}
            <CmsRichText content={a.content} lang={lang} />
            <footer className={styles.footer}>
              {a.tags.length ? (
                <div className={styles.tags}>
                  <span className={styles.tagsLabel}>{t.tags}</span>
                  <ul>{a.tags.map((tag) => <li key={tag.id}><AtlasBadge>{tag.title}</AtlasBadge></li>)}</ul>
                </div>
              ) : null}
              {preview ? null : (
                <Link className={styles.back} href={articlesIndexHref(lang)}>
                  <ArrowLeft aria-hidden="true" />{t.all}
                </Link>
              )}
            </footer>
          </div>
        </div>
      </article>
      {related.length ? (
        <AtlasSection title={t.more} className={styles.related}>
          <AtlasGrid min={300} fit>
            {related.map((r) => {
              const date = formatDate(r.publishedAt, lang);
              return (
                <AtlasCard
                  key={r.id}
                  href={articleHref(lang, r.slug)}
                  headingLevel={3}
                  eyebrow={r.categories[0]?.title}
                  title={<span lang={r.resolvedLocale ?? undefined}>{r.title}</span>}
                  description={r.summary || undefined}
                  meta={date ? [{ icon: <CalendarDays aria-hidden="true" />, label: date }] : undefined}
                />
              );
            })}
          </AtlasGrid>
        </AtlasSection>
      ) : null}
    </AtlasFrame>
  );
}
