import type { ComponentType } from "react";
import { registry } from "@/lib/blocks/registry";
import type { BlockInstance } from "@/lib/blocks/page";
import type { RenderContext } from "@/lib/blocks/types";

function isVisible(b: BlockInstance, ctx: RenderContext) {
  const v = b.visibility;
  if (!v) return true;
  if (v.langs && !v.langs.includes(ctx.lang)) return false;
  if (v.games && !v.games.includes(ctx.game)) return false;
  return true;
}

/**
 * Server renderer for a list of block instances: resolves each block's data
 * through its `load`, renders the component, recurses into container
 * children. Adds no wrapper elements of its own.
 */
export async function BlockRenderer({
  blocks,
  ctx,
}: {
  blocks: BlockInstance[];
  ctx: RenderContext;
}) {
  const nodes = await Promise.all(
    blocks.map(async (b, i) => {
      if (!isVisible(b, ctx)) return null;
      const def = registry[b.type];
      if (!def) throw new Error(`Unknown block type "${b.type}"`);
      // The registry is a union of differently-typed blocks; widen once here.
      const Component = def.Component as ComponentType<any>;
      const load = def.load as ((ctx: RenderContext, props: unknown) => unknown) | undefined;
      const props = { ...def.defaults, ...b.props };
      const data = load ? await load(ctx, props) : undefined;
      const children = b.children ? <BlockRenderer blocks={b.children} ctx={ctx} /> : undefined;
      return (
        <Component key={b.id ?? `${b.type}-${i}`} {...props} data={data} lang={ctx.lang} game={ctx.game}>
          {children}
        </Component>
      );
    }),
  );
  return <>{nodes}</>;
}
