import { preload } from "react-dom";
import type { DungeonRoute } from "@/components/wow/mythic/dungeonRoutes";
import { dungeonBackdropSource } from "@/lib/wow/dungeonBackdropSource";

const RUBY_MOBILE_BACKDROP = "/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp";

export function preloadDungeonBackdrop(dungeon: DungeonRoute) {
  const responsiveRubyBackdrop = dungeon.slug === "ruby-life-pools";
  preload(dungeonBackdropSource(dungeon), {
    as: "image",
    type: "image/webp",
    fetchPriority: "high",
    ...(responsiveRubyBackdrop ? { media: "(min-width: 781px)" } : {}),
  });

  if (responsiveRubyBackdrop) {
    preload(RUBY_MOBILE_BACKDROP, {
      as: "image",
      type: "image/webp",
      fetchPriority: "high",
      media: "(max-width: 780px)",
    });
  }
}
