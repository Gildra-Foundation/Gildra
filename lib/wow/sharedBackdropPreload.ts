import "server-only";
import { preload } from "react-dom";

/** Start the shared WoW backdrop before client route effects run. */
export function preloadSharedWowBackdrop() {
  // This image is decorative; route-specific hero images should win the
  // initial bandwidth budget on slow connections.
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
