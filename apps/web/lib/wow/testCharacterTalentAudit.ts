export type TalentScenarioId = "solo-pve" | "pve-aoe" | "mythic-plus" | "raid" | "solo-pvp" | "battleground" | "arena-2v2" | "arena-3v3";

export type TalentScenario = {
  id: TalentScenarioId;
  group: "PvE" | "PvP";
  shortLabel: string;
  label: string;
  goal: string;
  fight: string;
  priority: string;
  multiplier: number;
};

export const talentScenarios: TalentScenario[] = [
  { id: "solo-pve", group: "PvE", shortLabel: "Соло", label: "Соло PvE", goal: "быстро убивать обычных противников и не останавливаться на восстановление", fight: "1–3 цели · короткие бои · без лекаря", priority: "самолечение → быстрый урон → мобильность", multiplier: .72 },
  { id: "pve-aoe", group: "PvE", shortLabel: "AoE", label: "AoE PvE", goal: "наносить максимум урона большой группе целей", fight: "5+ целей · плотные волны · частые кулдауны", priority: "массовый урон → ресурс → сокращение кулдаунов", multiplier: 1.28 },
  { id: "mythic-plus", group: "PvE", shortLabel: "Мифик+", label: "Мифик+", goal: "стабильно проходить паки и сохранять сильные кнопки к опасным моментам", fight: "3–8 целей · движение · прерывания и контроль", priority: "стабильный AoE → контроль → выживаемость", multiplier: 1.18 },
  { id: "raid", group: "PvE", shortLabel: "Рейд", label: "Рейд", goal: "выдать максимум в босса и не потерять урон на механиках", fight: "1 цель · 4–7 минут · окна бурста", priority: "урон в одну цель → бурст → мобильность", multiplier: 1.08 },
  { id: "solo-pvp", group: "PvP", shortLabel: "Соло", label: "Соло PvP", goal: "пережить первый натиск и самому создать момент для убийства", fight: "непредсказуемый соперник · без постоянной поддержки", priority: "контроль → защита → короткий бурст", multiplier: .86 },
  { id: "battleground", group: "PvP", shortLabel: "БГ", label: "Поле боя", goal: "быть полезным в массовой драке и при игре на объект", fight: "много целей · частая смена дистанции · долгие стычки", priority: "массовое давление → мобильность → контроль", multiplier: 1.12 },
  { id: "arena-2v2", group: "PvP", shortLabel: "2v2", label: "Арена 2 на 2", goal: "не проиграть по ресурсам и собрать надёжную цепочку контроля", fight: "2 против 2 · мало целей · высокая цена ошибки", priority: "выживаемость → контроль → стабильный урон", multiplier: .94 },
  { id: "arena-3v3", group: "PvP", shortLabel: "3v3", label: "Арена 3 на 3", goal: "синхронизировать бурст с командой и пережить ответные кулдауны", fight: "3 против 3 · быстрые свитчи · командные окна", priority: "командный бурст → контроль → защитные ответы", multiplier: 1.02 },
];
