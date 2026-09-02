import "server-only";
import type { BlockInstance } from "@/lib/blocks/page";
import { registry } from "@/lib/blocks/registry";
import type { Lang } from "@/lib/i18n";

/**
 * Payload CMS page overrides.
 *
 * A published CMS `pages` document whose `slug` equals a page id ("wow/home")
 * and whose `blocks` field holds a `BlockInstance[]` replaces the TS config
 * for that page. Everything fails open: no CMS URL, CMS down, no document,
 * malformed JSON or an unknown block type → the code config renders.
 */
export type CmsPageOverride = {
  blocks: BlockInstance[];
  layout?: "default" | "bare";
  title?: string;
};

const cmsURL = () => (process.env.CMS_INTERNAL_URL ?? "").replace(/\/$/, "");

type CmsPageDoc = {
  slug?: string;
  title?: string;
  layout?: string;
  blocks?: unknown;
  _status?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structural validation against the registry: type must exist, props must be
 *  a plain object, children only on container blocks. Returns null on any
 *  violation so a typo never breaks a page. */
export function validateBlocks(value: unknown, depth = 0): BlockInstance[] | null {
  if (!Array.isArray(value) || depth > 6) return null;
  const out: BlockInstance[] = [];
  for (const raw of value) {
    if (!isPlainObject(raw) || typeof raw.type !== "string" || !(raw.type in registry)) return null;
    const def = registry[raw.type as keyof typeof registry];
    if (raw.props !== undefined && !isPlainObject(raw.props)) return null;
    if (raw.children !== undefined) {
      if (!def.container) return null;
      const children = validateBlocks(raw.children, depth + 1);
      if (!children) return null;
      out.push({ ...(raw as object), children } as BlockInstance);
      continue;
    }
    out.push(raw as unknown as BlockInstance);
  }
  return out;
}

export async function getCmsPageOverride(pageId: string, lang: Lang): Promise<CmsPageOverride | null> {
  const base = cmsURL();
  if (!base) return null;
  try {
    const params = new URLSearchParams({
      "where[slug][equals]": pageId,
      locale: lang,
      "fallback-locale": "en",
      depth: "0",
      limit: "1",
    });
    const response = await fetch(`${base}/api/pages?${params}`, {
      next: { revalidate: 60, tags: ["cms-pages", `cms-page-${pageId}`] },
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { docs?: CmsPageDoc[] };
    const doc = payload.docs?.[0];
    if (!doc || doc._status === "draft") return null;
    const blocks = validateBlocks(doc.blocks);
    if (!blocks || blocks.length === 0) return null;
    return {
      blocks,
      layout: doc.layout === "bare" ? "bare" : doc.layout === "default" ? "default" : undefined,
      title: typeof doc.title === "string" ? doc.title : undefined,
    };
  } catch (error) {
    console.error(`cms page override unavailable for ${pageId}`, error);
    return null;
  }
}
