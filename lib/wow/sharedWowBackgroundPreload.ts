import { preload } from "react-dom";

export function preloadSharedWowBackground() {
  preload("/assets/wow/mythic/ruby-depth-v3-light-fast.webp", {
    as: "image",
    type: "image/webp",
    fetchPriority: "low",
    media: "(min-width: 721px)",
  });
  preload("/assets/wow/mythic/ruby-depth-v3-mobile-optimized.webp", {
    as: "image",
    type: "image/webp",
    fetchPriority: "low",
    media: "(max-width: 720px)",
  });
}
