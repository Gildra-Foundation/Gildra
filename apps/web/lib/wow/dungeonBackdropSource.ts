import type { DungeonRoute } from "@/lib/data/wow/mythic/dungeonRoutes";

export function dungeonBackdropSource(dungeon: Pick<DungeonRoute, "slug" | "backdropImage">) {
  return `/assets/wow/mythic/panoramas/${dungeon.slug}-calm.webp`;
}
