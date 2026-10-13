import "server-only";
import type { BlockInstance } from "@/lib/blocks/page";
import type { BlockRegistry } from "@/lib/blocks/loadRegistry";
import type { Lang } from "@/lib/i18n";
import { fetchPage } from "./client";
import { blockPropsValid } from "@/lib/blocks/contracts";

/**
 * Payload CMS page overrides.
 *
 * A published CMS `pages` document whose `slug` equals a page id ("wow/tier-lists")
 * and whose `blocks` field holds a `BlockInstance[]` replaces the TS config
 * for that page. Everything fails open: no CMS URL, CMS down, no document,
 * malformed JSON or an unknown block type → the code config renders.
 * Reads `/api/public/<site>/page?slug=…&locale=…` (published, site-bound).
 */
export type CmsPageOverride = {
  blocks: BlockInstance[];
  layout?: "default" | "bare";
  title?: string;
};

type CmsPageDoc = {
  slug?: string;
  title?: string | null;
  layout?: string | null;
  blocks?: unknown;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural validation against the page game's registry: type must exist,
 *  props must be a plain object, children only on container blocks. Returns
 *  null on any violation so a typo never breaks a page. The caller passes the
 *  game's registry: importing the full one here would put every game's client
 *  blocks into every block page's bundle. */
export async function validateBlocks(value: unknown, registry: BlockRegistry, depth = 0): Promise<BlockInstance[] | null> {
  if (!Array.isArray(value) || depth > 6) return null;
  const out: BlockInstance[] = [];
  for (const raw of value) {
    if (!isPlainObject(raw) || typeof raw.type !== "string" || !(raw.type in registry)) return null;
    const def = registry[raw.type];
    if (raw.props !== undefined && !isPlainObject(raw.props)) return null;
    // Props must match the block's contract (contracts/blocks.schema.json): a CMS typo falls back to the TS page.
    if (!blockPropsValid(raw.type, raw.props)) return null;
    if (raw.children !== undefined) {
      if (!def.container) return null;
      const children = await validateBlocks(raw.children, registry, depth + 1);
      if (!children) return null;
      out.push({ ...(raw as object), children } as BlockInstance);
      continue;
    }
    out.push(raw as unknown as BlockInstance);
  }
  return out;
}

export async function getCmsPageOverride(pageId: string, lang: Lang, registry: BlockRegistry): Promise<CmsPageOverride | null> {
  // Site (CMS_SITE_SLUG, default gildra), locale and the published version are
  // bound by the public endpoint; slugs keep their page-id form ("wow/home").
  const result = await fetchPage(pageId, lang === "ru" ? "ru" : "en");
  if (result.status === "error") console.error(`cms page override unavailable for ${pageId}: ${result.reason}`);
  if (result.status !== "ok") return null;
  const doc = result.data as CmsPageDoc;
  if (doc.slug !== pageId) return null;
  const blocks = await validateBlocks(doc.blocks, registry);
  if (!blocks || blocks.length === 0) return null;
  return {
    blocks,
    layout: doc.layout === "bare" ? "bare" : doc.layout === "default" ? "default" : undefined,
    title: typeof doc.title === "string" ? doc.title : undefined,
  };
}
