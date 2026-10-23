import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { BlockRenderer } from "./BlockRenderer";
import { collectAnchors } from "@/lib/blocks/anchors";
import { PAGE_BLOCKS } from "@/lib/blocks/pages";
import { loadBlockRegistry } from "@/lib/blocks/loadRegistry";
import { getSource } from "@/lib/data";
import { getCmsPageOverride, type CmsPageOverride } from "@/lib/cms/pages";
import type { PageConfig } from "@/lib/blocks/page";
import type { RenderContext } from "@/lib/blocks/types";
import type { Lang } from "@/lib/i18n";

/** Render a page config: apply a published CMS override (if any), build the
 *  RenderContext once, then shell + blocks. `/cms-preview` passes a validated
 *  draft as `override` (no published lookup) and its banner as `notice`. */
export async function Page({ config, lang, override: draft, notice }: { config: PageConfig; lang: Lang; override?: CmsPageOverride; notice?: ReactNode }) {
  const registry = await loadBlockRegistry(config.game);
  const override = draft ?? (await getCmsPageOverride(config.id, lang, registry));
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
    >
      {notice}
      <BlockRenderer blocks={blocks} ctx={ctx} registry={registry} />
    </PageShell>
  );
}
