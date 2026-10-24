import type { TalentCalculatorData } from "@/lib/talentCalculatorData";
import { decodeWoWTalentLoadout, encodeWoWTalentLoadout } from "@/lib/wowTalentLoadout";
import { decodeMythicTalentTree } from "@/components/wow/mythic/mythicTalentImport";
import { projectSharedTalentTree } from "./sharedTalentTree";

/** Change only the hero allocation using the character calculator's own codec. */
export function changeSharedHero(data: TalentCalculatorData, code: string): string {
  if (!decodeMythicTalentTree(code).ok) throw new Error("Invalid shared build");
  const selected = decodeWoWTalentLoadout(data, code);
  if (!selected) throw new Error("Invalid calculator loadout");
  for (const node of data.trees.hero.nodes) {
    selected.ranks.delete(node.id); selected.choices.delete(node.id);
    if (node.freeNode) selected.ranks.set(node.id, node.maxRanks);
  }
  const next = encodeWoWTalentLoadout(data, selected.ranks, selected.choices);
  projectSharedTalentTree(data, next);
  return next;
}
