import { fetchArticle } from "@/lib/cms/client";
import { readingMinutes } from "@/lib/cms/richtext";
import { atlasScenes } from "@/lib/atlas/scenes";
import { atlasOgImage, type AtlasOgSpec } from "@/lib/og/atlasOg";
import { articlesCopy } from "./articlesCopy";
import type { Lang as Locale } from "@/lib/i18n-paths";

/**
 * Link-preview cards of the articles (design.md rule 13): the articles scene
 * with the article's category, title, summary, date and reading time. A
 * missing or unavailable article falls back to the section card.
 */

const scene = { art: atlasScenes.articles.art, focus: atlasScenes.articles.og as [number, number] };
const words = {
  en: { eyebrow: "World of Warcraft", title: "Articles", subtitle: "Guides and explainers from the Gildra editors.", minutes: (n: number) => `${n} min read` },
  ru: { eyebrow: "World of Warcraft", title: "Статьи", subtitle: "Гайды и разборы от редакции Gildra.", minutes: (n: number) => `${n} мин чтения` },
} as const;

const indexSpec = (locale: Locale): AtlasOgSpec => ({ locale, ...scene, eyebrow: words[locale].eyebrow, title: words[locale].title, subtitle: words[locale].subtitle });

export const articlesIndexOgImage = (locale: Locale) => async function Image() {
  return atlasOgImage(indexSpec(locale));
};

export const articleOgImage = (locale: Locale) => async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const result = await fetchArticle((await params).slug, locale);
  if (result.status !== "ok" || result.data.resolvedLocale !== locale || !result.data.title) return atlasOgImage(indexSpec(locale));
  const a = { ...result.data, title: result.data.title };
  const date = a.publishedAt ? new Date(a.publishedAt) : null;
  const facts = [
    ...(date && !Number.isNaN(date.valueOf()) ? [new Intl.DateTimeFormat(articlesCopy[locale].dateLocale, { dateStyle: "long" }).format(date)] : []),
    ...(a.content ? [words[locale].minutes(readingMinutes(a.content))] : []),
  ];
  return atlasOgImage({
    locale,
    ...scene,
    eyebrow: a.categories[0]?.title ?? words[locale].title,
    title: a.title,
    subtitle: a.summary ?? undefined,
    facts,
  });
};
