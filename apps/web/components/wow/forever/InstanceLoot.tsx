import { AtlasDisclosure, AtlasSection, AtlasTable } from "@/components/atlas";
import { MaterialPlaque } from "@/components/wow/shared/materialAtlas";
import type { Lang } from "@/lib/i18n-paths";
import rawSupplement from "./instanceSupplement.json";
import { instanceDetailCopy } from "./instanceDetailCopy";
import styles from "./instanceDetails.module.css";
type LootItem = { id: number; name: Record<Lang, string>; icon: string; level: number; itemLevel: number; slot: number; boss: string; url: string };
const supplement = rawSupplement as Record<string, { loot: LootItem[]; source: string }>;
export function InstanceLoot({ slug, lang }: { slug: string; lang: Lang }) {
  const rows = supplement[slug]?.loot;
  if (!rows?.length) return null;
  const t = instanceDetailCopy[lang];
  return <AtlasSection title={t.loot}><MaterialPlaque kit="den-of-nalorakk"><AtlasDisclosure summary={t.equipment}>
    <AtlasTable label={t.loot} rows={rows} rowKey={row => `${row.id}-${row.boss}`} layout="cards" columns={[
      { key: "item", header: t.item, rowHeader: true, cell: row => <a className={styles.item} href={row.url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.icon} alt="" width={36} height={36} loading="lazy" /><span>{row.name[lang]}</span>
      </a> },
      { key: "slot", header: t.slot, cell: row => t.slots[row.slot] || "—" },
      { key: "level", header: t.required, numeric: true, cell: row => row.level || "—" },
      { key: "boss", header: t.enemy, cell: row => row.boss || "—" },
    ]} />
  </AtlasDisclosure></MaterialPlaque></AtlasSection>;
}
