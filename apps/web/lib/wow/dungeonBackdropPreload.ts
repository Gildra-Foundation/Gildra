import { preload } from "react-dom";
import type { DungeonRoute } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonBackdropSource } from "./dungeonBackdropSource";
import { dungeonBackdropSmall } from "./dungeonArtDirection";

export function preloadDungeonBackdrop(dungeon: DungeonRoute) {
  preload(dungeonBackdropSource(dungeon), {
    as: "image", type: "image/webp", fetchPriority: "high",
    imageSrcSet: `${dungeonBackdropSmall(dungeon.slug)} 640w, ${dungeonBackdropSource(dungeon)} 1024w`,
    imageSizes: "100vw",
  });
}
