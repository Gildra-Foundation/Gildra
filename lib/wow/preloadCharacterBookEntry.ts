import { preload } from "react-dom";

const folioPaperImage = "/_next/image?url=%2Fassets%2Fwow%2Fcharacter-book%2Ffolio-vellum-v1-optimized.webp";

/** Preload the resources that paint the first screen of the character book. */
export function preloadCharacterBookEntry() {
  preload(`${folioPaperImage}&w=640&q=75`, {
    as: "image",
    type: "image/webp",
    // Match PhysicalBookFrame's image-set. A single 640px preload caused DPR 2
    // browsers to fetch both 640px and 1920px paper textures.
    imageSrcSet: `${folioPaperImage}&w=640&q=75 1x, ${folioPaperImage}&w=1920&q=75 2x`,
    fetchPriority: "high",
  });
  preload("/assets/wow/character-book/outer-realm-backdrop-v1-optimized.webp", {
    as: "image",
    type: "image/webp",
    fetchPriority: "high",
    media: "(min-width: 761px)",
  });
  preload("/assets/wow/character-book/outer-realm-backdrop-v1-mobile-optimized.webp", {
    as: "image",
    type: "image/webp",
    fetchPriority: "high",
    media: "(max-width: 760px)",
  });
}
