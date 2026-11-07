export type ForeverDungeon = { name: string; min: number; max: number; location: string };
/** Blizzard's announced level bands, not entrance-level requirements. */
export const newDungeons: readonly ForeverDungeon[] = [
  { name: "Hall of Thanes", min: 13, max: 18, location: "Ironforge · Dun Morogh" },
  { name: "Ruins of Lordaeron", min: 15, max: 20, location: "Tirisfal Glades" },
  { name: "Excavation Site", min: 24, max: 29, location: "Wetlands" },
  { name: "City of Dalaran", min: 28, max: 33, location: "Alterac Mountains" },
  { name: "The Drowned City", min: 35, max: 40, location: "Stranglethorn Vale" },
  { name: "Krol’dok Stronghold", min: 40, max: 45, location: "Riverglades" },
  { name: "Alcaz Prison", min: 48, max: 53, location: "Dustwallow Marsh" },
  { name: "Blackmaw Hold", min: 55, max: 60, location: "Azshara" },
  { name: "Shaper’s Terrace", min: 58, max: 60, location: "Un’Goro Crater" },
];
/** Method's recommended ranges for the returning instances; wings stay grouped. */
export const returningDungeons = [
  ["Ragefire Chasm", "13–18"], ["The Deadmines", "17–20"],
  ["Wailing Caverns", "18–24"], ["Shadowfang Keep", "21–26"],
  ["Blackfathom Deeps", "23–28"], ["The Stockade", "25–29"],
  ["Gnomeregan", "29–34"], ["Razorfen Kraul", "30–38"],
  ["Scarlet Monastery", "30–46"], ["Uldaman", "37–45"],
  ["Razorfen Downs", "37–45"], ["Zul’Farrak", "40–47"],
  ["Maraudon", "45–51"], ["Sunken Temple", "50–55"],
  ["Blackrock Depths", "52–60"], ["Blackrock Spire", "57–60"],
  ["Dire Maul", "58–60"], ["Stratholme", "58–60"], ["Scholomance", "58–60"],
] as const;
export const foreverRaids = [
  { id: "barrow-deeps", name: "The Barrow Deeps", players: 10, bosses: 8,
    location: "Mount Hyjal · Winterspring · Blackmaw Hold",
    text: { en: "Explore the underground prison that once held Illidan.", ru: "Исследуйте подземную тюрьму, некогда удерживавшую Иллидана." } },
  { id: "hyjal-summit", name: "Hyjal Summit", players: 20, bosses: 13,
    location: "Mount Hyjal · Nordrassil",
    text: { en: "Choose your path through the ruins surrounding the World Tree.", ru: "Выберите путь через руины у Мирового древа." } },
  { id: "onyxias-lair", name: "Onyxia’s Lair", players: 40, bosses: 1,
    location: "Dustwallow Marsh",
    text: { en: "Carry the Drakefire Amulet to enter. Prepare fire resistance.", ru: "Для входа нужен амулет Пламени дракона в сумке. Подготовьте сопротивление огню." } },
] as const;
/*
 * Facts checked against (not shown on the page):
 *  https://news.blizzard.com/en-us/article/24303009/world-of-warcraft-forever-raid-overviewlocations-raid-sizes-and-attunement
 *  https://news.blizzard.com/en-us/article/24301455/explore-the-new-dungeons-of-world-of-warcraft-forever
 *  https://www.method.gg/wow-forever/wow-forever-dungeon-xp-explained-and-all-dungeons-by-level
 */
