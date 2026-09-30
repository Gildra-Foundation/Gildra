import type { DungeonRoute } from "@/components/wow/mythic/dungeonRoutes";

export function dungeonBackdropSource(dungeon: Pick<DungeonRoute, "slug" | "backdropImage">) {
  if (dungeon.slug === "ruby-life-pools") return dungeon.backdropImage;
  const params = new URLSearchParams({ url: dungeon.backdropImage, w: "1920", q: "75" });
  return `/_next/image?${params.toString()}`;
}
