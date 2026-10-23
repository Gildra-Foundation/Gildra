import type { ReactNode } from "react";
import { AtlasFrame, AtlasHero, AtlasNotice } from "@/components/atlas";
import { Page } from "@/components/blocks/Page";
import { loadBlockRegistry } from "@/lib/blocks/loadRegistry";
import type { PublicPage } from "@/lib/cms/contract";
import { validateBlocks } from "@/lib/cms/pages";
import { GAMES, type GameSlug } from "@/lib/games/registry";
import type { Lang } from "@/lib/i18n";
import styles from "./cms.module.css";

const TEXT = {
  en: {
    draft: "Draft preview",
    note: "This is how the page will look on the site once published. Only people with the link from the admin can see it.",
    empty: ["No blocks in this language", "Without its own blocks, this language keeps the page built in code."],
    invalid: ["The site cannot render these blocks", "Fix the errors shown in the page editor; until then the site keeps the page built in code."],
  },
  ru: {
    draft: "Предпросмотр черновика",
    note: "Так страница будет выглядеть на сайте после публикации. Видна только по ссылке из админки.",
    empty: ["В этом языке нет блоков", "Без своих блоков этот язык показывает страницу из кода."],
    invalid: ["Сайт не может показать эти блоки", "Исправьте ошибки в редакторе страницы; до этого сайт показывает страницу из кода."],
  },
} as const;

/**
 * Draft of a CMS block page rendered exactly like the published override:
 * same validation (lib/cms/pages.ts), same Page shell and block renderer.
 */
export async function PagePreview({ page, lang, live }: { page: PublicPage; lang: Lang; live: ReactNode }) {
  const t = TEXT[lang];
  const game = (page.game && page.game in GAMES ? page.game : null) as GameSlug | null;
  const blocks = game ? await validateBlocks(page.blocks, await loadBlockRegistry(game)) : null;
  if (!game || !blocks || blocks.length === 0) {
    const [title, text] = !game || page.blocks == null || (Array.isArray(page.blocks) && page.blocks.length === 0) ? t.empty : t.invalid;
    return (
      <AtlasFrame lang={lang}>
        <AtlasHero eyebrow={t.draft} title={title} lede={text} />
        {live}
      </AtlasFrame>
    );
  }
  const layout = page.layout === "bare" ? "bare" : "default";
  const notice = (
    <div className={styles.previewNotice}>
      <AtlasNotice tone="caution" title={t.draft}>
        {t.note}
      </AtlasNotice>
    </div>
  );
  return (
    <>
      <Page config={{ id: page.slug, game, path: page.path ?? "/", layout, blocks }} lang={lang} override={{ blocks, layout }} notice={notice} />
      {live}
    </>
  );
}
