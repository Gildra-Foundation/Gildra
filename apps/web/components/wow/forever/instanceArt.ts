import manifest from "../../../public/assets/wow/ui/forever/instances/manifest.json";

/** A dungeon's or raid's painting from the game's interface (provenance: /assets/wow/ui/forever/instances/SOURCE.md). */
export type InstanceArt = { src: string; width: number; height: number; position: string };
const paintings = manifest as Record<string, InstanceArt>;
export const instanceArt = (slug: string): InstanceArt | undefined => paintings[slug];
