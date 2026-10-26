/**
 * Shared vocabulary of the transmog studio: slots, races, frame formats and
 * backgrounds, plus the shape of the /v1/wow/transmog answers. No React and no
 * i18n here — client components import it directly.
 */

export type TransmogSlot =
  | "head" | "shoulder" | "back" | "chest" | "shirt" | "tabard" | "wrist"
  | "hands" | "waist" | "legs" | "feet" | "main-hand" | "off-hand";

export const transmogSlots: TransmogSlot[] = ["head", "shoulder", "back", "chest", "shirt", "tabard", "wrist", "hands", "waist", "legs", "feet", "main-hand", "off-hand"];
/** Paper doll as in the game's character pane. */
export const dollLeft: TransmogSlot[] = ["head", "shoulder", "back", "chest", "shirt", "tabard", "wrist"];
export const dollRight: TransmogSlot[] = ["hands", "waist", "legs", "feet"];
export const dollWeapons: TransmogSlot[] = ["main-hand", "off-hand"];

/** Viewer slot numbers to clear when a doll slot is hidden or emptied. */
export const viewerSlotsOf: Record<TransmogSlot, number[]> = {
  head: [1], shoulder: [3], back: [16], chest: [5, 20], shirt: [4], tabard: [19], wrist: [9],
  hands: [10], waist: [6], legs: [7], feet: [8], "main-hand": [21], "off-hand": [22],
};

/** Slots with an armor type filter (cloth, leather, mail, plate). */
export const armoredSlots = new Set<TransmogSlot>(["head", "shoulder", "chest", "wrist", "hands", "waist", "legs", "feet"]);
export const armorTypes = ["plate", "mail", "leather", "cloth", "cosmetic"] as const;
export type ArmorType = (typeof armorTypes)[number];

export type TransmogAppearance = {
  modifiedAppearanceId: number;
  appearanceId: number;
  displayId: number;
  itemId: number;
  inventoryType: number;
  slot: TransmogSlot;
  viewerSlot: number;
  name: string;
  quality: number;
  iconName?: string;
  armor?: ArmorType;
  itemCount: number;
};

export type TransmogAppearancePage = { data: TransmogAppearance[]; total: number; nextCursor?: string; buildId: number };
export type TransmogSetSummary = { id: number; name: string; classMask: number; expansionId: number; itemCount: number; iconName?: string };
export type TransmogSetPage = { data: TransmogSetSummary[]; total: number; nextCursor?: string; buildId: number };
export type TransmogSetDetail = TransmogSetSummary & { items: TransmogAppearance[] };

/** Icon sources in order: Wowhead also has icons of the newest items, Blizzard's render CDN is the fallback. */
export function iconUrls(iconName?: string) {
  return iconName ? [`https://wow.zamimg.com/images/wow/icons/medium/${iconName}.jpg`, `https://render.worldofwarcraft.com/us/icons/56/${iconName}.jpg`] : [];
}

/**
 * Playable races with their ChrModel ids in the Wowhead viewer (male, female).
 * 23/24 is a non-playable model and later races are not mapped yet.
 */
export const transmogRaces = [
  { id: "human", models: [1, 2] },
  { id: "orc", models: [3, 4] },
  { id: "dwarf", models: [5, 6] },
  { id: "night-elf", models: [7, 8] },
  { id: "undead", models: [9, 10] },
  { id: "tauren", models: [11, 12] },
  { id: "gnome", models: [13, 14] },
  { id: "troll", models: [15, 16] },
  { id: "goblin", models: [17, 18] },
  { id: "blood-elf", models: [19, 20] },
  { id: "draenei", models: [21, 22] },
] as const;
export type TransmogRace = (typeof transmogRaces)[number]["id"];
export type TransmogGender = "m" | "f";

export function chrModelId(race: TransmogRace, gender: TransmogGender) {
  const entry = transmogRaces.find((candidate) => candidate.id === race) ?? transmogRaces[0];
  return entry.models[gender === "f" ? 1 : 0];
}

export const classIds = [
  { id: 1, slug: "warrior" }, { id: 2, slug: "paladin" }, { id: 3, slug: "hunter" }, { id: 4, slug: "rogue" },
  { id: 5, slug: "priest" }, { id: 6, slug: "death-knight" }, { id: 7, slug: "shaman" }, { id: 8, slug: "mage" },
  { id: 9, slug: "warlock" }, { id: 10, slug: "monk" }, { id: 11, slug: "druid" }, { id: 12, slug: "demon-hunter" },
  { id: 13, slug: "evoker" },
] as const;

/** Export frames: social posts, stories, link previews and wide screens. */
export const frameFormats = [
  { id: "1x1", width: 1080, height: 1080 },
  { id: "4x5", width: 1080, height: 1350 },
  { id: "9x16", width: 1080, height: 1920 },
  { id: "og", width: 1200, height: 630 },
  { id: "16x9", width: 1920, height: 1080 },
] as const;
export type FrameFormatId = (typeof frameFormats)[number]["id"];
export const frameFormat = (id: string) => frameFormats.find((format) => format.id === id) ?? frameFormats[1];

export type BackgroundDef =
  | { id: string; kind: "transparent" }
  | { id: string; kind: "color"; color: string }
  | { id: string; kind: "gradient"; stops: [string, string]; angle: number }
  | { id: string; kind: "scene"; src: string; position: string };

/**
 * Backgrounds. Colors and gradients are export pixels, not interface colors,
 * so they live here as data. Scenes are the site's own paintings, served from
 * this origin so the export canvas stays clean.
 */
export const backgrounds: BackgroundDef[] = [
  { id: "transparent", kind: "transparent" },
  { id: "night", kind: "color", color: "#0b1118" },
  { id: "parchment", kind: "color", color: "#d9c7a1" },
  { id: "white", kind: "color", color: "#f4f1ea" },
  { id: "void", kind: "gradient", stops: ["#3b2a5c", "#0a0b14"], angle: 160 },
  { id: "dawn", kind: "gradient", stops: ["#f0b56a", "#3a1f2b"], angle: 170 },
  { id: "frost", kind: "gradient", stops: ["#7cc8ee", "#0b1a2a"], angle: 165 },
  { id: "fel", kind: "gradient", stops: ["#7fbf4a", "#0c140a"], angle: 165 },
  { id: "vault", kind: "scene", src: "/assets/wow/raids/hub/vault.webp", position: "62% 50%" },
  { id: "sanctuary", kind: "scene", src: "/assets/wow/mythic/ruby-sanctuary/sanctuary.webp", position: "50% 50%" },
  { id: "voidscar", kind: "scene", src: "/assets/wow/mythic/backgrounds/voidscar.webp", position: "55% 50%" },
  { id: "nalorakk", kind: "scene", src: "/assets/wow/mythic/backgrounds/nalorakk.webp", position: "50% 50%" },
  { id: "kings", kind: "scene", src: "/assets/wow/mythic/backgrounds/kings.webp", position: "50% 50%" },
  { id: "blinding", kind: "scene", src: "/assets/wow/mythic/backgrounds/blinding.webp", position: "50% 50%" },
  { id: "city", kind: "scene", src: "/assets/wow/loading/city-4k.webp", position: "50% 50%" },
  { id: "archive", kind: "scene", src: "/assets/wow/loading/archive-4k.webp", position: "50% 50%" },
  { id: "tools", kind: "scene", src: "/assets/wow/loading/tools-4k.webp", position: "50% 50%" },
];
export const background = (id: string) => backgrounds.find((entry) => entry.id === id) ?? backgrounds[8];

/** Animations of the viewer's character model. */
export const poses = ["Stand", "Ready1H", "Ready2H", "EmoteSalute", "EmoteFlex", "EmoteRoar", "EmoteCheer", "EmoteKneel", "EmoteSitGround", "EmoteDance"] as const;
export type Pose = (typeof poses)[number];
