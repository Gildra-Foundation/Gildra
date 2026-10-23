import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { AtlasBadge, AtlasEmpty, AtlasError, AtlasFrame, AtlasGrid, AtlasHero, AtlasLinkButton, AtlasNotice, AtlasSection, AtlasSkeleton } from "@/components/atlas";
import { fetchArticle, fetchArticles } from "@/lib/cms/client";
import { cmsConfig } from "@/lib/cms/config";
import type { CmsLocale, PublicArticle } from "@/lib/cms/contract";
import { isOptimizableCmsImage } from "@/lib/cms/images";
import { extractToc, readingMinutes, safeMediaUrl } from "@/lib/cms/richtext";
import type { Lang } from "@/lib/i18n";
import { CmsRichText } from "./CmsRichText";
import { articleHref, articlesIndexHref } from "./paths";
import styles from "./cms.module.css";
import list from "./articles/articles.module.css";
import { ArticleFilters } from "./articles/ArticleFilters";
import { ArticleTeaser } from "./articles/ArticleTeaser";
import { articlesListHref, hasFilters, wowClassIcon, wowClassName, type ArticleFilters as Filters } from "./articles/model";
import { routeSections, sectionHref, trail } from "@/lib/routes/registry";
import { AtlasArticleToc, AtlasByline } from "@gildra/atlas-ui/AtlasArticleParts";
import { AtlasPageLinks } from "@gildra/atlas-ui/AtlasPageLinks";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import { JsonLd, articleLd, breadcrumbListLd } from "@/lib/seo/jsonld";
import { pageOpenGraph } from "@/lib/seo/metadata";
import { articlesCopy } from "./articlesCopy";


/** Archive cards per page, after the showcase (lead story + three fresh ones). */
const PAGE_SIZE = 12;
const SHOWCASE = 4;
/** The public CMS list filters by category and tag only, so the newest 200 are filtered here. */
const LIST_PAGES = 4;
const GRID_SIZES = "(min-width: 1180px) 30vw, (min-width: 720px) 45vw, 100vw";
const locale = (lang: Lang): CmsLocale => (lang === "ru" ? "ru" : "en");

function coverUrl(a: PublicArticle): string | null {
  const config = cmsConfig();
  return a.cover ? safeMediaUrl(a.cover.url, config.mediaOrigins, config.publicUrl || undefined) : null;
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

export async function articlesIndexMetadata(lang: Lang, filters?: Filters): Promise<Metadata> {
  const t = articlesCopy[lang];
  // An empty list is not worth a search result: indexed from the first published article on.
  const first = await fetchArticles(locale(lang), 1, 1);
  const empty = first.status !== "ok" || first.data.totalDocs === 0;
  // Filtered views are the same articles again: followed, not indexed.
  const filtered = filters ? hasFilters(filters) : false;
  const page = filters && !filtered ? filters.page : 1;
  const canonical = page > 1 ? `${articlesIndexHref(lang)}?page=${page}` : articlesIndexHref(lang);
  return {
    ...(empty || filtered ? { robots: { index: false, follow: true } } : {}),
    title: page > 1 ? `${t.title} · ${t.pageN(page)} — Gildra` : `${t.title} — Gildra`,
    description: t.description,
    alternates: {
      canonical,
      languages: { en: articlesIndexHref("en"), ru: articlesIndexHref("ru"), "x-default": articlesIndexHref("en") },
    },
    openGraph: pageOpenGraph(lang === "ru" ? "ru" : "en", { title: t.title, description: t.description, path: articlesIndexHref(lang) }),
  };
}

type Published = { status: "ok"; docs: PublicArticle[] } | { status: "disabled" | "unavailable" };

/** Newest published articles in the page language (fallback translations are left out). */
async function fetchPublished(lang: Lang): Promise<Published> {
  const docs: PublicArticle[] = [];
  for (let page = 1, total = 1; page <= total && page <= LIST_PAGES; page++) {
    const result = await fetchArticles(locale(lang), page, 50);
    if (result.status === "disabled") return { status: "disabled" };
    // An absent index endpoint is a service failure, not proof of an empty library.
    if (result.status !== "ok") return { status: "unavailable" };
    total = result.data.totalPages;
    docs.push(...result.data.docs.filter((a) => a.resolvedLocale === locale(lang)));
  }
  return { status: "ok", docs };
}

/** Content types are the CMS categories in use, most used first. */
function typesOf(docs: PublicArticle[]) {
  const types = new Map<string, { slug: string; title: string; count: number }>();
  for (const a of docs) {
    const c = a.categories[0];
    if (!c?.slug || !c.title) continue;
    const type = types.get(c.slug) ?? { slug: c.slug, title: c.title, count: 0 };
    type.count += 1;
    types.set(c.slug, type);
  }
  return [...types.values()].sort((x, y) => y.count - x.count);
}

function matches(a: PublicArticle, f: Filters): boolean {
  if (f.type && a.categories[0]?.slug !== f.type) return false;
  if (f.cls && a.game.wowClass !== f.cls) return false;
  if (!f.q) return true;
  const words = f.q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = [a.title, a.summary, a.game.patch, a.game.wowSpec, wowClassName(a.game.wowClass), ...a.categories.map((c) => c.title), ...a.tags.map((tag) => tag.title)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return words.every((w) => text.includes(w));
}

function ArticlesHero({ lang }: { lang: Lang }) {
  const t = articlesCopy[lang];
  return <AtlasHero breadcrumbs={trail(lang, "articles")} breadcrumbsLabel={t.crumbs} eyebrow={t.eyebrow} title={t.title} lede={t.lead} />;
}

/** Skeleton of the list while the server renders it (loading.tsx). */
export function ArticlesIndexLoading({ lang }: { lang: Lang }) {
  const t = articlesCopy[lang];
  return (
    <AtlasFrame lang={lang} scene="articles" dataAttributes={{ "data-articles-view": "loading" }}>
      <ArticlesHero lang={lang} />
      <AtlasSection title={t.latest}>
        <AtlasSkeleton variant="cards" count={6} label={t.loading} className={list.skeletonGrid} />
      </AtlasSection>
    </AtlasFrame>
  );
}

/** Skeleton of an article while it renders; also keeps the list skeleton off article routes. */
export function ArticleLoading({ lang }: { lang: Lang }) {
  const t = articlesCopy[lang];
  return (
    <AtlasFrame lang={lang} scene="articles" dataAttributes={{ "data-articles-view": "loading" }}>
      <div className={list.reading} data-rail>
        <div className={list.prose}>
          <AtlasSkeleton variant="lines" count={8} label={t.loadingArticle} />
        </div>
      </div>
    </AtlasFrame>
  );
}

export async function ArticlesIndexPage({ lang, filters }: { lang: Lang; filters: Filters }) {
  const t = articlesCopy[lang];
  const base = articlesIndexHref(lang);
  const result = await fetchPublished(lang);
  const all = result.status === "ok" ? result.docs : [];

  if (all.length === 0) {
    // Nothing to list: one honest panel, links only to sections that exist.
    const links = (
      <span className={list.emptyActions}>
        <AtlasLinkButton href={sectionHref("raids", lang)} iconAfter={<ArrowRight aria-hidden="true" />}>{routeSections.raids.title[lang]}</AtlasLinkButton>
        <AtlasLinkButton variant="ghost" href={sectionHref("mythicPlus", lang)}>{routeSections.mythicPlus.title[lang]}</AtlasLinkButton>
      </span>
    );
    return (
      <AtlasFrame lang={lang} scene="articles" dataAttributes={{ "data-articles-view": "index" }}>
        <ArticlesHero lang={lang} />
        <AtlasSection title={t.latest} className={list.emptySection}>
          {result.status === "unavailable" ? (
            <AtlasError title={t.unavailableTitle} actions={links}>{t.unavailable}</AtlasError>
          ) : (
            <AtlasEmpty title={result.status === "disabled" ? t.preparing : t.empty} action={links}>
              {result.status === "disabled" ? t.preparingHint : t.emptyHint}
            </AtlasEmpty>
          )}
        </AtlasSection>
      </AtlasFrame>
    );
  }

  const filtered = hasFilters(filters);
  const matching = all.filter((a) => matches(a, filters));
  // The showcase takes the newest few of the unfiltered list; the archive grid goes on after them.
  const showcase = !filtered && all.length > SHOWCASE ? all.slice(0, SHOWCASE) : [];
  const archive = matching.slice(showcase.length);
  const pageCount = Math.max(1, Math.ceil(archive.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const shown = archive.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const types = typesOf(all);
  const counts = Object.fromEntries([["", all.length], ...types.map((type) => [type.slug, type.count])]);
  const [lead, ...fresh] = showcase;

  return (
    <AtlasFrame lang={lang} scene="articles" dataAttributes={{ "data-articles-view": "index" }}>
      <ArticlesHero lang={lang} />
      {lead && page === 1 ? (
        <section className={list.leadRow} aria-label={t.featured}>
          <ArticleTeaser article={lead} lang={lang} cover={coverUrl(lead)} layout="overlay" priority sizes="(min-width: 1180px) 62vw, 100vw" headingLevel={2} />
          <div className={list.freshCol}>
            <h2 className={list.colTitle}>{t.fresh}</h2>
            {fresh.map((a) => <ArticleTeaser key={a.id} article={a} lang={lang} cover={coverUrl(a)} layout="horizontal" sizes="160px" />)}
          </div>
        </section>
      ) : null}
      <AtlasSection title={t.latest}>
        <ArticleFilters lang={lang} filters={filters} types={types} base={base} counts={counts} />
        <p className={list.count} role="status">{t.count(matching.length)}</p>
        {shown.length ? (
          <AtlasGrid min={360}>
            {shown.map((a, i) => <ArticleTeaser key={a.id} article={a} lang={lang} cover={coverUrl(a)} sizes={GRID_SIZES} priority={!lead && page === 1 && i === 0} />)}
          </AtlasGrid>
        ) : matching.length === 0 ? (
          <AtlasEmpty title={t.noMatch} action={<AtlasLinkButton href={base}>{t.reset}</AtlasLinkButton>}>{t.noMatchHint}</AtlasEmpty>
        ) : null}
        <AtlasPageLinks
          page={page}
          pageCount={pageCount}
          href={(n) => articlesListHref(lang, filters, { page: n })}
          label={t.pages}
          labels={{ previous: t.prev, next: t.next, page: t.pageN }}
        />
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
  const latest = await fetchArticles(locale(lang), 1, 50);
  const others = latest.status === "ok" ? latest.data.docs.filter((d) => d.slug !== a.slug && d.resolvedLocale === locale(lang)) : [];
  // Same type or class first, then the newest.
  const near = (d: PublicArticle) => Number(d.categories[0]?.slug === a.categories[0]?.slug) + Number(Boolean(a.game.wowClass) && d.game.wowClass === a.game.wowClass);
  const related = others.map((d, i) => [d, near(d), i] as const).sort((x, y) => y[1] - x[1] || x[2] - y[2]).slice(0, 3).map(([d]) => d);
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
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/-(\w)/g, (_, c: string) => ` ${c.toUpperCase()}`);

/** Game facts of the article that the CMS really holds; none when it holds none. */
function factRows(a: PublicArticle, lang: Lang): Array<[string, ReactNode]> {
  const t = articlesCopy[lang];
  const cls = wowClassName(a.game.wowClass);
  const reviewed = a.game.lastReviewedAt
    ? new Intl.DateTimeFormat(t.dateLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(a.game.lastReviewedAt))
    : null;
  const rows: Array<[string, ReactNode]> = [];
  if (a.game.patch) rows.push([t.patchLabel, a.game.patch]);
  if (cls) rows.push([t.wowClass, <span key="class" className={list.factClass}><Image src={wowClassIcon(a.game.wowClass!)} alt="" width={20} height={20} />{cls}</span>]);
  if (a.game.wowSpec) rows.push([t.specLabel, capital(a.game.wowSpec)]);
  if (reviewed) rows.push([t.reviewedLabel, <time key="reviewed" dateTime={a.game.lastReviewedAt!}>{reviewed}</time>]);
  return rows;
}

/**
 * Article page markup, shared by the published page and the CMS draft preview
 * (`/cms-preview`), so a preview looks exactly like the site. Reading room:
 * sticky contents | text column | game facts and share. `banner` renders
 * above the article inside the page frame; a preview has no share button (its
 * address carries the preview token) and no list of other articles.
 */
export function ArticleView({ article: a, lang, banner, related = [], preview = false }: { article: PublicArticle; lang: Lang; banner?: ReactNode; related?: PublicArticle[]; preview?: boolean }) {
  const t = articlesCopy[lang];
  const slug = a.slug;
  const toc = extractToc(a.content);
  const cover = coverUrl(a);
  const fallback = a.resolvedLocale !== locale(lang);
  const withToc = toc.length > 1;
  const facts = factRows(a, lang);
  const hasRail = facts.length > 0 || !preview;

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
        {fallback ? <AtlasNotice title={locale(lang) === "ru" ? t.fallback : t.otherOnly} /> : null}
        {/* Reading progress: a hairline under the toolbar that fills as the page scrolls (CSS only). */}
        <div className={styles.progress} aria-hidden="true" />
        <div className={list.reading} data-toc={withToc || undefined} data-rail={hasRail || undefined}>
          {withToc ? (
            <aside className={list.readingToc}>
              <AtlasArticleToc locale={locale(lang)} items={toc.map((item) => ({ id: item.id, label: item.text }))} />
            </aside>
          ) : null}
          <div className={list.prose}>
            <div className={list.readingHead}>
              <AtlasByline
                locale={locale(lang)}
                authors={a.author?.name ? [{ name: a.author.name }] : []}
                published={a.publishedAt ?? undefined}
                updated={sameDay(a.publishedAt, a.updatedAt) ? undefined : a.updatedAt ?? undefined}
                readingMinutes={readingMinutes(a.content)}
              />
              {withToc ? (
                // Narrow screens: the contents folds above the text (the side rail is hidden there).
                <details className={list.tocCompact}>
                  <summary>{t.contents}</summary>
                  <ol>{toc.map((item) => <li key={item.id}><a href={`#${item.id}`}>{item.text}</a></li>)}</ol>
                </details>
              ) : null}
            </div>
            {cover ? (
              <figure className={list.readingCover}>
                <div className={list.readingCoverImage}>
                  <Image src={cover} alt={a.cover?.alt ?? ""} fill priority sizes="(min-width: 1180px) 680px, (min-width: 900px) 62vw, 100vw" unoptimized={!isOptimizableCmsImage(cover)} />
                </div>
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
          {hasRail ? (
            <aside className={list.readingRail}>
              {facts.length ? (
                <section className={list.facts} aria-labelledby="article-facts">
                  <h2 id="article-facts">{t.atGlance}</h2>
                  <dl>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
                </section>
              ) : null}
              {preview ? null : <AtlasShareButton title={a.title ?? slug} locale={locale(lang)} />}
            </aside>
          ) : null}
        </div>
      </article>
      {related.length ? (
        <section className={list.related} aria-labelledby="related-title">
          <h2 id="related-title">{t.more}</h2>
          <AtlasGrid min={360}>
            {related.map((r) => <ArticleTeaser key={r.id} article={r} lang={lang} cover={coverUrl(r)} sizes={GRID_SIZES} />)}
          </AtlasGrid>
        </section>
      ) : null}
    </AtlasFrame>
  );
}
