import { PageShell } from "@/components/layout/PageShell";
import { BlockRenderer } from "./BlockRenderer";
import { registry } from "@/lib/blocks/registry";
import { collectAnchors } from "@/lib/blocks/anchors";
import { PAGE_BLOCKS } from "@/lib/blocks/pages";
import { getSource } from "@/lib/data";
import type { PageConfig } from "@/lib/blocks/page";
import type { RenderContext } from "@/lib/blocks/types";
import type { Lang } from "@/lib/i18n";

/** Render a page config: build the RenderContext once, then shell + blocks. */
export function Page({ config, lang }: { config: PageConfig; lang: Lang }) {
  const ctx: RenderContext = {
    lang,
    game: config.game,
    source: getSource(config.game),
    path: config.path,
    anchors: collectAnchors(config.blocks, registry),
    anchorsOf: (pageId) => collectAnchors(PAGE_BLOCKS[pageId] ?? [], registry),
  };
  return (
    <PageShell
      lang={lang}
      game={config.game}
      layout={config.layout}
      reveal={config.shell?.reveal}
      footer={config.shell?.footer}
    >
      <BlockRenderer blocks={config.blocks} ctx={ctx} />
    </PageShell>
  );
}
