import type { TalentTree } from "@/lib/forever/talents/types";

/** "Feral Combat" → "feral-combat": the tree's anchor (`#tree-…`) and the name of its painting. */
export const treeKey = (tree: TalentTree) => tree.name.en.toLowerCase().replaceAll(" ", "-");

/** The game's own backdrop of a talent tree (provenance: /assets/wow/ui/forever/talents/SOURCE.md). */
export const foreverTreeArt = (classSlug: string, tree: TalentTree) => `/assets/wow/ui/forever/talents/trees/${classSlug}-${treeKey(tree)}.webp`;
