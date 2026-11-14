import type { TalentTree } from "@/lib/forever/talents/types";

/** "Feral Combat" → "feral-combat": the tree's anchor (`#tree-…`) and the name of its painting. */
export const treeKey = (tree: TalentTree) => tree.name.en.toLowerCase().replaceAll(" ", "-");
