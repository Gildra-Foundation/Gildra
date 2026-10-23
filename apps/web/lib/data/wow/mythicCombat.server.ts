import "server-only";
import catalogue from "@/data/wow/mythic-reviews/combat.json";
import type { DungeonSlug } from "./mythic/dungeonRoutes";
import type { ReviewedCombat } from "./mythicCombat.types";

export function getMythicCombatReview(slug: DungeonSlug): ReviewedCombat {
  return catalogue[slug] as ReviewedCombat;
}
