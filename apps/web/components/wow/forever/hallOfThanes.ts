import type { Lang } from "@/lib/i18n-paths";
type Text = Record<Lang, string>;
export type HallMechanic = { name: string; role: "tank" | "healer" | "dps" | "all"; response: Text };
export type HallEncounter = { id: string; name: string; area: string; floor: number; x: number; y: number; enemies: string[]; preparation: Text; mechanics: HallMechanic[] };
const text = (en: string, ru: string): Text => ({ en, ru });
export const hallEncounters: HallEncounter[] = [
  { id: "faldrim", name: "Faldrim Anvilmar", area: "Anvilmar’s Rest", floor: 1, x: 48.5, y: 75.5, enemies: ["Faldrim Anvilmar"],
    preparation: text("Clear space around the tomb before engaging the patrol.", "Расчистите место у гробницы перед пулом патрулирующего босса."),
    mechanics: [
      { name: "Mind Blast", role: "dps", response: text("Interrupt the cast.", "Прерывайте каст.") },
      { name: "Anvilmar’s Curse", role: "tank", response: text("Slows attacks and casting; watch threat.", "Замедляет атаки и заклинания; следите за угрозой.") },
    ] },
  { id: "magmatus", name: "Magmatus", area: "Dark Iron Ingress", floor: 2, x: 77, y: 57, enemies: ["Magmatus", "Dark Iron Summoner"],
    preparation: text("Kill the patrolling Summoner before engaging.", "Убейте патрульного Summoner до начала боя."),
    mechanics: [
      { name: "Dark Iron Summoner", role: "dps", response: text("Focus the accompanying caster first.", "Первым убейте сопровождающего заклинателя.") },
      { name: "Fire Nova", role: "tank", response: text("Keep the elemental away from the party.", "Держите элементаля в стороне от группы.") },
      { name: "Combust", role: "healer", response: text("Heal the affected player through the fire damage.", "Поддерживайте здоровье игрока с огненным эффектом.") },
    ] },
  { id: "plunder", name: "Plunder", area: "Pillared hall", floor: 2, x: 20, y: 69, enemies: ["Plunder"],
    preparation: text("Pull the patrol into cleared space.", "Выведите патруль на расчищенное место."),
    mechanics: [{ name: "Knock Away", role: "all", response: text("Keep a wall behind you; avoid being knocked into enemies.", "Встаньте спиной к стене, чтобы отбрасывание не привело к новым врагам.") }] },
  { id: "durgen", name: "Durgen Dirgehammer", area: "Reliquary of Kings", floor: 1, x: 48.5, y: 37, enemies: ["Durgen Dirgehammer", "2 × Lesser Stone Golem"],
    preparation: text("Clear the room’s edges before pulling.", "Зачистите края комнаты перед пулом."),
    mechanics: [
      { name: "Fear", role: "all", response: text("Fight away from uncleared enemies.", "Деритесь вдали от оставшихся врагов."), },
      { name: "Rend", role: "healer", response: text("Prepare healing for the tank’s bleed and melee damage.", "Готовьте лечение танка под кровотечением и ударами."), },
    ] },
];
export const hallTrash = [
  { name: "Dark Iron Engineer", ability: "Bomb", response: text("Move away from the spot targeted as the cast starts.", "Уходите с места, выбранного в начале каста бомбы.") },
  { name: "Dark Iron Looter", ability: "Poisoned blades", response: text("Watch the tank’s health under poison and melee damage.", "Следите за здоровьем танка под ядом и ударами.") },
  { name: "Dark Iron Summoner", ability: "Fireball · Summon Fiery Assistant", response: text("Interrupt or stun. Use cover to bring the caster closer.", "Прерывайте или оглушайте. Заведите заклинателя за угол.") },
  { name: "Lesser Stone Golem", ability: "Melee", response: text("Hits quickly and moves fast; avoid combining packs.", "Быстро бьёт и передвигается; не объединяйте паки.") },
];
/*
 * Facts checked against (not shown on the page): method.gg/wow-forever/dungeons/hall-of-thanes,
 * icy-veins.com/wow-forever/hall-of-thanes-guide, foreverdb.net/dungeon/3065-the-hall-of-thanes,
 * forg.gg/en/forever/dungeons/hall-of-thanes. Details: docs/forever/HALL-OF-THANES.md.
 */
