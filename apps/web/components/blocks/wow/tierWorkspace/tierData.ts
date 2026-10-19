/** Data helpers of the tier workspace, shared by the server block and the
 *  client workspace. The sample rows are the saved interface set from
 *  data/site.ts (via lib/specs) — they are shown only when the meta API
 *  supplies no Mythic+ ranking, and the page labels them as a sample. */
import type { GameIntelligence, TierEntry, TierRole } from "@/lib/platform/games/intelligence";
import { specPages } from "@/lib/specs";

const CLASS_SLUGS: Record<string, string> = {
  dk: "death-knight", dh: "demon-hunter", evoker: "evoker", mage: "mage",
  pal: "paladin", rogue: "rogue", druid: "druid", priest: "priest",
  hunter: "hunter", shaman: "shaman", lock: "warlock", monk: "monk", war: "warrior",
};

/** Spec slug without the class suffix, as the meta API sends it ("frost" for "frost-death-knight"). */
const shortSpecSlug = (slug: string, classSlug: string) => slug.endsWith(`-${classSlug}`) ? slug.slice(0, -classSlug.length - 1) : slug;

const sampleDps: TierEntry[] = specPages.map((entry) => {
  const classSlug = CLASS_SLUGS[entry.row.spec.cls] ?? entry.row.spec.cls;
  return {
    rank: entry.rank,
    tier: entry.tier.toUpperCase(),
    role: "dps",
    className: entry.className,
    classSlug,
    specName: entry.row.spec.name.replace(new RegExp(` ${entry.className}$`), ""),
    specSlug: shortSpecSlug(entry.slug, classSlug),
    score: Number(entry.row.score),
    popularity: Number(entry.row.pop.replace("%", "")) / 100,
    maxKey: Number(entry.row.key.replace("+", "")),
    rankChange: entry.row.trend.dir === "up" ? entry.row.trend.val : entry.row.trend.dir === "down" ? -(entry.row.trend.val ?? 0) : 0,
    sourceUrl: `/specs/${entry.slug}`,
  };
});

export const emptyRoles: Record<TierRole, TierEntry[]> = { dps: [], healer: [], tank: [] };
export const sampleRoles: Record<TierRole, TierEntry[]> = { ...emptyRoles, dps: sampleDps };
export const sampleCount = sampleDps.length;

/** True when the page has no Mythic+ ranking from the meta API and falls back to the sample. */
export function usesSample(intelligence: GameIntelligence) {
  return !(intelligence.tierLists?.mythic_plus?.roles ?? intelligence.roles);
}
