import { auctionPlanCost, auctionPlanLoadout } from "./auctionGearPlanner";
import { auctionEffectGroupKey } from "./auctionGearEffects";
import { prepareGearLoadout } from "./gearSimulation";
import type { GearLoadoutItem } from "./gearCompatibility";
import type { AuctionGearOption, AuctionGearSearchItem } from "./auctionGearTypes";

export type AuctionEnhancementFinalist = { label: string; options: AuctionGearOption[] };
export const auctionSocketProposalLimit = 2;
const selectionKey = (options: AuctionGearOption[]) => JSON.stringify(options.map(option => option.id).sort());

/** Bounded proposals, not a bound on possible gem DPS. A measured bare loss
 * cannot exclude an exact socket variant from the enhanced search. Replacements
 * are tried in retained sets and alone; only the normal optimizer may price,
 * simulate and confirm their actual full configuration. */
export function additionalAuctionSocketFinalists(input: {
  finalists: AuctionEnhancementFinalist[]; options: AuctionGearOption[];
  measured: Pick<AuctionGearSearchItem, "optionId" | "comparison">[];
  equipment: Record<string, unknown>; loadout: GearLoadoutItem[]; specId: number; budgetCopper: number;
  selectedSlots: readonly string[];
  signal: AbortSignal;
}) {
  input.signal.throwIfAborted();
  const measurements = new Map(input.measured.map(row => [row.optionId, row.comparison?.candidateDps]));
  const included = new Set(input.finalists.flatMap(finalist => finalist.options.map(auctionEffectGroupKey)));
  const variants = new Map<string, AuctionGearOption>();
  for (const option of input.options) {
    const variant = option.candidate.variants.find(row => row.key === option.variantKey);
    const metadata = variant?.resolution?.enhancements;
    if (!option.candidate.eligible || metadata?.status !== "verified" || metadata.requiredProfessionId ||
      !metadata.socketColors.some(Boolean) || auctionPlanCost([option]) >= input.budgetCopper) continue;
    const identity = auctionEffectGroupKey(option);
    if (included.has(identity)) continue;
    const previous = variants.get(identity);
    if (!previous || option.costCopper < previous.costCopper || option.costCopper === previous.costCopper && option.id < previous.id)
      variants.set(identity, option);
  }
  // Bare DPS is only proposal ordering, never proof about the gemmed variant.
  // Unmeasured exact variants remain eligible after the measured candidates.
  const ordered = [...variants.values()].sort((a, b) =>
    (measurements.get(b.id) ?? -Infinity) - (measurements.get(a.id) ?? -Infinity) ||
    a.costCopper - b.costCopper || a.id.localeCompare(b.id));
  const known = new Set(input.finalists.map(finalist => selectionKey(finalist.options)));
  const primary: AuctionGearOption[][] = [], alternatives: AuctionGearOption[][] = [];
  for (const option of ordered) {
    input.signal.throwIfAborted();
    const proposals = [...input.finalists.map(finalist => [
      ...finalist.options.filter(row => row.candidate.slotType !== option.candidate.slotType), option,
    ]), [option]];
    let selected = false;
    for (const proposed of proposals) {
      const key = selectionKey(proposed);
      if (known.has(key)) continue;
      if (proposed.some(row => {
        const facts = row.candidate.variants.find(variant => variant.key === row.variantKey)?.resolution?.enhancements;
        return facts?.status !== "verified" || facts.requiredProfessionId;
      })) continue;
      try {
        // Reserve at least one copper for the nonempty socket. Exact commodity
        // quantity, gem/enchant prices and final budget are checked downstream.
        if (auctionPlanCost(proposed) >= input.budgetCopper) continue;
        auctionPlanLoadout(input.loadout, proposed, input.specId, input.selectedSlots);
        prepareGearLoadout({ selections: proposed, equipment: input.equipment, loadout: input.loadout, specId: input.specId });
      } catch { continue; }
      known.add(key);
      (selected ? alternatives : primary).push(proposed);
      selected = true;
    }
  }
  const candidates = [...primary, ...alternatives];
  return {
    finalists: candidates.slice(0, auctionSocketProposalLimit).map((options, index) => ({ label: `socket-${index + 1}`, options })),
    candidatesConsidered: ordered.length,
    searchLimited: ordered.length > 0,
    reasons: ordered.length ? ["socket_candidate_subset", ...(candidates.length > auctionSocketProposalLimit ? ["socket_candidate_limit"] : [])] : [],
  };
}
