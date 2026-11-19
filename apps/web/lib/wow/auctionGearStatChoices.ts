import type { AuctionGearOption } from "./auctionGearTypes";

// Single-position armor only. Paired slots can compete for the same physical lot.
const armorSlots = new Set(["HEAD", "SHOULDER", "CHEST", "WRIST", "HANDS", "WAIST", "LEGS", "FEET", "BACK"]);
const primary = new Set(["strength", "intellect", "agility", "strint", "stragi", "agiint", "stragiint"]);
const ratings = new Set(["crit_rating", "haste_rating", "mastery_rating", "versatility_rating"]);

function statChoice(option: AuctionGearOption, measuredDps?: (option: AuctionGearOption) => number | undefined) {
  const { candidate } = option, restrictions = candidate.constraints;
  if (!armorSlots.has(candidate.slotType) || candidate.itemClassId !== 4 || option.customization ||
      restrictions.uniqueEquipped || restrictions.limitCategoryId || restrictions.setId || restrictions.setName || restrictions.crafted) return;
  const variant = candidate.variants.find(v => v.key === option.variantKey);
  const r = variant?.resolution, e = r?.enhancements;
  if (!r || !r.nativeNoItemEffects || r.effects?.length || e?.status !== "verified" ||
      e.socketCount || e.socketBonusId || e.requiredProfessionId || r.weapon) return;
  const stats = Object.entries(r.stats).filter(([, amount]) => amount !== 0);
  if (!stats.length || stats.some(([, value]) => !Number.isSafeInteger(value) || value < 0)) return;
  // Require at least as much stamina and armor too. Keep hybrid
  // primaries distinct so a class-specific conversion cannot reverse the order.
  const comparable = (key: string) => primary.has(key) || ratings.has(key) || key === "stamina" || key === "armor";
  const fixed = stats.filter(([key]) => !comparable(key)).sort(([a], [b]) => a.localeCompare(b));
  const axes = stats.filter(([key]) => comparable(key));
  if (!axes.some(([key]) => primary.has(key))) return;
  return { option, dps: measuredDps?.(option), axes: Object.fromEntries(axes), group: JSON.stringify([candidate.slotType, candidate.itemSubclassId,
    candidate.inventoryType, r.engine, fixed]) };
}

/** A bounded gear-only proposal. Keep every price/stat trade-off and every
 * unverified item. The full native traversal always receives the original pool. */
export function quickAuctionStatChoices(options: AuctionGearOption[], measuredDps?: (option: AuctionGearOption) => number | undefined) {
  const groups = new Map<string, NonNullable<ReturnType<typeof statChoice>>[]>();
  for (const option of options) {
    const row = statChoice(option, measuredDps);
    if (!row) continue;
    const group = groups.get(row.group) ?? [];
    group.push(row);
    groups.set(row.group, group);
  }
  const deferred = new Set<string>();
  for (const group of groups.values()) {
    for (const weaker of group) {
      if (group.some(stronger => stronger.option.costCopper <= weaker.option.costCopper &&
          (weaker.dps === undefined || stronger.dps !== undefined && stronger.dps >= weaker.dps) &&
          Object.entries(weaker.axes).every(([key, value]) => (stronger.axes[key] ?? 0) >= value) &&
          Object.entries(stronger.axes).some(([key, value]) => (primary.has(key) || ratings.has(key)) && value > (weaker.axes[key] ?? 0)))) {
        deferred.add(weaker.option.id);
      }
    }
  }
  return deferred.size ? options.filter(option => !deferred.has(option.id)) : options;
}
