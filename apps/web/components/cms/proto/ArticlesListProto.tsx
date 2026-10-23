import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AtlasEmpty, AtlasFrame, AtlasGrid, AtlasHero, AtlasLinkButton, AtlasNotice, AtlasSection, AtlasSkeleton } from "@/components/atlas";
import { AtlasPageLinks } from "@gildra/atlas-ui/AtlasPageLinks";
import type { PublicArticle } from "@/lib/cms/contract";
import type { Lang } from "@/lib/i18n";
import { routeSections, sectionHref, trail } from "@/lib/routes/registry";
import { articlesCopy } from "../articlesCopy";
import { ArticleFilters } from "../articles/ArticleFilters";
import { ArticleTeaser } from "../articles/ArticleTeaser";
import { articlesListHref, hasFilters, type ArticleFilters as Filters } from "../articles/model";
import { protoArticles, protoTypes } from "./fixtures";
import styles from "../articles/articles.module.css";

export type ListVariant = "a" | "b" | "c";
export type ListState = "list" | "empty" | "loading";
const PAGE = 6;
const GRID_SIZES = "(min-width: 1180px) 30vw, (min-width: 720px) 45vw, 100vw";

const protoCopy = {
  en: { banner: "Prototype: demo topics instead of articles. Production shows only published CMS articles." },
  ru: { banner: "Прототип: демо-темы вместо статей. В продакшене здесь только опубликованные материалы CMS." },
} as const;

function Banner({ lang }: { lang: Lang }) {
  return <AtlasNotice className={styles.protoBanner} title={protoCopy[lang].banner} />;
}

const dayKey = (iso: string | null) => (iso ?? "").slice(0, 10);
const dayLabel = (iso: string, lang: Lang) => new Intl.DateTimeFormat(articlesCopy[lang].dateLocale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(iso));

export function ArticlesListProto({ variant, lang, state, filters }: { variant: ListVariant; lang: Lang; state: ListState; filters: Filters }) {
  const t = articlesCopy[lang];
  const base = `/dev/articles/${variant}/${lang}`;
  const all = state === "empty" ? [] : protoArticles(lang === "ru" ? "ru" : "en");
  const q = filters.q.toLowerCase();
  const matching = all.filter((a) =>
    (!filters.type || a.categories[0]?.slug === filters.type) &&
    (!filters.cls || a.game.wowClass === filters.cls) &&
    (!q || `${a.title} ${a.summary}`.toLowerCase().includes(q)));
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE));
  const page = Math.min(filters.page, pageCount);
  const types = protoTypes(lang === "ru" ? "ru" : "en");
  const counts = Object.fromEntries([["", all.length], ...types.map((ty) => [ty.slug, all.filter((a) => a.categories[0]?.slug === ty.slug).length])]);
  const cover = (a: PublicArticle) => a.cover?.url ?? null;
  const hrefOf = (a: PublicArticle) => `/dev/article-proto/1/${lang}?slug=${a.slug}`;
  const filtered = hasFilters(filters);

  const hero = (aside?: React.ReactNode, align: "start" | "center" = "start") => (
    <AtlasHero breadcrumbs={trail(lang, "articles")} breadcrumbsLabel={t.crumbs} eyebrow={t.eyebrow} title={t.title} lede={t.lead} aside={aside} align={align} />
  );

  if (state === "loading") {
    return (
      <AtlasFrame lang={lang} scene="articles">
        <Banner lang={lang} />
        {hero()}
        <AtlasSection title={t.latest}>
          <AtlasSkeleton variant="cards" count={6} label={t.loading} />
        </AtlasSection>
      </AtlasFrame>
    );
  }

  if (all.length === 0) {
    // Nothing published: one honest panel, links only to sections that exist.
    return (
      <AtlasFrame lang={lang} scene="articles">
        <Banner lang={lang} />
        {hero()}
        <AtlasSection title={t.latest} className={styles.emptySection}>
          <AtlasEmpty
            title={t.empty}
            action={
              <span className={styles.emptyActions}>
                <AtlasLinkButton href={sectionHref("raids", lang)} iconAfter={<ArrowRight aria-hidden="true" />}>{routeSections.raids.title[lang]}</AtlasLinkButton>
                <AtlasLinkButton variant="ghost" href={sectionHref("mythicPlus", lang)}>{routeSections.mythicPlus.title[lang]}</AtlasLinkButton>
              </span>
            }
          >
            {t.emptyHint}
          </AtlasEmpty>
        </AtlasSection>
      </AtlasFrame>
    );
  }

  const shown = matching.slice((page - 1) * PAGE, page * PAGE);
  const noMatch = (
    <AtlasEmpty title={t.noMatch} action={<AtlasLinkButton href={base}>{t.reset}</AtlasLinkButton>}>{t.noMatchHint}</AtlasEmpty>
  );
  const pager = (
    <AtlasPageLinks
      page={page}
      pageCount={pageCount}
      href={(n) => articlesListHref(lang, filters, { page: n }, base)}
      label={t.pages}
      labels={{ previous: t.prev, next: t.next, page: t.pageN }}
    />
  );
  const countLine = <p className={styles.count} role="status">{t.count(matching.length)}</p>;

  if (variant === "a") {
    // Showcase: lead story + fresh column, then filters over a card grid.
    const [lead, ...rest] = all;
    return (
      <AtlasFrame lang={lang} scene="articles">
        <Banner lang={lang} />
        {hero()}
        {!filtered && page === 1 ? (
          <section className={styles.leadRow} aria-label={t.featured}>
            <ArticleTeaser article={lead} lang={lang} cover={cover(lead)} layout="overlay" priority sizes="(min-width: 1180px) 62vw, 100vw" headingLevel={2} href={hrefOf(lead)} />
            <div className={styles.freshCol}>
              <h2 className={styles.colTitle}>{t.fresh}</h2>
              {rest.slice(0, 3).map((a) => <ArticleTeaser key={a.id} article={a} lang={lang} cover={cover(a)} layout="horizontal" sizes="160px" href={hrefOf(a)} />)}
            </div>
          </section>
        ) : null}
        <AtlasSection title={t.latest}>
          <ArticleFilters lang={lang} filters={filters} types={types} base={base} counts={counts} />
          {countLine}
          {shown.length ? (
            <AtlasGrid min={360} fit>
              {shown.map((a) => <ArticleTeaser key={a.id} article={a} lang={lang} cover={cover(a)} sizes={GRID_SIZES} href={hrefOf(a)} />)}
            </AtlasGrid>
          ) : noMatch}
          {pager}
        </AtlasSection>
      </AtlasFrame>
    );
  }

  if (variant === "b") {
    // Feed: sticky filter rail, newest first, grouped by publication day.
    const groups: Array<[string, PublicArticle[]]> = [];
    for (const a of shown) {
      const key = dayKey(a.publishedAt);
      const last = groups.at(-1);
      if (last && last[0] === key) last[1].push(a);
      else groups.push([key, [a]]);
    }
    return (
      <AtlasFrame lang={lang} scene="articles">
        <Banner lang={lang} />
        {hero()}
        <div className={styles.feedLayout}>
          <aside className={styles.rail} aria-label={t.filters}>
            {/* Desktop: always open. Phone: folded under one summary, open when a filter is on (no JS). */}
            <div className={styles.railWide}>
              <p className={styles.railTitle}>{t.filters}</p>
              <ArticleFilters lang={lang} filters={filters} types={types} base={base} layout="rail" counts={counts} />
            </div>
            <details className={styles.railDetails} open={filtered || undefined}>
              <summary>{t.filters}{filtered ? <span className={styles.railActive}>{t.count(matching.length)}</span> : null}</summary>
              <ArticleFilters lang={lang} filters={filters} types={types} base={base} layout="rail" counts={counts} />
            </details>
          </aside>
          <div className={styles.feed}>
            {countLine}
            {groups.length ? groups.map(([day, items]) => (
              <section key={day} className={styles.dayGroup} aria-labelledby={`day-${day}`}>
                <h2 id={`day-${day}`} className={styles.dayTitle}><time dateTime={day}>{dayLabel(day, lang)}</time></h2>
                {items.map((a, i) => <ArticleTeaser key={a.id} article={a} lang={lang} cover={cover(a)} layout="horizontal" sizes="(min-width: 720px) 260px, 34vw" priority={page === 1 && i === 0 && day === groups[0][0]} href={hrefOf(a)} />)}
              </section>
            )) : noMatch}
            {pager}
          </div>
        </div>
      </AtlasFrame>
    );
  }

  // Magazine: lead story in the hero, a class strip, then one shelf per content type.
  const [lead] = all;
  return (
    <AtlasFrame lang={lang} scene="articles" art={cover(lead) ?? undefined} artPosition="center 35%">
      <Banner lang={lang} />
      {hero(<ArticleTeaser article={lead} lang={lang} cover={cover(lead)} layout="overlay" priority sizes="(min-width: 1180px) 44vw, 100vw" headingLevel={2} href={hrefOf(lead)} />)}
      <div className={styles.classStrip}>
        <ArticleFilters lang={lang} filters={filters} types={types} base={base} counts={counts} />
      </div>
      {filtered ? (
        <AtlasSection title={t.count(matching.length)}>
          {shown.length ? (
            <AtlasGrid min={360} fit>{shown.map((a) => <ArticleTeaser key={a.id} article={a} lang={lang} cover={cover(a)} sizes={GRID_SIZES} href={hrefOf(a)} />)}</AtlasGrid>
          ) : noMatch}
          {pager}
        </AtlasSection>
      ) : (
        types.map((type) => {
          const items = all.filter((a) => a.categories[0]?.slug === type.slug && a.id !== lead.id);
          if (!items.length) return null;
          const more = <Link className={styles.shelfMore} href={articlesListHref(lang, filters, { type: type.slug }, base)}>{t.seeAll(type.title)}<ArrowRight aria-hidden="true" /></Link>;
          return (
            <AtlasSection key={type.slug} title={type.title} aside={more}>
              {type.slug === "patch-notes" ? (
                <ol className={styles.timeline}>
                  {items.map((a) => (
                    <li key={a.id}>
                      <time dateTime={a.publishedAt!}>{dayLabel(a.publishedAt!, lang)}</time>
                      <Link href={hrefOf(a)}>{a.title}</Link>
                      {a.game.patch ? <span className={styles.timelinePatch}>{a.game.patch}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : type.slug === "news" ? (
                <div className={styles.newsRow}>{items.slice(0, 2).map((a) => <ArticleTeaser key={a.id} article={a} lang={lang} cover={cover(a)} layout="horizontal" sizes="(min-width: 720px) 220px, 34vw" href={hrefOf(a)} />)}</div>
              ) : (
                <AtlasGrid min={260} fit>{items.slice(0, 4).map((a) => <ArticleTeaser key={a.id} article={a} lang={lang} cover={cover(a)} sizes={GRID_SIZES} href={hrefOf(a)} />)}</AtlasGrid>
              )}
            </AtlasSection>
          );
        })
      )}
    </AtlasFrame>
  );
}


