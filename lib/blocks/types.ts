/**
 * Block contract.
 *
 * A block is a folder under components/blocks/<game|shared>/<name>/ with:
 *   <Name>.tsx  — presentational component: pure function of props + data + lang + game
 *   schema.ts   — Props / Data types (JSON-serialisable props, so a CMS can emit them)
 *   data.ts     — `load(ctx, props)` resolving Data through `ctx.source` only
 *   demo.ts     — demo props + data for the gallery
 *   index.ts    — `defineBlock({...})` export, registered in lib/blocks/registry.ts
 *
 * Every block renders its own root element (including its `id` when it is an
 * anchor target), so the DOM is exactly what the block folder says it is.
 */
import type { ComponentType, ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import type { GameSlug } from "@/lib/games/registry";
import type { DataSource } from "@/lib/data/source";

export type Anchor = { id: string; label: string };

export type RenderContext = {
  lang: Lang;
  game: GameSlug;
  source: DataSource;
  /** Canonical EN path of the page ("/" for the homepage); RU is `p("ru", path)`. */
  path: string;
  /** Anchors collected from the page config in document order (for SectionNav). */
  anchors: Anchor[];
  /** Anchors of another page by id ("wow/home") — see lib/blocks/pages.ts. */
  anchorsOf: (pageId: string) => Anchor[];
};

export type EmptyProps = Record<never, never>;

export type BlockComponentProps<P, D> = P & {
  data: D;
  lang: Lang;
  game: GameSlug;
  children?: ReactNode;
};

export type BlockDef<P extends object = EmptyProps, D = undefined, C extends boolean = false> = {
  /** Registry key: "columns" for shared blocks, "<game>.<name>" for game blocks. */
  type: string;
  Component: ComponentType<BlockComponentProps<P, D>>;
  load?: (ctx: RenderContext, props: P) => D | Promise<D>;
  defaults?: Partial<P>;
  /** Static anchor the block's root carries (raidFeature → #raid "Raid").
   *  An empty label marks a scroll target that is not a nav item (hero → #overview). */
  anchor?: Anchor;
  /** Anchor derived from instance props (columns → props.id / props.anchor). */
  anchorOf?: (props: P) => Anchor | undefined;
  /** Container blocks accept `children` in a page config. */
  container?: C;
  /** Gallery sample. `layout: "full"` renders edge-to-edge (hero, nav); default sits inside `.section`. */
  demo: { props: P; data: D; note?: string; layout?: "full" | "section" };
};

export const defineBlock = <P extends object = EmptyProps, D = undefined, C extends boolean = false>(
  def: BlockDef<P, D, C>,
): BlockDef<P, D, C> => def;
