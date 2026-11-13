import manifest from "../../../public/assets/wow/ui/forever/instances/manifest.json";

/** A dungeon's or raid's painting from the game's interface (provenance: /assets/wow/ui/forever/instances/SOURCE.md). */
export type InstanceArt = { src: string; width: number; height: number; position: string };
const paintings = manifest as Record<string, InstanceArt>;
export const instanceArt = (slug: string): InstanceArt | undefined => paintings[slug];

/**
 * What a narrow door of the hub (3 / 4) keeps of a 2 : 1 painting: the part worth seeing
 * (a lit gate, a tower, the dragon), where it is not the middle.
 */
const doorPositions: Record<string, string> = {
  "hall-of-thanes": "14% 50%",
  "ruins-of-lordaeron": "6% 50%",
  "excavation-site": "82% 50%",
  "city-of-dalaran": "92% 50%",
  "the-drowned-city": "56% 50%",
  "kroldok-stronghold": "36% 50%",
  "shapers-terrace": "30% 50%",
  "onyxias-lair": "72% 50%",
};
export const instanceDoorPosition = (slug: string): string | undefined => doorPositions[slug];
