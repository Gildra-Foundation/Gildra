/**
 * Scene registry of the atlas: which painting stands behind each section, where
 * its crop focuses, whether it needs the deep shade and which colour tints the
 * torchlight. Pages pick a scene by name (`<AtlasFrame scene="raids">`) and the
 * link-preview cards (lib/og/routes.tsx) read the same entries, so a section's
 * art changes in one place. Pages whose art is the entity itself (a raid, a
 * boss, a lair portrait) pass `art` directly.
 */
export type AtlasScene = {
  /** Painting under public/assets. */
  art: string;
  /** CSS object-position of the page crop. */
  position: string;
  /** Bright paintings need the deep shade to keep text AA. */
  shade?: "deep";
  /** Colour of the atmosphere glow; chrome stays amber. */
  tint?: string;
  /** Colour of the rising sparks (default: the amber embers of the torchlight). */
  ember?: string;
  /** Living light on points of the painting (AtlasArtGlow): natural size and points (0–1). */
  glow?: { size: readonly [number, number]; points: readonly { at: readonly [number, number]; radius: number; color: string; tempo?: number }[] };
  /** Focus of the 1200×630 link-preview crop, 0–1. */
  og: [number, number];
};

const L = "/assets/wow/loading";

export const atlasScenes = {
  wow: { art: "/assets/characters/furybar-horde-hero-v1-optimized.webp", position: "72% 30%", og: [0.72, 0.3] },
  raids: { art: "/assets/wow/raids/midnight/backgrounds/the-voidspire-scene.webp", position: "center 30%", tint: "rgba(95, 46, 151, .2)", ember: "rgba(200, 168, 255, .95)", og: [0.5, 0.35] },
  venomousAbyss: { art: "/assets/wow/mythic/backgrounds/altar.webp", position: "center 35%", tint: "rgba(96, 150, 70, .16)", ember: "rgba(180, 238, 146, .95)", og: [0.5, 0.4] },
  venomousBoss: { art: "/assets/wow/mythic/backgrounds/altar.webp", position: "center 45%", og: [0.5, 0.4] },
  sporefall: { art: `${L}/raid-wow-optimized.webp`, position: "center 40%", tint: "rgba(122, 64, 196, .2)", ember: "rgba(218, 168, 255, .95)", og: [0.5, 0.4] },
  mythicPlus: { art: "/assets/wow/mythic/ruby-depth-v3-light-fast.webp", position: "center 30%", tint: "rgba(200, 93, 38, .18)", ember: "rgba(255, 168, 112, .95)", og: [0.5, 0.4],
    // The lava lake and the lavafall breathe (the motion budget allows up to three lights).
    glow: { size: [1500, 844], points: [{ at: [0.72, 0.77], radius: 120, color: "rgba(255, 120, 40, .55)", tempo: 5 }, { at: [0.875, 0.56], radius: 70, color: "rgba(255, 150, 60, .5)", tempo: 3.4 }] } },
  mythicSeasons: { art: "/assets/wow/mythic/backgrounds/nalorakk.webp", position: "center 40%", og: [0.5, 0.4] },
  dungeons: { art: "/assets/wow/mythic/backgrounds/nalorakk.webp", position: "center 40%", og: [0.5, 0.4] },
  lairs: { art: "/assets/wow/lairs/bosses/nymrissa.jpg", position: "center 30%", ember: "rgba(156, 222, 255, .95)", og: [0.5, 0.3],
    // Nymrissa's staff crystal pulses.
    glow: { size: [700, 790], points: [{ at: [0.344, 0.526], radius: 34, color: "rgba(140, 220, 255, .75)", tempo: 2.8 }] } },
  classes: { art: `${L}/talents-wow.webp`, position: "center 40%", og: [0.5, 0.4] },
  delves: { art: `${L}/dungeon.webp`, position: "center 45%", og: [0.5, 0.45] },
  tierLists: { art: "/assets/wow/mythic/backgrounds/kings.webp", position: "center 40%", og: [0.5, 0.4] },
  archive: { art: `${L}/archive.webp`, position: "center 45%", og: [0.5, 0.45] },
  archiveDeep: { art: `${L}/archive.webp`, position: "center 45%", shade: "deep", og: [0.5, 0.45] },
  library: { art: `${L}/tier.webp`, position: "center 50%", og: [0.5, 0.5] },
  articles: { art: `${L}/city.webp`, position: "center 40%", og: [0.5, 0.4] },
  login: { art: "/assets/wow/character-book/intro/varok-home-background-v2.webp", position: "center 30%", og: [0.5, 0.3] },
  lost: { art: `${L}/pvp.webp`, position: "center 55%", og: [0.5, 0.55] },
} as const satisfies Record<string, AtlasScene>;

export type AtlasSceneId = keyof typeof atlasScenes;
