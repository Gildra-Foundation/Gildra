import { PageShell } from "@/components/layout/PageShell";
import { BlockRenderer } from "./BlockRenderer";
import { registry } from "@/lib/blocks/registry";
import { collectAnchors } from "@/lib/blocks/anchors";
import { PAGE_BLOCKS } from "@/lib/blocks/pages";
import { getSource } from "@/lib/data";
import { getCmsPageOverride } from "@/lib/cms/pages";
import type { PageConfig } from "@/lib/blocks/page";
import type { RenderContext } from "@/lib/blocks/types";
import type { Lang } from "@/lib/i18n";

/** Render a page config: apply a published CMS override (if any), build the
 *  RenderContext once, then shell + blocks. */
export async function Page({ config, lang }: { config: PageConfig; lang: Lang }) {
  const override = await getCmsPageOverride(config.id, lang);
  const blocks = override?.blocks ?? config.blocks;
  const layout = override?.layout ?? config.layout;
  const ctx: RenderContext = {
    lang,
    game: config.game,
    source: getSource(config.game),
    path: config.path,
    anchors: collectAnchors(blocks, registry),
    anchorsOf: (pageId) => collectAnchors(PAGE_BLOCKS[pageId] ?? [], registry),
  };
  return (
    <PageShell
      lang={lang}
      game={config.game}
      layout={layout}
      reveal={config.shell?.reveal}
      footer={config.shell?.footer}
    >
      <BlockRenderer blocks={blocks} ctx={ctx} />
    </PageShell>
  );
}
