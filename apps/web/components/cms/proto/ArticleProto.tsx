import Image from "next/image";
import { AtlasAnchorNav, AtlasFrame, AtlasGrid, AtlasHero, AtlasNotice } from "@/components/atlas";
import { AtlasArticleToc, AtlasByline, AtlasEditorNote } from "@gildra/atlas-ui/AtlasArticleParts";
import { AtlasShareButton } from "@gildra/atlas-ui/AtlasShareButton";
import type { PublicArticle } from "@/lib/cms/contract";
import { extractToc, readingMinutes } from "@/lib/cms/richtext";
import type { Lang } from "@/lib/i18n";
import { trail } from "@/lib/routes/registry";
import { CmsRichText } from "../CmsRichText";
import { articleFixture } from "../articleFixture";
import { articlesCopy } from "../articlesCopy";
import { ArticleTeaser } from "../articles/ArticleTeaser";
import { wowClassIcon, wowClassName } from "../articles/model";
import { protoArticles } from "./fixtures";
import styles from "../articles/articles.module.css";

export type ArticleVariant = "1" | "2";

const facts = {
  en: { patch: "Patch", cls: "Class", spec: "Spec", reviewed: "Checked against", read: "Reading time", updateNote: "Section «Callouts» rewritten for the new editor.", banner: "Prototype: the editors' style-guide fixture with demo game facts. Production shows a published CMS article." },
  ru: { patch: "Патч", cls: "Класс", spec: "Специализация", reviewed: "Сверено с патчем", read: "Время чтения", updateNote: "Раздел «Врезки» переписан под новый редактор.", banner: "Прототип: справочная статья редактора с демо-фактами об игре. В продакшене здесь опубликованная статья CMS." },
} as const;

/** Fixture article with demo game facts and a later update, so every fact slot has something to show. */
function demoArticle(lang: Lang): PublicArticle {
  const a = articleFixture(lang === "ru" ? "ru" : "en");
  return { ...a, updatedAt: "2026-10-20T12:00:00.000Z", game: { ...a.game, patch: "12.0.5", wowClass: "mage", wowSpec: "frost", lastReviewedAt: "2026-10-20T12:00:00.000Z" } };
}

const dateOf = (iso: string, lang: Lang) => new Intl.DateTimeFormat(articlesCopy[lang].dateLocale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Facts({ a, lang, minutes, strip = false }: { a: PublicArticle; lang: Lang; minutes: number; strip?: boolean }) {
  const f = facts[lang];
  const cls = wowClassName(a.game.wowClass);
  const rows = [
    a.game.patch ? [f.patch, a.game.patch] : null,
    cls ? [f.cls, <><Image src={wowClassIcon(a.game.wowClass!)} alt="" width={20} height={20} />{cls}</>] : null,
    a.game.wowSpec ? [f.spec, capital(a.game.wowSpec)] : null,
    a.game.lastReviewedAt ? [f.reviewed, <time key="r" dateTime={a.game.lastReviewedAt}>{dateOf(a.game.lastReviewedAt, lang)}</time>] : null,
    strip ? [f.read, articlesCopy[lang].minutes(minutes)] : null,
  ].filter(Boolean) as Array<[string, React.ReactNode]>;
  const list = <dl className={strip ? styles.factsStrip : undefined}>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
  return strip ? list : <section className={styles.facts} aria-labelledby="facts-title"><h2 id="facts-title">{articlesCopy[lang].atGlance}</h2>{list}</section>;
}

export function ArticleProto({ variant, lang }: { variant: ArticleVariant; lang: Lang }) {
  const t = articlesCopy[lang];
  const locale = lang === "ru" ? "ru" : "en";
  const a = demoArticle(lang);
  const toc = extractToc(a.content);
  const minutes = readingMinutes(a.content);
  const related = protoArticles(locale).slice(0, 3);
  const crumbs = trail(lang, "articles", { label: a.title! });
  const banner = <AtlasNotice title={facts[lang].banner} />;
  const byline = <AtlasByline locale={locale} authors={[{ name: a.author?.name ?? "Gildra" }]} published={a.publishedAt!} updated={a.updatedAt!} readingMinutes={minutes} />;
  const note = <AtlasEditorNote locale={locale} date={a.updatedAt!}>{facts[lang].updateNote}</AtlasEditorNote>;
  const relatedList = (
    <section className={styles.related} aria-labelledby="related-title">
      <h2 id="related-title">{t.more}</h2>
      <AtlasGrid min={280} fit>
        {related.map((r) => <ArticleTeaser key={r.id} article={r} lang={lang} cover={r.cover?.url ?? null} sizes="(min-width: 1180px) 30vw, (min-width: 720px) 45vw, 100vw" href={`/dev/article-proto/${variant}/${lang}`} />)}
      </AtlasGrid>
    </section>
  );

  if (variant === "1") {
    // Reading room: sticky contents | ~68ch text | facts and share.
    return (
      <AtlasFrame lang={lang} scene="articles">
        {banner}
        <AtlasHero breadcrumbs={crumbs} breadcrumbsLabel={t.crumbs} eyebrow={a.categories[0]?.title} title={a.title!} lede={a.summary ?? undefined} />
        <div className={styles.reading}>
          <aside className={styles.readingToc}>
            <AtlasArticleToc locale={locale} items={toc.map((item) => ({ id: item.id, label: item.text }))} />
          </aside>
          <article className={styles.prose} lang={a.resolvedLocale ?? undefined}>
            <div className={styles.readingHead}>{byline}{note}</div>
            <figure className={styles.readingCover}>
              <Image src={a.cover!.url!} alt={a.cover!.alt ?? ""} fill priority sizes="(min-width: 1180px) 680px, 100vw" />
            </figure>
            <CmsRichText content={a.content} lang={lang} />
          </article>
          <aside className={styles.readingRail}>
            <Facts a={a} lang={lang} minutes={minutes} />
            <AtlasShareButton title={a.title!} locale={locale} />
          </aside>
        </div>
        {relatedList}
      </AtlasFrame>
    );
  }

  // Cinematic: the cover is the page art, title over it, chapters as a strip, one column.
  const next = related[0];
  return (
    <AtlasFrame lang={lang} scene="articles" art={a.cover?.url ?? undefined}>
      {banner}
      <header className={styles.cineHead}>
        <AtlasHero breadcrumbs={crumbs} breadcrumbsLabel={t.crumbs} eyebrow={a.categories[0]?.title} title={a.title!} lede={a.summary ?? undefined} />
        {byline}
      </header>
      <Facts a={a} lang={lang} minutes={minutes} strip />
      {toc.length > 1 ? (
        <AtlasAnchorNav label={t.contents} items={toc.map((item) => ({ href: `#${item.id}`, label: item.text }))} />
      ) : null}
      <div className={styles.cineBody}>
        {note}
        <article className={styles.prose} lang={a.resolvedLocale ?? undefined}>
          <CmsRichText content={a.content} lang={lang} />
        </article>
        <AtlasShareButton title={a.title!} locale={locale} />
        <section className={styles.nextCard} aria-label={t.nextArticle}>
          <ArticleTeaser article={next} lang={lang} cover={next.cover?.url ?? null} layout="overlay" sizes="(min-width: 720px) 680px, 100vw" headingLevel={2} href={`/dev/article-proto/2/${lang}`} />
        </section>
      </div>
      {relatedList}
    </AtlasFrame>
  );
}
