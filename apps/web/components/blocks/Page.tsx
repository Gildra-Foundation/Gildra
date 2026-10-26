import { PageShell } from "@/components/layout/PageShell";
import { BlockRenderer } from "./BlockRenderer";
import { collectAnchors } from "@/lib/blocks/anchors";
import { PAGE_BLOCKS } from "@/lib/blocks/pages";
import { loadBlockRegistry } from "@/lib/blocks/loadRegistry";
import type { PageConfig } from "@/lib/blocks/page";
import type { RenderContext } from "@/lib/blocks/types";
import type { Lang } from "@/lib/i18n";

/** Render a page config: build the RenderContext once, then shell + blocks. */
export async function Page({ config, lang }: { config: PageConfig; lang: Lang }) {
  const registry = await loadBlockRegistry(config.game);
  const { blocks, layout } = config;
  const ctx: RenderContext = {
    lang,
    game: config.game,
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
    >
      <BlockRenderer blocks={blocks} ctx={ctx} registry={registry} />
    </PageShell>
  );
}
