import { tierTable, classChips, type TableRow } from "@/data/site";

/** Постоянные страницы спеков: генерируются из tierTable —
 *  только спеки с полными данными строки получают свой URL. */

export const specSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/* Роли — игровые факты (все текущие строки таблицы — DPS-спеки). */
const ROLES: Record<string, string> = {
  "Frost Death Knight": "DPS",
  "Arcane Mage": "DPS",
  "Augmentation Evoker": "DPS",
  "Retribution Paladin": "DPS",
  "Outlaw Rogue": "DPS",
  "Balance Druid": "DPS",
  "Shadow Priest": "DPS",
  "Marksmanship Hunter": "DPS",
  "Elemental Shaman": "DPS",
  "Affliction Warlock": "DPS",
};

export type SpecPage = {
  slug: string;
  tier: "s" | "a" | "b";
  rank: number;
  role: string;
  className: string;
  row: TableRow;
};

export const specPages: SpecPage[] = (() => {
  const out: SpecPage[] = [];
  let rank = 1;
  for (const block of tierTable) {
    for (const row of block.rows) {
      out.push({
        slug: specSlug(row.spec.name),
        tier: block.tier,
        rank: rank++,
        role: ROLES[row.spec.name] ?? "DPS",
        className:
          classChips.find((c) => c.key === row.spec.cls)?.label ?? row.spec.cls,
        row,
      });
    }
  }
  return out;
})();

export const findSpecPage = (slug: string) =>
  specPages.find((p) => p.slug === slug);

/** Ссылка на спек: своя страница, если она есть, иначе полный тир-лист. */
export const specHref = (name: string) => {
  const slug = specSlug(name);
  return specPages.some((p) => p.slug === slug)
    ? `/specs/${slug}`
    : "/tier-lists";
};
