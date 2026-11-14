import type { Lang } from "@/lib/i18n-paths";
import { foreverRecordPath } from "@/lib/forever/database/contract";
import { foreverRecord } from "@/lib/forever/database/server";
import rawSupplement from "./instanceSupplement.json";
import { InstanceLootTable, type LootItem } from "./InstanceLootTable";
const supplement = rawSupplement as Record<string, { loot: LootItem[]; source: string }>;
export const hasInstanceLoot = (slug: string) => Boolean(supplement[slug]?.loot.length);

/** The dungeon's loot; an item the Forever library knows takes its quality from there and opens its library page. */
export async function InstanceLoot({ slug, lang }: { slug: string; lang: Lang }) {
  const loot = supplement[slug]?.loot;
  if (!loot?.length) return null;
  const items = await Promise.all(loot.map(async item => {
    const record = await foreverRecord("item", item.id).catch(() => null);
    return record ? { ...item, quality: record.quality, url: foreverRecordPath("item", item.id, lang), external: false } : { ...item, external: true };
  }));
  return <InstanceLootTable key={slug} items={items} lang={lang} />;
}
