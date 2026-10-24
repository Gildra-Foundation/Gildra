import type { Lang } from "@/lib/i18n-paths";
import { sourceNames } from "./sourceNames";
import { sourceNpcNames } from "./sourceNpcNames";
import { sourceSpellNames } from "./sourceSpellNames";

// These are shortened labels in the existing route notes, not new game names.
// They resolve to the same NPC identities already carried by combat intel.
const npcAliases: Record<string, number> = {
  Chillweaver: 188067, Earthshaper: 187969, Guardian: 188011, Juggernaut: 188244,
  Destroyer: 190034, Cinderweaver: 190207, Scorchlings: 190205, Flamelasher: 190206,
  Thundercloud: 197509, Channeler: 198047, Firestorm: 189886,
  "Storm Warrior pack": 197982, Belcher: 254850, Voidscythe: 263228, Hexer: 134174, Viper: 135562, Disruptor: 269227,
  "Мелидрусса Хладообраз": 188252, "Кокия Огненное Копыто": 189232,
};
const aliases: Record<string, string> = {
  "Primal Serpents": sourceNames["Primal Serpent"], Harrowers: sourceNames["Twinfang Harrower"],
  "Ravenous Descendants": sourceNames["Ravenous Descendant"], "High Evolutionists": sourceNames["High Evolutionist"],
  Evolutionists: sourceNames["High Evolutionist"], Writhe: sourceNames["Uncoiled Writhe"],
  Rush: sourceNames["Blazing Rush"], Imprint: sourceNames["Earthbound's Imprint"], Barrier: sourceNames["Stormcloud Barrier"],
  Cloudburst: sourceNames["Interrupting Cloudburst"], "Knot of Snakes": sourceNames["A Knot of Snakes"], Conduction: sourceNames["Imbued Conduction"],
  Xathuux: sourceNames["Xathuux the Annihilator"],
  Draghar: sourceNames["Defier Draghar"], Ryvati: sourceNames["High Channeler Ryvati"],
  "Mirror Images": "зеркальные образы",
  "Lightblossom Trinity": `${sourceNpcNames[243028].ru}, ${sourceNpcNames[243030].ru} и ${sourceNpcNames[243029].ru}`,
  Lightblossom: "цветок",
  // No confirmed Russian name for this spell: the prose describes the mechanic instead of showing an ID.
  "цель Bloodthirsty Gaze": "игрок под взглядом босса",
  "Radiant Drake": "дракон для перелёта", Hailbomb: "отмеченные эффекты", Summon: "призыва",
  "Киракка и Эркхарт": `${sourceNpcNames[190484].ru} и ${sourceNpcNames[190485].ru}`,
};
// Names without a confirmed Russian translation stay in their original English form.
for (const [alias, id] of Object.entries(npcAliases)) { const ru = sourceNpcNames[id].ru; if (ru) aliases[alias] = ru; }
for (const [name, id] of Object.entries({ "Fiery Blast": 1305955, Burnout: 373614, "Blaze of Glory": 373972, Flashfire: 392451 })) { const ru = sourceSpellNames[id].ru; if (ru) aliases[name] = ru; }
const names = new Map(Object.entries({ ...sourceNames, ...aliases }));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = new RegExp(`(?<![A-Za-z])(?:${[...names.keys()].sort((a, b) => b.length - a.length).map(escape).join("|")})(?![A-Za-z])`, "g");

/** Display-only route prose: keep English keys, IDs, saved routes and calculations intact. */
export function wowRouteText(value: string, lang: Lang, quoteNames = false) {
  if (lang === "en") return value === "Adderis и Aspix" ? "Adderis and Aspix" : value;
  return value.replace(/[‘’]/g, "'").replace(pattern, (name, offset: number, original: string) => {
    const translated = names.get(name) ?? name;
    // Quoted spell/NPC names retain their exact source form inside Russian prose.
    return quoteNames && /^[А-ЯЁ]/.test(translated) && !/[«“"]/.test(original[offset - 1] ?? "")
      ? `«${translated}»` : translated;
  });
}
