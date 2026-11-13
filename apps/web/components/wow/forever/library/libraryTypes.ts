import type { ForeverType } from "@/lib/forever/database/contract";

/** The sign of each record type: a game icon (public/assets/wow/ui/forever/library/SOURCE.md). */
export const libraryTypeIcons: Record<ForeverType, string> = {
  item: "/assets/wow/ui/forever/library/type-item.webp",
  spell: "/assets/wow/ui/forever/library/type-spell.webp",
  npc: "/assets/wow/ui/forever/library/type-npc.webp",
  quest: "/assets/wow/ui/forever/library/type-quest.webp",
  recipe: "/assets/wow/ui/forever/library/type-recipe.webp",
};
