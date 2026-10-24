import type { DungeonSlug } from "@/lib/data/wow/mythic/dungeonRoutes";

/** Materials echo each existing dungeon environment; map artwork is never modified. */
export const dungeonArtDirections: Record<DungeonSlug, { accent: string; glow: string; motif: string }> = {
  "ruby-life-pools": { accent: "#da8159", glow: "rgba(232, 80, 35, .13)", motif: "ruby-obsidian" },
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
  return `/assets/wow/mythic/panoramas/${slug}-calm-640.webp`;
}
