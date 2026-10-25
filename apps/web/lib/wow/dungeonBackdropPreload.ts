import { preload } from "react-dom";
import type { DungeonRoute } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonBackdropSource } from "./dungeonBackdropSource";
import { dungeonBackdropSmall, dungeonBackdropMobile } from "./dungeonArtDirection";

export function preloadDungeonBackdrop(dungeon: DungeonRoute) {
  preload(dungeonBackdropMobile(dungeon.slug), { as: "image", type: "image/webp", fetchPriority: "high", media: "(max-width: 720px)" });
  preload(dungeonBackdropSource(dungeon), { as: "image", type: "image/webp", fetchPriority: "high", media: "(min-width: 721px)", imageSrcSet: `${dungeonBackdropSmall(dungeon.slug)} 768w, ${dungeonBackdropSource(dungeon)} 1448w`, imageSizes: "100vw" });
}
