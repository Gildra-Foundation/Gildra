export type AuditGearItem = {
  itemId?: number;
  slotType?: string;
  /** Locale-independent modification identity from Blizzard. */
  modificationIds?: { enchantments: number[]; gems: number[] };
  slot: string;
  name: string;
  itemLevel: number;
  iconUrl: string;
  state: "optimal" | "good" | "issue" | "missing";
  href?: string;
  details: AuditGearDetails;
};

export type AuditGearQuality = "Низкое качество" | "Обычный" | "Необычный" | "Редкий" | "Эпический" | "Легендарный" | "Артефакт" | "Наследуемый" | "Неизвестное качество";

export type AuditGearDetails = {
  quality: AuditGearQuality;
  binding: string;
  category: string;
  armor?: string;
  weapon?: { damage: string; speed: string; dps: string };
  primary?: string;
  stamina?: string;
  secondaries: Array<{ label: string; value: string }>;
  enchant?: { name: string; effect: string; active: boolean };
  sockets?: Array<{ color: "red" | "blue" | "yellow" | "prismatic"; gem: string; effect: string; filled: boolean }>;
  durability?: string;
  set?: { name: string; equipped: number; total: number; bonuses: Array<{ pieces: number; text: string; active: boolean }> };
  source: string;
  sellPrice?: string;
  audit: { impact: string; nextStep: string };
};

export type CharacterAppearanceProfile = {
  presetId: string;
  version: number;
  race: string;
  modelId: number;
  modelItems: Array<[slot: number, displayId: number]>;
  customizations?: Array<{ optionId: number; choiceId: number }>;
  bodyType: "masculine" | "feminine";
  skinTone: string;
  eyeGlow: string;
  hairStyle: "war-braid";
  armor: {
    setName: string;
    primary: string;
    secondary: string;
    accent: string;
    glow: string;
  };
  weapons: {
    mainHand: { itemName: string; preset: "maw-cleaver" };
    offHand: { itemName: string; preset: "orc-splitter" };
  };
};

export type CharacterSpecialization = {
  slug: string;
  classKey: string;
  className: string;
  specName: string;
  role: "tank" | "healer" | "melee" | "ranged" | "support";
  roleLabel: string;
  primaryStatLabel: "Сила" | "Ловкость" | "Интеллект" | "Strength" | "Agility" | "Intellect";
  accent: string;
  resourceLabel: string;
  fantasy: string;
  iconUrl: string;
};

export type CharacterAuditScores = {
  overall: number;
  talents: number;
  gear: number;
  enchants: number;
  gems: number;
};

export type CharacterAuditSnapshot = {
  slug: string;
  character: { name: string; className: string; race: string; level: number; faction: string; itemLevel: number; mythicRating: number };
  specialization: CharacterSpecialization;
  /** Demo-only heuristic scores. Real Battle.net snapshots omit them until a
   * versioned simulation/benchmark can provide a defensible assessment. */
  scores?: CharacterAuditScores;
  appearance: CharacterAppearanceProfile;
  activeTalentLoadout?: string;
  activeHeroTalentTreeId?: number;
  combatStats?: {
    primary: number;
    crit: number;
    haste: number;
    mastery: number;
    versatility: number;
  };
  gear: AuditGearItem[];
  source: "fixture" | "catalog" | "battle-net";
  updatedAt: string;
};

const icon = (name: string) => `https://wow.zamimg.com/images/wow/icons/large/${name}.jpg`;

const slotProfiles: Record<string, Omit<AuditGearDetails, "audit">> = {
  "Голова": { quality: "Эпический", binding: "Становится персональным при получении", category: "Голова · Латы", armor: "1 946 брони", primary: "+1 284 силы", stamina: "+3 912 выносливости", secondaries: [{ label: "Критический удар", value: "+622" }, { label: "Искусность", value: "+514" }], enchant: { name: "Начертание жгучей мощи", effect: "+177 к силе", active: true }, sockets: [{ color: "prismatic", gem: "Идеальный рубин", effect: "+147 к силе", filled: true }], durability: "100 / 100", set: { name: "Латы неукротимой ярости", equipped: 4, total: 5, bonuses: [{ pieces: 2, text: "Урон Буйства увеличен на 8%", active: true }, { pieces: 4, text: "Кровожадность продлевает Безрассудство", active: true }] }, source: "Великий тайник · Эпох+", sellPrice: "86 42 17" },
  "Шея": { quality: "Эпический", binding: "Персональный", category: "Шея", primary: "+2 114 выносливости", secondaries: [{ label: "Критический удар", value: "+731" }, { label: "Скорость", value: "+405" }], enchant: { name: "Слово крылатой благодати", effect: "+215 к искусности", active: true }, sockets: [{ color: "prismatic", gem: "Огранённый изумруд", effect: "+147 к скорости", filled: true }, { color: "prismatic", gem: "Огранённый рубин", effect: "+147 к силе", filled: true }], source: "Кузня Душ · Героический", sellPrice: "54 18 03" },
  "Плечи": { quality: "Эпический", binding: "Становится персональным при получении", category: "Плечи · Латы", armor: "1 768 брони", primary: "+1 032 силы", stamina: "+3 144 выносливости", secondaries: [{ label: "Критический удар", value: "+488" }, { label: "Искусность", value: "+462" }], durability: "100 / 100", set: { name: "Латы неукротимой ярости", equipped: 4, total: 5, bonuses: [{ pieces: 2, text: "Урон Буйства увеличен на 8%", active: true }, { pieces: 4, text: "Кровожадность продлевает Безрассудство", active: true }] }, source: "Рейд · Совет кузни", sellPrice: "72 06 51" },
  "Спина": { quality: "Эпический", binding: "Персональный", category: "Спина · Плащ", armor: "486 брони", primary: "+748 силы", stamina: "+2 286 выносливости", secondaries: [{ label: "Скорость", value: "+397" }, { label: "Универсальность", value: "+322" }], enchant: { name: "Песнь скорости", effect: "+170 к скорости", active: true }, durability: "100 / 100", source: "Пепельный рубеж · Эпох+", sellPrice: "41 33 92" },
  "Нагрудник": { quality: "Эпический", binding: "Становится персональным при получении", category: "Грудь · Латы", armor: "2 744 брони", primary: "+1 724 силы", stamina: "+5 266 выносливости", secondaries: [{ label: "Критический удар", value: "+676" }, { label: "Искусность", value: "+588" }], enchant: { name: "Чары отсутствуют", effect: "Можно получить +177 к основной характеристике", active: false }, durability: "165 / 165", set: { name: "Латы неукротимой ярости", equipped: 4, total: 5, bonuses: [{ pieces: 2, text: "Урон Буйства увеличен на 8%", active: true }, { pieces: 4, text: "Кровожадность продлевает Безрассудство", active: true }] }, source: "Рейд · Кузнец Бездны", sellPrice: "104 72 26" },
  "Наручи": { quality: "Эпический", binding: "Персональный", category: "Запястья · Латы", armor: "972 брони", primary: "+642 силы", stamina: "+1 958 выносливости", secondaries: [{ label: "Скорость", value: "+346" }, { label: "Критический удар", value: "+298" }], enchant: { name: "Броня рыцаря", effect: "+120 к силе", active: true }, durability: "55 / 55", source: "Осада Нок'гарда · Эпох+", sellPrice: "38 09 44" },
  "Руки": { quality: "Эпический", binding: "Становится персональным при получении", category: "Кисти рук · Латы", armor: "1 486 брони", primary: "+984 силы", stamina: "+3 006 выносливости", secondaries: [{ label: "Искусность", value: "+476" }, { label: "Критический удар", value: "+421" }], enchant: { name: "Знак кузни", effect: "+135 к силе", active: true }, durability: "55 / 55", set: { name: "Латы неукротимой ярости", equipped: 4, total: 5, bonuses: [{ pieces: 2, text: "Урон Буйства увеличен на 8%", active: true }, { pieces: 4, text: "Кровожадность продлевает Безрассудство", active: true }] }, source: "Рейд · Пепельный исполин", sellPrice: "68 20 31" },
  "Пояс": { quality: "Эпический", binding: "Персональный", category: "Пояс · Латы", armor: "1 322 брони", primary: "+886 силы", stamina: "+2 704 выносливости", secondaries: [{ label: "Скорость", value: "+448" }, { label: "Искусность", value: "+361" }], sockets: [{ color: "prismatic", gem: "Рубин неистовства", effect: "+147 к силе", filled: true }], durability: "55 / 55", source: "Великий тайник · Эпох+", sellPrice: "63 12 09" },
  "Ноги": { quality: "Эпический", binding: "Становится персональным при получении", category: "Ноги · Латы", armor: "2 438 брони", primary: "+1 476 силы", stamina: "+4 508 выносливости", secondaries: [{ label: "Критический удар", value: "+617" }, { label: "Искусность", value: "+558" }], enchant: { name: "Усиленная накладка", effect: "+190 к силе и +120 к выносливости", active: true }, durability: "120 / 120", set: { name: "Латы неукротимой ярости", equipped: 4, total: 5, bonuses: [{ pieces: 2, text: "Урон Буйства увеличен на 8%", active: true }, { pieces: 4, text: "Кровожадность продлевает Безрассудство", active: true }] }, source: "Рейд · Хранитель бастиона", sellPrice: "97 44 70" },
  "Ступни": { quality: "Эпический", binding: "Персональный", category: "Ступни · Латы", armor: "1 624 брони", primary: "+1 018 силы", stamina: "+3 108 выносливости", secondaries: [{ label: "Скорость", value: "+491" }, { label: "Универсальность", value: "+408" }], enchant: { name: "Поступь налётчика", effect: "+145 к скорости передвижения", active: true }, durability: "80 / 80", source: "Цитадель Саронита · Эпох+", sellPrice: "71 82 56" },
  "Аксессуар 1": { quality: "Эпический", binding: "Персональный", category: "Аксессуар", primary: "+1 024 силы", secondaries: [{ label: "Срабатывание", value: "+2 840 крит. удара" }, { label: "Время действия", value: "15 сек." }], source: "Огненные глубины · Рейд", sellPrice: "58 00 00" },
  "Аксессуар 2": { quality: "Эпический", binding: "Персональный", category: "Аксессуар", primary: "+3 406 выносливости", secondaries: [{ label: "Использование", value: "+2 260 силы" }, { label: "Восстановление", value: "2 мин." }], source: "Великий тайник · Эпох+", sellPrice: "58 00 00" },
  "Кольцо 1": { quality: "Эпический", binding: "Персональный", category: "Палец", stamina: "+2 304 выносливости", secondaries: [{ label: "Критический удар", value: "+604" }, { label: "Скорость", value: "+532" }], enchant: { name: "Сияние критического удара", effect: "+190 к критическому удару", active: true }, sockets: [{ color: "prismatic", gem: "Пустое гнездо", effect: "Рекомендуется: +147 к силе", filled: false }], source: "Арена Алого Круга", sellPrice: "52 14 80" },
  "Кольцо 2": { quality: "Эпический", binding: "Персональный", category: "Палец", stamina: "+2 188 выносливости", secondaries: [{ label: "Искусность", value: "+597" }, { label: "Критический удар", value: "+486" }], enchant: { name: "Сияние искусности", effect: "+190 к искусности", active: true }, sockets: [{ color: "prismatic", gem: "Рубин неистовства", effect: "+147 к силе", filled: true }], source: "Поля вечной войны", sellPrice: "52 14 80" },
  "Основная рука": { quality: "Легендарный", binding: "Персональный", category: "Двуручное · Секира", weapon: { damage: "14 982–24 970 урона", speed: "3,60", dps: "5 549,0" }, primary: "+2 146 силы", stamina: "+6 558 выносливости", secondaries: [{ label: "Критический удар", value: "+812" }, { label: "Искусность", value: "+744" }], enchant: { name: "Руна расколотой пасти", effect: "Иногда наносит 18 420 ед. огненного урона", active: true }, durability: "120 / 120", source: "Пасть Проклятых · Эпохальный рейд", sellPrice: "148 88 30" },
  "Левая рука": { quality: "Эпический", binding: "Персональный", category: "Двуручное · Секира", weapon: { damage: "14 126–23 544 урона", speed: "3,60", dps: "5 230,6" }, primary: "+2 034 силы", stamina: "+6 214 выносливости", secondaries: [{ label: "Скорость", value: "+786" }, { label: "Критический удар", value: "+691" }], enchant: { name: "Клеймо боевой песни", effect: "+340 к силе при срабатывании", active: true }, durability: "120 / 120", source: "Кузня Оргриммара · Великий тайник", sellPrice: "136 04 22" },
};

const auditDetails = (item: Pick<AuditGearItem, "slot" | "state">): AuditGearDetails["audit"] => ({
  impact: item.state === "issue" ? "Потенциальная потеря: 1,5–2,3% DPS" : item.state === "missing" ? "Потенциальная потеря: 1,1% DPS" : item.state === "optimal" ? "Слот соответствует целевому профилю" : "Слот пригоден для текущего контента",
  nextStep: item.state === "issue" ? "Исправить в плане действий" : item.state === "missing" ? "Установить рекомендуемый самоцвет" : item.state === "optimal" ? "Замена не требуется" : "Следующая цель — предмет 515+ уровня",
});

const fixtureSlots: Record<string, { itemId: number; slotType: string }> = {
  "Голова": { itemId: 900001, slotType: "HEAD" }, "Шея": { itemId: 900002, slotType: "NECK" },
  "Плечи": { itemId: 900003, slotType: "SHOULDER" }, "Спина": { itemId: 900004, slotType: "BACK" },
  "Нагрудник": { itemId: 900005, slotType: "CHEST" }, "Наручи": { itemId: 900006, slotType: "WRIST" },
  "Руки": { itemId: 900007, slotType: "HANDS" }, "Пояс": { itemId: 900008, slotType: "WAIST" },
  "Ноги": { itemId: 900009, slotType: "LEGS" }, "Ступни": { itemId: 900010, slotType: "FEET" },
  "Основная рука": { itemId: 900011, slotType: "MAIN_HAND" }, "Левая рука": { itemId: 900012, slotType: "OFF_HAND" },
  "Аксессуар 1": { itemId: 900013, slotType: "TRINKET_1" }, "Аксессуар 2": { itemId: 900014, slotType: "TRINKET_2" },
  "Кольцо 1": { itemId: 900015, slotType: "FINGER_1" }, "Кольцо 2": { itemId: 900016, slotType: "FINGER_2" },
};

const withDetails = (item: Omit<AuditGearItem, "details">): AuditGearItem => ({
  ...fixtureSlots[item.slot], ...item,
  details: { ...slotProfiles[item.slot], audit: auditDetails(item) },
});

// This is a deliberate, named test character. It keeps the audit usable until
// an Armory character import exists, instead of masquerading blank slots as data.
export const furybarFixture: CharacterAuditSnapshot = {
  slug: "furybar",
  character: { name: "Фьюрибар", className: "Воин неистовства", race: "Орк", level: 80, faction: "Орда", itemLevel: 509, mythicRating: 2486 },
  specialization: {
    slug: "fury-warrior",
    classKey: "warrior",
    className: "Воин",
    specName: "Неистовство",
    role: "melee",
    roleLabel: "Ближний бой",
    primaryStatLabel: "Сила",
    accent: "#e54827",
    resourceLabel: "Ярость",
    fantasy: "Два клинка, кровь и неуправляемая ярость",
    iconUrl: "/assets/specs/fury-warrior.jpg",
  },
  scores: { overall: 87, talents: 92, gear: 84, enchants: 76, gems: 88 },
  appearance: {
    presetId: "furybar-prototype-v1",
    version: 1,
    race: "orc",
    modelId: 3,
    modelItems: [[1, 97965], [3, 61533], [5, 61525], [6, 61583], [7, 61584], [8, 61585], [10, 61586], [21, 701532], [22, 701532]],
    bodyType: "masculine",
    skinTone: "#647f31",
    eyeGlow: "#efb33b",
    hairStyle: "war-braid",
    armor: {
      setName: "Латы неукротимой ярости",
      primary: "#2b2927",
      secondary: "#6f1f14",
      accent: "#bd7d2c",
      glow: "#f05a24",
    },
    weapons: {
      mainHand: { itemName: "Секира Пасти Проклятых", preset: "maw-cleaver" },
      offHand: { itemName: "Орочий раскалыватель", preset: "orc-splitter" },
    },
  },
  combatStats: { primary: 12842, crit: 24.1, haste: 18.6, mastery: 25.7, versatility: 6.2 },
  source: "fixture",
  updatedAt: "только что",
  gear: ([
    { slot: "Голова", name: "Шлем закалённого яростью", itemLevel: 509, iconUrl: icon("inv_helmet_151"), state: "good" },
    { slot: "Шея", name: "Медальон громовой клятвы", itemLevel: 506, iconUrl: icon("inv_jewelry_amulet_01"), state: "good" },
    { slot: "Плечи", name: "Наплечники неудержимого натиска", itemLevel: 512, iconUrl: icon("inv_shoulder_25"), state: "optimal" },
    { slot: "Спина", name: "Плащ пепельного марша", itemLevel: 509, iconUrl: icon("inv_misc_cape_11"), state: "good" },
    { slot: "Нагрудник", name: "Кираса неукротимой ярости", itemLevel: 509, iconUrl: icon("inv_chest_plate27"), state: "issue" },
    { slot: "Наручи", name: "Наручи боевого ритма", itemLevel: 506, iconUrl: icon("inv_bracer_18"), state: "good" },
    { slot: "Руки", name: "Рукавицы воинской клятвы", itemLevel: 509, iconUrl: icon("inv_gauntlets_29"), state: "optimal" },
    { slot: "Пояс", name: "Воинский пояс великой кузни", itemLevel: 509, iconUrl: icon("inv_belt_13"), state: "good" },
    { slot: "Ноги", name: "Латы несокрушимого марша", itemLevel: 509, iconUrl: icon("inv_pants_plate_06"), state: "good" },
    { slot: "Ступни", name: "Сапоги неудержимого наступления", itemLevel: 509, iconUrl: icon("inv_boots_plate_04"), state: "good" },
    { slot: "Основная рука", name: "Секира Пасти Проклятых", itemLevel: 506, iconUrl: icon("inv_axe_2h_artifactmaw_d_01"), state: "issue" },
    { slot: "Левая рука", name: "Орочий раскалыватель", itemLevel: 506, iconUrl: icon("inv_axe_2h_orcwarrior_c_01"), state: "good" },
    { slot: "Аксессуар 1", name: "Осколок раскалённого ядра", itemLevel: 512, iconUrl: icon("inv_misc_orb_05"), state: "optimal" },
    { slot: "Аксессуар 2", name: "Печать беспокойного сердца", itemLevel: 506, iconUrl: icon("inv_misc_pocketwatch_01"), state: "good" },
    { slot: "Кольцо 1", name: "Кольцо неугасающего натиска", itemLevel: 506, iconUrl: icon("inv_jewelry_ring_127"), state: "missing" },
    { slot: "Кольцо 2", name: "Печать яростного ветерана", itemLevel: 506, iconUrl: icon("inv_jewelry_ring_167"), state: "good" },
  ] satisfies Array<Omit<AuditGearItem, "details">>).map(withDetails),
};
