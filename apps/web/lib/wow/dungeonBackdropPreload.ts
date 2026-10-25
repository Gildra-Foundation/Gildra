import { preload } from "react-dom";
import type { DungeonRoute } from "@/lib/data/wow/mythic/dungeonRoutes";
import { dungeonBackdropSource } from "./dungeonBackdropSource";
import { dungeonBackdropSmall } from "./dungeonArtDirection";

export function preloadDungeonBackdrop(dungeon: DungeonRoute) {
  if (dungeon.slug === "ruby-life-pools") {
    preload("/assets/wow/mythic/ruby-sanctuary/sanctuary-mobile.webp", { as: "image", type: "image/webp", fetchPriority: "high", media: "(max-width: 720px)" });
    preload(dungeonBackdropSource(dungeon), { as: "image", type: "image/webp", fetchPriority: "high", media: "(min-width: 721px)", imageSrcSet: `${dungeonBackdropSmall(dungeon.slug)} 768w, ${dungeonBackdropSource(dungeon)} 1448w`, imageSizes: "100vw" });
    return;
  }
  preload(dungeonBackdropSource(dungeon), {
    as: "image", type: "image/webp", fetchPriority: "high",
    imageSrcSet: `${dungeonBackdropSmall(dungeon.slug)} 640w, ${dungeonBackdropSource(dungeon)} 1024w`,
    imageSizes: "100vw",
  });
}
