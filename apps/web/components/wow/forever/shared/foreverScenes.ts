import type { AtlasSceneId } from "@/lib/atlas/scenes";

/**
 * The place each Forever page stands in (lib/atlas/scenes.ts): the hub keeps the old
 * road to the keep, every other page has a scene of its own. A page of one entity
 * (a dungeon, a raid) may hand its own painting to the frame instead (`art`).
 */
export const foreverScenes = {
  hub: "forever",
  dungeons: "foreverDungeons",
  raids: "foreverRaids",
  classes: "foreverClasses",
  changes: "foreverClasses",
  talents: "talents",
  tierLists: "tierLists",
  library: "foreverLibrary",
  professions: "foreverCrafts",
} as const satisfies Record<string, AtlasSceneId>;

export type ForeverPageId = keyof typeof foreverScenes;
