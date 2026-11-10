import type { Lang } from "@/lib/i18n-paths";
import rawSupplement from "./instanceSupplement.json";
import { InstanceLootTable, type LootItem } from "./InstanceLootTable";
const supplement = rawSupplement as Record<string, { loot: LootItem[]; source: string }>;
export function InstanceLoot({ slug, lang }: { slug: string; lang: Lang }) {
  const items = supplement[slug]?.loot;
  return items?.length ? <InstanceLootTable key={slug} items={items} lang={lang} /> : null;
}
