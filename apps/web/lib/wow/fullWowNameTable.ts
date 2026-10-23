import { sourceNames } from "./sourceNames";
import { sourceNpcNames } from "./sourceNpcNames";
import { sourceSpellNames } from "./sourceSpellNames";
import { sourceNameMap, type WowNameTable } from "./wowNameTable";

// Every confirmed name (~100 KB). Server code reads it directly; client pages
// get a slice from pickWowNameTable.ts instead of importing this module.

// These are shortened labels in the existing route notes, not new game names.
// They resolve to the same NPC identities already carried by combat intel.
const npcAliases: Record<string, number> = {
  Chillweaver: 188067, Earthshaper: 187969, Guardian: 188011, Juggernaut: 188244,
  Destroyer: 190034, Cinderweaver: 190207, Scorchlings: 190205, Flamelasher: 190206,
  Thundercloud: 197509, Channeler: 198047, Firestorm: 189886,
  "Storm Warrior pack": 197982, Belcher: 254850, Voidscythe: 263228, Hexer: 134174, Viper: 135562, Disruptor: 269227,
  "Мелидрусса Хладообраз": 188252, "Кокия Огненное Копыто": 189232,
};
const routeAliases: Record<string, string> = {
  "Primal Serpents": sourceNames["Primal Serpent"], Harrowers: sourceNames["Twinfang Harrower"],
  "Ravenous Descendants": sourceNames["Ravenous Descendant"], "High Evolutionists": sourceNames["High Evolutionist"],
  Evolutionists: sourceNames["High Evolutionist"], Writhe: sourceNames["Uncoiled Writhe"],
  Rush: sourceNames["Blazing Rush"], Imprint: sourceNames["Earthbound's Imprint"], Barrier: sourceNames["Stormcloud Barrier"],
  Cloudburst: sourceNames["Interrupting Cloudburst"], "Knot of Snakes": sourceNames["A Knot of Snakes"], Conduction: sourceNames["Imbued Conduction"],
  Xathuux: sourceNames["Xathuux the Annihilator"],
  "Mirror Images": "зеркальные образы",
  "Lightblossom Trinity": `${sourceNpcNames[243028].ru}, ${sourceNpcNames[243030].ru} и ${sourceNpcNames[243029].ru}`,
  Lightblossom: "цветок",
  // No confirmed Russian name for this spell: the prose describes the mechanic instead of showing an ID.
  "цель Bloodthirsty Gaze": "игрок под взглядом босса",
  "Radiant Drake": "дракон для перелёта", Hailbomb: "отмеченные эффекты", Summon: "призыва",
  "Киракка и Эркхарт": `${sourceNpcNames[190484].ru} и ${sourceNpcNames[190485].ru}`,
};
// Names without a confirmed Russian translation stay in their original English form.
for (const [alias, id] of Object.entries(npcAliases)) { const ru = sourceNpcNames[id].ru; if (ru) routeAliases[alias] = ru; }
for (const [name, id] of Object.entries({ "Fiery Blast": 1305955, Burnout: 373614, "Blaze of Glory": 373972, Flashfire: 392451 })) { const ru = sourceSpellNames[id].ru; if (ru) routeAliases[name] = ru; }

export const fullWowNameTable: WowNameTable = {
  source: sourceNameMap(sourceNames),
  route: { ...sourceNames, ...routeAliases },
  npc: sourceNpcNames,
  spell: sourceSpellNames,
};
