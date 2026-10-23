import Image from "next/image";
import { AtlasArticleCard } from "@gildra/atlas-ui/AtlasArticleCard";
import type { PublicArticle } from "@/lib/cms/contract";
import { isOptimizableCmsImage } from "@/lib/cms/images";
import type { Lang } from "@/lib/i18n";
import { articleHref } from "../paths";
import { wowClassIcon, wowClassName } from "./model";
import styles from "./articles.module.css";

export type TeaserLayout = "vertical" | "horizontal" | "overlay";

/** Grid, feed and lead-story card of one article. `cover` is the already allow-listed image URL. */
export function ArticleTeaser({ article: a, lang, cover, layout = "vertical", priority = false, sizes, headingLevel = 3, href }: {
  article: PublicArticle;
  lang: Lang;
  cover: string | null;
  layout?: TeaserLayout;
  priority?: boolean;
  sizes: string;
  headingLevel?: 2 | 3;
  href?: string;
}) {
  const type = a.categories[0]?.title;
  const cls = wowClassName(a.game.wowClass);
  const kicker = type || cls ? (
    <span className={styles.kicker}>
      {type ? <span>{type}</span> : null}
      {cls ? (
        <span className={styles.kickerClass}>
          <Image src={wowClassIcon(a.game.wowClass!)} alt="" width={16} height={16} />
          {cls}
        </span>
      ) : null}
    </span>
  ) : undefined;
  return (
    <AtlasArticleCard
      locale={lang === "ru" ? "ru" : "en"}
      layout={layout}
      href={href ?? articleHref(lang, a.slug)}
      title={<span lang={a.resolvedLocale ?? undefined}>{a.title ?? a.slug}</span>}
      excerpt={a.summary ?? undefined}
      kicker={kicker}
      badge={a.game.patch && layout !== "horizontal" ? a.game.patch : undefined}
      published={a.publishedAt ?? undefined}
      readingMinutes={a.readingTime && a.readingTime > 0 ? a.readingTime : undefined}
      headingLevel={headingLevel}
      image={cover ? (
        <Image className="ui-article-card__img" src={cover} alt={a.cover?.alt ?? ""} fill sizes={sizes} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} unoptimized={!isOptimizableCmsImage(cover)} />
      ) : undefined}
    />
  );
}
