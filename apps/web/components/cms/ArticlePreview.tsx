import type { Metadata } from "next";

import { AtlasFrame, AtlasHero, AtlasNotice } from "@/components/atlas";
import { cmsOrigin, fetchArticlePreview } from "@/lib/cms/preview";
import type { Lang } from "@/lib/i18n";
import { ArticleView } from "./Articles";
import { LivePreviewRefresh } from "./LivePreviewRefresh";

/**
 * Draft preview of a CMS article in the site design. Opened from the admin
 * (Preview button or the Live Preview frame next to the editor) with a signed
 * link; always dynamic, never indexed, the tokenised URL never leaves as Referer.
 */
export const previewMetadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const TEXT = {
  en: {
    draft: "Draft preview",
    note: "This is how the article will look on the site. Only people with the link from the admin can see this page.",
    fallback: (l: string) => `No translation yet — showing the ${l.toUpperCase()} version.`,
    invalid: ["This preview link has expired", "Open the preview from the article editor again."],
    missing: ["Draft not found", "The article may have been deleted, or you no longer have access to it."],
    error: ["The CMS did not answer", "Try reloading the page in a few seconds."],
  },
  ru: {
    draft: "Предпросмотр черновика",
    note: "Так статья будет выглядеть на сайте. Страница видна только по ссылке из админки.",
    fallback: (l: string) => `Перевода на этот язык ещё нет — показана версия ${l.toUpperCase()}.`,
    invalid: ["Ссылка предпросмотра устарела", "Откройте предпросмотр из редактора статьи ещё раз."],
    missing: ["Черновик не найден", "Возможно, статью удалили или у вас больше нет к ней доступа."],
    error: ["CMS не ответила", "Попробуйте обновить страницу через несколько секунд."],
  },
} as const;

export async function ArticlePreviewPage({ lang, token }: { lang: Lang; token: string | string[] | undefined }) {
  const t = TEXT[lang];
  const origin = cmsOrigin();
  const live = origin ? <LivePreviewRefresh cmsOrigin={origin} /> : null;
  const result = await fetchArticlePreview(typeof token === "string" ? token : undefined, lang === "ru" ? "ru" : "en");

  if (result.status !== "ok") {
    const [title, text] = result.status === "not-found" ? t.missing : result.status === "invalid" ? t.invalid : t.error;
    return (
      <AtlasFrame lang={lang}>
        <AtlasHero eyebrow={t.draft} title={title} lede={text} />
        {live}
      </AtlasFrame>
    );
  }

  const shown = result.article.resolvedLocale;
  const banner = (
    <AtlasNotice tone="caution" title={t.draft}>
      {t.note}
      {shown && shown !== lang ? ` ${t.fallback(shown)}` : null}
    </AtlasNotice>
  );
  return (
    <>
      <ArticleView article={result.article} lang={lang} banner={banner} preview />
      {live}
    </>
  );
}
