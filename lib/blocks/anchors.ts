import type { BlockInstance } from "./page";
import type { Anchor, BlockDef } from "./types";

type AnyRegistry = Record<string, BlockDef<any, any, boolean>>;

/**
 * Walk a page config depth-first and collect navigation anchors in document
 * order: `anchorOf(props)` first, then the block's static `anchor`. Anchors
 * with an empty label are scroll targets only (hero → #overview) and skipped.
 */
export function collectAnchors(blocks: BlockInstance[], registry: AnyRegistry): Anchor[] {
  const out: Anchor[] = [];
  const walk = (list: BlockInstance[]) => {
    for (const b of list) {
      const def = registry[b.type];
      const own = def?.anchorOf?.({ ...def.defaults, ...b.props }) ?? def?.anchor;
      if (own?.label) out.push(own);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}
