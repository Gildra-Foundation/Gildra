import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { AtlasFrame } from "@/components/atlas/AtlasFrame";
import { AtlasBadge } from "@gildra/atlas-ui/AtlasBadge";
import { AtlasGrid } from "@gildra/atlas-ui/AtlasGrid";
import { AtlasHero } from "@gildra/atlas-ui/AtlasHero";
import { AtlasLinkButton } from "@gildra/atlas-ui/AtlasButton";
import { AtlasNotice } from "@gildra/atlas-ui/AtlasNotice";
import { AtlasPagination } from "@gildra/atlas-ui/AtlasPagination";
import { AtlasSection } from "@gildra/atlas-ui/AtlasSection";
import { AtlasPanel } from "@gildra/atlas-ui/AtlasPanel";
import { fetchArticle, fetchArticles } from "@/lib/cms/client";
import { cmsConfig } from "@/lib/cms/config";
import type { CmsLocale, PublicArticle } from "@/lib/cms/contract";
import { extractToc, readingMinutes, safeMediaUrl } from "@/lib/cms/richtext";
import type { Lang } from "@/lib/i18n";
import { CmsRichText } from "./CmsRichText";
import { articleHref, articlesIndexHref } from "./paths";
import styles from "./cms.module.css";
import { routeSections, sectionHref, trail } from "@/lib/routes/registry";
import { ArticleContents } from "./ArticleContents";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { JsonLd, articleLd, breadcrumbListLd } from "@/lib/seo/jsonld";
import { pageOpenGraph } from "@/lib/seo/metadata";
import { articlesCopy } from "./articlesCopy";


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
  const t = articlesCopy[lang];
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
  const t = articlesCopy[lang];
  const result = await fetchArticles(locale(lang), page, PAGE_SIZE);
  const docs = result.status === "ok" ? result.data.docs.filter((article) => article.resolvedLocale === locale(lang)) : [];
  const gridDocs = page === 1 ? docs.slice(1) : docs;
  const totalPages = result.status === "ok" ? result.data.totalPages : 0;
  // An absent index endpoint is a service failure, not proof of an empty library.
  const unavailable = result.status === "error" || result.status === "not-found";
  const emptyTitle = result.status === "disabled" ? t.preparing : page > 1 ? t.pageEmpty : t.empty;

  return (
    <AtlasFrame lang={lang} scene="articles" dataAttributes={{ "data-articles-view": "index" }}>
      <AtlasHero
        breadcrumbs={trail(lang, "articles")}
        breadcrumbsLabel={t.crumbs}
        eyebrow={t.eyebrow}
        title={t.title}
        lede={t.lead}
        aside={docs.length === 0 ? (
          <AtlasPanel as="section" padding="lg" className={styles.indexState} aria-labelledby="articles-state-title">
            <div role={unavailable ? "alert" : "status"}>
              <h2 id="articles-state-title">{unavailable ? t.unavailableTitle : emptyTitle}</h2>
              <p>{unavailable ? t.unavailable : result.status === "disabled" ? t.preparingHint : t.emptyHint}</p>
            </div>
            <div className={styles.stateLinks}>
              {page > 1 ? (
                <AtlasLinkButton href={articlesIndexHref(lang)} icon={<ArrowLeft aria-hidden="true" />}>{t.all}</AtlasLinkButton>
              ) : (
                <>
                  <AtlasLinkButton href={sectionHref("raids", lang)} iconAfter={<ArrowRight aria-hidden="true" />}>{routeSections.raids.title[lang]}</AtlasLinkButton>
                  <AtlasLinkButton variant="ghost" href={sectionHref("mythicPlus", lang)}>{routeSections.mythicPlus.title[lang]}</AtlasLinkButton>
                </>
              )}
            </div>
          </AtlasPanel>
        ) : undefined}
      />
      {docs.length > 0 ? (
        <AtlasSection title={t.latest}>
          {page === 1 ? <ArticleCard article={docs[0]} lang={lang} featured /> : null}
          {gridDocs.length > 0 ? (
            <AtlasGrid min={300} fit>
              {gridDocs.map((article) => <ArticleCard key={article.id} article={article} lang={lang} />)}
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
      ) : null}
    </AtlasFrame>
  );
}

/** List and related articles share the same published metadata and media allow-list. */
function ArticleCard({ article: a, lang, featured = false }: { article: PublicArticle; lang: Lang; featured?: boolean }) {
  const t = articlesCopy[lang];
  const date = formatDate(a.publishedAt, lang);
  const config = cmsConfig();
  const cover = a.cover ? safeMediaUrl(a.cover.url, config.mediaOrigins, config.publicUrl || undefined) : null;
  const minutes = a.readingTime && Number.isFinite(a.readingTime) && a.readingTime > 0 ? Math.ceil(a.readingTime) : null;
  return (
    <AtlasPanel as="article" padding="none" className={`${styles.articleCard} ${featured ? styles.featuredCard : ""}`} data-has-cover={Boolean(cover)}>
      <Link href={articleHref(lang, a.slug)} prefetch={false} className={styles.articleCardLink}>
        {cover ? (
          // CMS origins are allow-listed server-side; no wildcard Next image configuration.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.cardCover} src={cover} alt={a.cover?.alt ?? ""} width={a.cover?.width ?? undefined} height={a.cover?.height ?? undefined} loading="lazy" decoding="async" />
        ) : null}
        <div className={styles.cardBody}>
          {a.categories[0]?.title ? <span className={styles.cardCategory}>{a.categories[0].title}</span> : null}
          <h3 lang={a.resolvedLocale ?? undefined}>{a.title ?? a.slug}</h3>
          {a.summary ? <p>{a.summary}</p> : null}
          <div className={styles.cardFooter}>
            <span className={styles.cardMeta}>
              {date ? <span><CalendarDays aria-hidden="true" /><time dateTime={a.publishedAt!}>{date}</time></span> : null}
              {minutes ? <span><Clock3 aria-hidden="true" />{t.minutes(minutes)}</span> : null}
            </span>
            <span className={styles.cardRead}>{t.read}<ArrowRight aria-hidden="true" /></span>
          </div>
        </div>
      </Link>
    </AtlasPanel>
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
  const t = articlesCopy[lang];
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
            <ArticleContents title={t.contents} items={toc} />
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
            {related.map((article) => <ArticleCard key={article.id} article={article} lang={lang} />)}
          </AtlasGrid>
        </AtlasSection>
      ) : null}
    </AtlasFrame>
  );
}
