import type { CatalogRecord } from "@/lib/api/client";

/**
 * Many item records carry their quality only on the base variant of the
 * tooltip (`item_variants`), not on the record. The tooltip colours its name
 * by the record quality, so the variant fills it in when the record has none.
 */
export function withVariantQuality<T extends Pick<CatalogRecord, "quality" | "tooltip">>(entity: T): T {
  if (typeof entity.quality === "number") return entity;
  const variants = entity.tooltip?.blocks.find((block) => String(block.type ?? "") === "item_variants")?.entries;
  if (!Array.isArray(variants)) return entity;
  const rows = variants as Record<string, unknown>[];
  const base = rows.find((variant) => variant.key === "base") ?? rows[0];
  return typeof base?.quality === "number" ? { ...entity, quality: base.quality } : entity;
}
