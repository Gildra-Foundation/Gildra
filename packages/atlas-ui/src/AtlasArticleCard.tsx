"use client";

import clsx from "clsx";
import { ArticleCard, type ArticleCardLabels, type ArticleCardProps } from "./valyro-ui/editorial/ArticleCard";
import bridge from "./valyroAtlasBridge.module.css";
import styles from "./AtlasArticleCard.module.css";

const ru: Partial<ArticleCardLabels> = {
  readingTime: (_minutes, formatted) => `${formatted} мин чтения`,
};

/**
 * News/guide card on Valyro's Pro ArticleCard: vertical in a grid, horizontal
 * in a feed, overlay for the lead story. The whole card is the headline link;
 * pass `image` (a next/image element) for responsive covers.
 */
export function AtlasArticleCard({ locale, className, labels, ...props }: ArticleCardProps & { locale: "en" | "ru" }) {
  return (
    <ArticleCard
      {...props}
      locale={locale === "ru" ? "ru-RU" : "en-GB"}
      timeZone="UTC"
      labels={{ ...(locale === "ru" ? ru : {}), ...labels }}
      className={clsx(bridge.scope, styles.card, className)}
    />
  );
}
