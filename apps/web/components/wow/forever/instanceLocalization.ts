import type { Lang } from "@/lib/i18n-paths";
/** Only verified client/source names belong here. English remains the canonical key. */
// Map/client names: apps/web/data/wow/map/maps.json (IDs listed in UX research).
// Alterac: map/eras.json; Sunken Temple: Blizzard ru-ru/news/23739169.
const names: Record<string, string> = {
  "Wailing Caverns": "Пещеры Стенаний",
  "Uldaman": "Ульдаман",
  "Tirisfal Glades": "Тирисфальские леса",
  "Dun Morogh": "Дун Морог",
  "The Deadmines": "Мертвые копи",
  "Wetlands": "Болотина",
  "Maraudon": "Мародон",
  "Dustwallow Marsh": "Пылевые топи",
  "Azshara": "Азшара",
  "Un’Goro Crater": "Кратер Ун'Горо",
  "Ironforge": "Стальгорн",
  "Ragefire Chasm": "Огненная Пропасть",
  "Zul’Farrak": "Зул'Фаррак",
  "Blackfathom Deeps": "Непроглядная Пучина",
  "Stranglethorn Vale": "Тернистая долина",
  "The Stockade": "Тюрьма",
  "Gnomeregan": "Гномреган",
  "Dire Maul": "Забытый город",
  "Blackrock Depths": "Глубины Черной горы",
  "Blackrock Spire": "Пик Черной горы",
  "Razorfen Downs": "Курганы Иглошкурых",
  "Razorfen Kraul": "Лабиринты Иглошкурых",
  "Scarlet Monastery": "Монастырь Алого ордена",
  "Shadowfang Keep": "Крепость Темного Клыка",
  "Stratholme": "Стратхольм",
  "Scholomance": "Некроситет",
  "Sunken Temple": "Затонувший храм",
  "Alterac Mountains": "Альтеракские горы"
};
export function instanceName(name: string, lang: Lang) { return lang === "ru" ? name.split(" · ").map(part => names[part.replace(/['‘]/g, "’")] ?? part).join(" · ") : name; }
