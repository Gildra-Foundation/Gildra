import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";

/** Materials echo each existing dungeon environment; map artwork is never modified. */
export const dungeonArtDirections: Record<DungeonSlug, { accent: string; glow: string; motif: string }> = {
  "ruby-life-pools": { accent: "#b95b60", glow: "rgba(176, 46, 63, .12)", motif: "ruby-sanctuary" },
  "altar-of-fangs": { accent: "#a6bf69", glow: "rgba(137, 186, 55, .12)", motif: "ritual-fangs" },
  "murder-row": { accent: "#ca8aa9", glow: "rgba(177, 83, 159, .12)", motif: "elven-filigree" },
  "den-of-nalorakk": { accent: "#83b7bf", glow: "rgba(74, 159, 179, .12)", motif: "bear-stone" },
  "the-blinding-vale": { accent: "#c3d897", glow: "rgba(157, 187, 72, .12)", motif: "living-roots" },
  "voidscar-arena": { accent: "#a79add", glow: "rgba(117, 79, 213, .13)", motif: "void-metal" },
  "kings-rest": { accent: "#d5b775", glow: "rgba(184, 136, 47, .12)", motif: "royal-gold" },
  "temple-of-sethraliss": { accent: "#7fcaca", glow: "rgba(50, 167, 184, .12)", motif: "serpent-bronze" },
};
export function dungeonMapFrame(slug: DungeonSlug, kind: "mdt" | "route", floor: number) {
  return `/assets/wow/mythic/frames/${slug}-${kind}-${floor}.svg`;
}
export function dungeonBackdropSmall(slug: DungeonSlug) {
  if (slug === "ruby-life-pools") return "/assets/wow/mythic/ruby-sanctuary/sanctuary-768.webp";
  return `/assets/wow/mythic/dungeon-scenes/${slug}/scene-768.webp`;
}

export const dungeonAtmospheres: Record<DungeonSlug, "rain" | "mist" | "snow" | "pollen" | "void" | "souls" | "sand"> = {
  "ruby-life-pools": "rain", "altar-of-fangs": "mist", "murder-row": "rain",
  "den-of-nalorakk": "snow", "the-blinding-vale": "pollen", "voidscar-arena": "void",
  "kings-rest": "souls", "temple-of-sethraliss": "sand",
};
export function dungeonBackdropMobile(slug: DungeonSlug) {
  return slug === "ruby-life-pools" ? "/assets/wow/mythic/ruby-sanctuary/sanctuary-mobile.webp" : `/assets/wow/mythic/dungeon-scenes/${slug}/scene-mobile.webp`;
}
export function dungeonFrameArtwork(slug: DungeonSlug) {
  return slug === "ruby-life-pools" ? "/assets/wow/mythic/ruby-sanctuary/map-frame.webp" : `/assets/wow/mythic/dungeon-scenes/${slug}/map-frame.webp`;
}
