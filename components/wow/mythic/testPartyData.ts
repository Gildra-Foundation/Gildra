export type PartyRole = "tank" | "healer" | "dps";

export type PartyTalent = {
  name: string;
  detail: string;
  tree: "class" | "spec" | "hero";
};

export type PartyMember = {
  id: string;
  account: string;
  character: string;
  className: string;
  spec: string;
  role: PartyRole;
  itemLevel: number;
  rating: number;
  portrait: string;
  accent: string;
  buildCode: string;
  talents: PartyTalent[];
  abilities: string[];
};

export type PartyAssignment = {
  id: string;
  stopId: number;
  memberId: string;
  second: number;
  position: string;
  ability: string;
  instruction: string;
};

export const partyMembers: PartyMember[] = [
  {
    id: "vexis",
    account: "Vexis#1001",
    character: "ArcanistVexis",
    className: "Воин",
    spec: "Защита",
    role: "tank",
    itemLevel: 704,
    rating: 2864,
    portrait: "/assets/classes/warrior.jpg",
    accent: "#c79c6e",
    buildCode: "CkEAAAAAAAAAAAAAAAAAAAAAAAYEDAAAAAAAzMzMmZmxMmZWGGjZZmZGzYGDzMDAAAAMbAGYD",
    talents: [
      { name: "Champion's Bulwark", detail: "Щит и контроль паков", tree: "hero" },
      { name: "Spell Reflection", detail: "Отражение опасных кастов", tree: "class" },
      { name: "Disrupting Shout", detail: "АоЕ-сайленс на большой пулл", tree: "class" },
      { name: "Shield Charge", detail: "Вход в пак и оглушение", tree: "spec" },
      { name: "Demoralizing Shout", detail: "Плановый defensive", tree: "spec" },
      { name: "Ravager", detail: "Удерживает угрозу на аддах", tree: "spec" },
    ],
    abilities: ["Spell Reflection", "Shield Wall", "Disrupting Shout", "Shockwave", "Rallying Cry"],
  },
  {
    id: "mystic",
    account: "Tides#1002",
    character: "MysticHeals",
    className: "Шаман",
    spec: "Исцеление",
    role: "healer",
    itemLevel: 701,
    rating: 2798,
    portrait: "/assets/specs/resto-shaman.jpg",
    accent: "#0070de",
    buildCode: "CgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYmZmZmZmxMmxMzwMmZmFzMzMMLzYmxyMzMDA",
    talents: [
      { name: "Farseer", detail: "Предки усиливают цепное лечение", tree: "hero" },
      { name: "Poison Cleansing Totem", detail: "Снятие ядов со всей группы", tree: "class" },
      { name: "Wind Shear", detail: "Короткий ranged interrupt", tree: "class" },
      { name: "Spirit Link Totem", detail: "Главный групповой сейв", tree: "spec" },
      { name: "Ascendance", detail: "Бёрст-лечение в тяжёлую фазу", tree: "spec" },
      { name: "Cloudburst Totem", detail: "Подготовка лечения заранее", tree: "spec" },
    ],
    abilities: ["Spirit Link Totem", "Wind Shear", "Purify Spirit", "Ascendance", "Capacitor Totem"],
  },
  {
    id: "nova",
    account: "Nova#1003",
    character: "ShadowNova",
    className: "Маг",
    spec: "Тайная магия",
    role: "dps",
    itemLevel: 706,
    rating: 2912,
    portrait: "/assets/specs/arcane-mage.jpg",
    accent: "#69ccf0",
    buildCode: "C4DAAAAAAAAAAAAAAAAAAAAAAYGMbzCmxMmZmxMzMjZGAAAAAAwMzMzYYmZMzYmZMzMMzMzwA",
    talents: [
      { name: "Spellslinger", detail: "Осколки для приоритетной цели", tree: "hero" },
      { name: "Mass Barrier", detail: "Щит на всю группу", tree: "class" },
      { name: "Dragon's Breath", detail: "Стоп неуязвимых к кику кастов", tree: "class" },
      { name: "Arcane Surge", detail: "Главное окно урона", tree: "spec" },
      { name: "Touch of the Magi", detail: "Бёрст в приоритетную цель", tree: "spec" },
      { name: "Chrono Shift", detail: "Кайт и мобильность", tree: "spec" },
    ],
    abilities: ["Counterspell", "Mass Barrier", "Dragon's Breath", "Time Warp", "Greater Invisibility"],
  },
  {
    id: "grave",
    account: "Grave#1004",
    character: "Ironclad",
    className: "Рыцарь смерти",
    spec: "Лёд",
    role: "dps",
    itemLevel: 702,
    rating: 2751,
    portrait: "/assets/specs/frost-dk.jpg",
    accent: "#c41e3a",
    buildCode: "CsPAAAAAAAAAAAAAAAAAAAAAAMzMzYmxMmxMzMzMmZGDjZmxMAAAAAAAAAAAAwMDDzYmZmxA",
    talents: [
      { name: "Rider of the Apocalypse", detail: "Кавалерия во время бёрста", tree: "hero" },
      { name: "Blinding Sleet", detail: "Фронтальный массовый stop", tree: "class" },
      { name: "Anti-Magic Zone", detail: "Групповой magic defensive", tree: "class" },
      { name: "Frostwyrm's Fury", detail: "Урон и длинное оглушение", tree: "spec" },
      { name: "Breath of Sindragosa", detail: "Основное окно урона", tree: "spec" },
      { name: "Chill Streak", detail: "Урон по плотной группе", tree: "spec" },
    ],
    abilities: ["Mind Freeze", "Anti-Magic Zone", "Blinding Sleet", "Death Grip", "Icebound Fortitude"],
  },
  {
    id: "wind",
    account: "Wind#1005",
    character: "Windborne",
    className: "Охотник",
    spec: "Повелитель зверей",
    role: "dps",
    itemLevel: 700,
    rating: 2689,
    portrait: "/assets/specs/bm-hunter.jpg",
    accent: "#abd473",
    buildCode: "C0PAAAAAAAAAAAAAAAAAAAAAAYMbDMgBMbsFYmZmZmZmxMmZAAAAAAwMzMzgZGDzMzMzMzMLA",
    talents: [
      { name: "Pack Leader", detail: "Усиление питомцев и Kill Command", tree: "hero" },
      { name: "Binding Shot", detail: "Фиксация и массовый stun", tree: "class" },
      { name: "Intimidation", detail: "Точечное оглушение", tree: "class" },
      { name: "Bestial Wrath", detail: "Частое окно урона", tree: "spec" },
      { name: "Bloodshed", detail: "Приоритетная цель", tree: "spec" },
      { name: "Call of the Wild", detail: "Большой бёрст на босса", tree: "spec" },
    ],
    abilities: ["Counter Shot", "Binding Shot", "Intimidation", "Primal Rage", "Aspect of the Turtle"],
  },
];

export const positions = ["Перед боссом", "Мили слева", "Мили справа", "Дальний слева", "Дальний справа", "У края"];

type AssignmentSeed = [memberId: string, second: number, position: string, ability: string, instruction: string];

const stopInstructions: Record<number, AssignmentSeed[]> = {
  1: [["vexis", 0, "Перед боссом", "Spell Reflection", "Собери пак, не задень яйца"], ["nova", 3, "Дальний справа", "Counterspell", "Первый Ice Shield"], ["mystic", 9, "Дальний слева", "Purify Spirit", "Сними Cold Claws до 20 стаков"]],
  2: [["vexis", 0, "Перед боссом", "Shield Wall", "Защита на двойной Tectonic Strike"], ["grave", 5, "Мили слева", "Mind Freeze", "Кик Stone Missile"], ["mystic", 11, "Дальний слева", "Spirit Link Totem", "Закрой совпадение Imprint и Slam"]],
  3: [["nova", 2, "Дальний справа", "Time Warp", "Bloodlust после полного сбора"], ["vexis", 8, "Перед боссом", "Rallying Cry", "Сейв на Excavating Blast"], ["wind", 12, "У края", "Binding Shot", "Зафиксируй whelps"]],
  4: [["vexis", 4, "Перед боссом", "Shield Wall", "Большая защита на Steel Barrage"], ["mystic", 5, "Дальний слева", "Ascendance", "Пролечи канал и группу"], ["wind", 14, "У края", "Aspect of the Turtle", "Страховка, если Rush идёт в тебя"]],
  5: [["wind", 3, "Дальний справа", "Counter Shot", "Первый Frigid Shard"], ["nova", 18, "Дальний слева", "Mass Barrier", "Щиты перед Chillstorm"], ["grave", 42, "Мили слева", "Anti-Magic Zone", "Зона на Frost Overload"]],
  6: [["vexis", 0, "Перед боссом", "Rallying Cry", "Проверь готовность группы"], ["mystic", 5, "Дальний слева", "Purify Spirit", "Восстанови ману перед вылетом"]],
  7: [["nova", 2, "Дальний справа", "Counterspell", "Первый Fiery Blast"], ["wind", 7, "Дальний слева", "Counter Shot", "Кик Cinderbolt"], ["mystic", 18, "У края", "Spirit Link Totem", "Закрой Inferno"]],
  8: [["vexis", 4, "Перед боссом", "Shield Wall", "Прожим под Thunder Jaw"], ["mystic", 10, "Дальний слева", "Purify Spirit", "Сними только первый Rolling Thunder"], ["nova", 17, "Дальний справа", "Mass Barrier", "Щиты на Inferno"]],
  9: [["grave", 3, "Мили слева", "Blinding Sleet", "Останови Flaming Barrage"], ["vexis", 7, "Перед боссом", "Shield Wall", "Защита на Fire Maw"], ["mystic", 26, "Дальний слева", "Purify Spirit", "Сними Blaze of Glory"]],
  10: [["nova", 2, "Дальний справа", "Counterspell", "Первый Fiery Blast"], ["grave", 8, "Мили слева", "Blinding Sleet", "Стоп Flaming Barrage"], ["mystic", 18, "Дальний слева", "Purify Spirit", "Пурж Blaze of Glory"]],
  11: [["wind", 1, "Дальний справа", "Primal Rage", "Bloodlust на старте"], ["nova", 14, "Дальний слева", "Counterspell", "Первый Blaze Volley"], ["vexis", 23, "Перед боссом", "Shield Wall", "Mitigation на Searing Blows"], ["mystic", 35, "У края", "Spirit Link Totem", "Поставь на Inferno"]],
  12: [["nova", 3, "Дальний справа", "Counterspell", "Первый Flashfire"], ["wind", 8, "Дальний слева", "Intimidation", "Стоп Thunder Stomper"], ["grave", 12, "Мили слева", "Icebound Fortitude", "Выйди из Thunderclap"]],
  13: [["wind", 2, "Дальний справа", "Counter Shot", "Первый Thunderbolt"], ["mystic", 7, "Дальний слева", "Purify Spirit", "Пурж Tempest Barrier"], ["grave", 18, "Мили слева", "Anti-Magic Zone", "Зона на Lightning Storm"]],
  14: [["nova", 2, "Дальний справа", "Counterspell", "Первый Shock Blast"], ["wind", 9, "Дальний слева", "Counter Shot", "Второй Shock Blast"], ["mystic", 21, "У края", "Ascendance", "Хил Lightning Storm"], ["vexis", 24, "Перед боссом", "Rallying Cry", "Сейв группы на щит"]],
  15: [["vexis", 4, "Перед боссом", "Shield Wall", "Прожим под Stormslam"], ["mystic", 6, "Дальний слева", "Purify Spirit", "Сразу сними Stormslam"], ["nova", 16, "Дальний справа", "Mass Barrier", "Щиты на Winds of Change"], ["grave", 25, "Мили слева", "Anti-Magic Zone", "Зона на вторую фазу"], ["wind", 31, "У края", "Aspect of the Turtle", "Вынеси Inferno Spit к краю"]],
};

export const initialAssignments: PartyAssignment[] = Object.entries(stopInstructions).flatMap(([stopId, seeds]) =>
  seeds.map(([memberId, second, position, ability, instruction], index) => ({
    id: `default-${stopId}-${memberId}-${index}`,
    stopId: Number(stopId),
    memberId,
    second,
    position,
    ability,
    instruction,
  })),
);
