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
  /** Colour of the horizon at the foot of the page (default: the tint, else the theme glow); sparks rise out of it. */
  horizon?: string;
  /** Colour of the rising sparks (default: the amber embers of the torchlight). */
  ember?: string;
  /** Living light on points of the painting (AtlasArtGlow): natural size and points (0–1). */
  glow?: { size: readonly [number, number]; points: readonly { at: readonly [number, number]; radius: number; color: string; tempo?: number }[] };
  /** Focus of the 1200×630 link-preview crop, 0–1. */
  og: [number, number];
};

const L = "/assets/wow/loading";

export const atlasScenes = {
  forever: { art: `${L}/forever-old-road-20261111.webp`, position: "70% 38%", shade: "deep", og: [0.7, 0.38] },
  foreverCrafts: { art: `${L}/forever-crafthall-20261111.webp`, position: "70% 40%", shade: "deep", og: [0.7, 0.4] },
  // Forever pages each stand in a place of their own (components/wow/forever/shared/foreverScenes.ts).
  foreverDungeons: { art: `${L}/dungeon.webp`, position: "center 45%", shade: "deep", horizon: "rgba(190, 140, 70, .16)", og: [0.5, 0.45] },
  foreverRaids: { art: `${L}/tier.webp`, position: "70% 40%", shade: "deep", horizon: "rgba(200, 120, 60, .16)", og: [0.6, 0.45] },
  foreverClasses: { art: `${L}/talents-wow.webp`, position: "70% 40%", shade: "deep", horizon: "rgba(220, 150, 90, .16)", og: [0.6, 0.45] },
  foreverLibrary: { art: `${L}/archive.webp`, position: "70% 40%", shade: "deep", horizon: "rgba(110, 170, 120, .16)", og: [0.6, 0.45] },
  talents: { art: `${L}/talents-hall-20261106.webp`, position: "70% 40%", og: [0.7, 0.4] },
  wow: { art: `${L}/wow-azeroth-vista-20261106.webp`, position: "70% 40%", horizon: "rgba(220, 170, 90, .18)", og: [0.7, 0.4] },
  raids: { art: "/assets/wow/raids/midnight/backgrounds/the-voidspire-scene.webp", position: "center 30%", tint: "rgba(95, 46, 151, .2)", ember: "rgba(200, 168, 255, .95)", og: [0.5, 0.35] },
  venomousAbyss: { art: "/assets/wow/mythic/backgrounds/altar.webp", position: "center 35%", tint: "rgba(96, 150, 70, .16)", ember: "rgba(180, 238, 146, .95)", og: [0.5, 0.4] },
  venomousBoss: { art: "/assets/wow/mythic/backgrounds/altar.webp", position: "center 45%", horizon: "rgba(96, 150, 70, .16)", og: [0.5, 0.4] },
  sporefall: { art: `${L}/raid-wow-optimized.webp`, position: "center 40%", tint: "rgba(122, 64, 196, .2)", ember: "rgba(218, 168, 255, .95)", og: [0.5, 0.4] },
  mythicPlus: { art: "/assets/wow/mythic/ruby-depth-v3-light-fast.webp", position: "center 30%", tint: "rgba(200, 93, 38, .18)", ember: "rgba(255, 168, 112, .95)", og: [0.5, 0.4],
    // The lava lake and the lavafall breathe (the motion budget allows up to three lights).
    glow: { size: [1500, 844], points: [{ at: [0.72, 0.77], radius: 120, color: "rgba(255, 120, 40, .55)", tempo: 5 }, { at: [0.875, 0.56], radius: 70, color: "rgba(255, 150, 60, .5)", tempo: 3.4 }] } },
  mythicSeasons: { art: "/assets/wow/mythic/backgrounds/nalorakk.webp", position: "center 40%", horizon: "rgba(40, 150, 160, .2)", og: [0.5, 0.4] },
  dungeons: { art: "/assets/wow/mythic/backgrounds/nalorakk.webp", position: "center 40%", horizon: "rgba(40, 150, 160, .2)", og: [0.5, 0.4] },
  lairs: { art: `${L}/lairs-grotto-20261106.webp`, position: "72% 40%", ember: "rgba(156, 238, 214, .95)", horizon: "rgba(60, 190, 160, .2)", og: [0.7, 0.4] },
  classes: { art: `${L}/classes-heroes-20261106.webp`, position: "68% 62%", horizon: "rgba(150, 110, 220, .18)", og: [0.5, 0.4] },
  delves: { art: `${L}/dungeon.webp`, position: "center 45%", horizon: "rgba(190, 140, 70, .18)", og: [0.5, 0.45] },
  tierLists: { art: `${L}/tier-lists-war-room-20261106.webp`, position: "70% 45%", horizon: "rgba(220, 150, 70, .16)", og: [0.68, 0.45] },
  archive: { art: `${L}/library-violet-citadel-20261106.webp`, position: "70% 40%", horizon: "rgba(130, 120, 230, .16)", og: [0.7, 0.4] },
  archiveDeep: { art: `${L}/library-violet-citadel-20261106.webp`, position: "70% 40%", shade: "deep", horizon: "rgba(130, 120, 230, .16)", og: [0.7, 0.4] },
  library: { art: `${L}/library-violet-citadel-20261106.webp`, position: "70% 40%", horizon: "rgba(130, 120, 230, .16)", og: [0.7, 0.4] },
  articles: { art: `${L}/whats-new-silvermoon-20261106.webp`, position: "72% 35%", horizon: "rgba(230, 170, 90, .16)", og: [0.72, 0.35] },
  transmog: { art: `${L}/transmog-wardrobe-20261106.webp`, position: "72% 40%", horizon: "rgba(90, 200, 190, .16)", og: [0.72, 0.4] },
  login: { art: "/assets/wow/character-book/intro/varok-home-background-v2.webp", position: "center 30%", horizon: "rgba(200, 160, 90, .18)", og: [0.5, 0.3] },
  lost: { art: `${L}/lost-battlefield-20261106.webp`, position: "70% 40%", horizon: "rgba(200, 70, 50, .18)", og: [0.7, 0.4] },
} as const satisfies Record<string, AtlasScene>;

export type AtlasSceneId = keyof typeof atlasScenes;
