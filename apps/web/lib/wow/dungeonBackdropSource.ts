import type { DungeonRoute } from "@/lib/data/wow/mythic/dungeonRoutes";

export function dungeonBackdropSource(dungeon: Pick<DungeonRoute, "slug" | "backdropImage">) {
  if (dungeon.slug === "ruby-life-pools") return "/assets/wow/mythic/ruby-sanctuary/sanctuary.webp";
  return `/assets/wow/mythic/dungeon-scenes/${dungeon.slug}/scene.webp`;
}
