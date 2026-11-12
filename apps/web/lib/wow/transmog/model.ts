/**
 * Shared vocabulary of the transmog studio: slots, races, frame formats and
 * backgrounds, plus the shape of the /v1/wow/transmog answers. No React and no
 * i18n here — client components import it directly.
 */

import { chrModelIdForRace } from "@/lib/wow/chrModels";

export type TransmogSlot =
  | "head" | "shoulder" | "back" | "chest" | "shirt" | "tabard" | "wrist"
  | "hands" | "waist" | "legs" | "feet" | "main-hand" | "off-hand";

export const transmogSlots: TransmogSlot[] = ["head", "shoulder", "back", "chest", "shirt", "tabard", "wrist", "hands", "waist", "legs", "feet", "main-hand", "off-hand"];
/** Paper doll as in the game's character pane. */
export const dollLeft: TransmogSlot[] = ["head", "shoulder", "back", "chest", "shirt", "tabard", "wrist"];
export const dollRight: TransmogSlot[] = ["hands", "waist", "legs", "feet"];
export const dollWeapons: TransmogSlot[] = ["main-hand", "off-hand"];

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

/**
 * Where an icon is tried, in order: the 56 px file under its name, then
 * Blizzard's render of the item's (or set's first piece's) own icon — newer
 * icons are published only under their file id, which the media API names.
 */
export function iconUrls(iconName?: string, owner?: { itemId?: number; setId?: number }) {
  const urls = iconName ? [`https://wow.zamimg.com/images/wow/icons/large/${iconName}.jpg`] : [];
  if (owner?.itemId) urls.push(`/api/wow/transmog/icon?item=${owner.itemId}`);
  else if (owner?.setId) urls.push(`/api/wow/transmog/icon?set=${owner.setId}`);
  return urls;
}

/**
 * Playable races in the order of the game's race list: core races first, then
 * allied and later races. `raceId` is Battle.net's playable_race.id; the
 * viewer model comes from lib/wow/chrModels.ts. Dracthyr has one model.
 */
export const transmogRaces = [
  { id: "human", raceId: 1 }, { id: "dwarf", raceId: 3 }, { id: "night-elf", raceId: 4 }, { id: "gnome", raceId: 7 },
  { id: "draenei", raceId: 11 }, { id: "worgen", raceId: 22 }, { id: "void-elf", raceId: 29 }, { id: "lightforged-draenei", raceId: 30 },
  { id: "dark-iron-dwarf", raceId: 34 }, { id: "kul-tiran", raceId: 32 }, { id: "mechagnome", raceId: 37 },
  { id: "orc", raceId: 2 }, { id: "undead", raceId: 5 }, { id: "tauren", raceId: 6 }, { id: "troll", raceId: 8 },
  { id: "blood-elf", raceId: 10 }, { id: "goblin", raceId: 9 }, { id: "nightborne", raceId: 27 }, { id: "highmountain-tauren", raceId: 28 },
  { id: "maghar-orc", raceId: 36 }, { id: "zandalari-troll", raceId: 31 }, { id: "vulpera", raceId: 35 },
  { id: "pandaren", raceId: 24 }, { id: "dracthyr", raceId: 52 }, { id: "earthen", raceId: 84 }, { id: "haranir", raceId: 86 },
] as const;
export type TransmogRace = (typeof transmogRaces)[number]["id"];
export type TransmogGender = "m" | "f";

export const isTransmogRace = (value: string): value is TransmogRace => transmogRaces.some((entry) => entry.id === value);

/** Races with one body for both sexes: the body toggle is hidden for them. */
export function singleBody(race: TransmogRace) {
  const entry = transmogRaces.find((candidate) => candidate.id === race) ?? transmogRaces[0];
  return chrModelIdForRace(entry.raceId, false) === chrModelIdForRace(entry.raceId, true);
}

export function chrModelId(race: TransmogRace, gender: TransmogGender) {
  const entry = transmogRaces.find((candidate) => candidate.id === race) ?? transmogRaces[0];
  return chrModelIdForRace(entry.raceId, gender === "f") ?? 1;
}

export const classIds = [
  { id: 1, slug: "warrior" }, { id: 2, slug: "paladin" }, { id: 3, slug: "hunter" }, { id: 4, slug: "rogue" },
  { id: 5, slug: "priest" }, { id: 6, slug: "death-knight" }, { id: 7, slug: "shaman" }, { id: 8, slug: "mage" },
  { id: 9, slug: "warlock" }, { id: 10, slug: "monk" }, { id: 11, slug: "druid" }, { id: 12, slug: "demon-hunter" },
  { id: 13, slug: "evoker" },
] as const;
export type TransmogClass = (typeof classIds)[number]["slug"];
export const isTransmogClass = (value: string): value is TransmogClass => classIds.some((entry) => entry.slug === value);

/** Armor a class wears; it sets the default armor filter, the set filter and Randomize. */
export const classArmor: Record<TransmogClass, Exclude<ArmorType, "cosmetic">> = {
  warrior: "plate", paladin: "plate", "death-knight": "plate",
  hunter: "mail", shaman: "mail", evoker: "mail",
  rogue: "leather", monk: "leather", druid: "leather", "demon-hunter": "leather",
  priest: "cloth", mage: "cloth", warlock: "cloth",
};
export const classId = (slug: TransmogClass | "") => classIds.find((entry) => entry.slug === slug)?.id ?? 0;

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
  | { id: string; kind: "scene"; src: string; position: string; thumb: string };

/**
 * Backgrounds. Colors and gradients are export pixels, not interface colors,
 * so they live here as data. Scenes are the site's own paintings, served from
 * this origin so the export canvas stays clean; `thumb` is a 112 px swatch.
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
  { id: "vault", kind: "scene", src: "/assets/wow/raids/hub/vault.webp", position: "62% 50%", thumb: "/assets/wow/transmog/swatches/vault.webp" },
  { id: "sanctuary", kind: "scene", src: "/assets/wow/mythic/ruby-sanctuary/sanctuary.webp", position: "50% 50%", thumb: "/assets/wow/transmog/swatches/sanctuary.webp" },
  { id: "voidscar", kind: "scene", src: "/assets/wow/mythic/backgrounds/voidscar.webp", position: "55% 50%", thumb: "/assets/wow/transmog/swatches/voidscar.webp" },
  { id: "nalorakk", kind: "scene", src: "/assets/wow/mythic/backgrounds/nalorakk.webp", position: "50% 50%", thumb: "/assets/wow/transmog/swatches/nalorakk.webp" },
  { id: "kings", kind: "scene", src: "/assets/wow/mythic/backgrounds/kings.webp", position: "50% 50%", thumb: "/assets/wow/transmog/swatches/kings.webp" },
  { id: "blinding", kind: "scene", src: "/assets/wow/mythic/backgrounds/blinding.webp", position: "50% 50%", thumb: "/assets/wow/transmog/swatches/blinding.webp" },
  { id: "city", kind: "scene", src: "/assets/wow/loading/city-4k.webp", position: "50% 50%", thumb: "/assets/wow/transmog/swatches/city.webp" },
  { id: "archive", kind: "scene", src: "/assets/wow/loading/archive-4k.webp", position: "50% 50%", thumb: "/assets/wow/transmog/swatches/archive.webp" },
  { id: "tools", kind: "scene", src: "/assets/wow/loading/tools-4k.webp", position: "50% 50%", thumb: "/assets/wow/transmog/swatches/tools.webp" },
];
export const background = (id: string) => backgrounds.find((entry) => entry.id === id) ?? backgrounds[8];

/** Animations of the viewer's character model. */
export const poses = ["Stand", "Ready1H", "Ready2H", "EmoteSalute", "EmoteFlex", "EmoteRoar", "EmoteCheer", "EmoteKneel", "EmoteSitGround", "EmoteDance"] as const;
export type Pose = (typeof poses)[number];
