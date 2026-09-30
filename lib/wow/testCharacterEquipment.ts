import type { TalentSpecTheme } from "@/lib/talentSpecThemes";
import type { AuditGearDetails, AuditGearItem } from "@/lib/wow/characterAudit";

type ArmorType = "Ткань" | "Кожа" | "Кольчуга" | "Латы";
type WeaponHand = { name: string; category: string; icon: string; kind: "weapon" | "shield" | "focus" | "occupied" };
type WeaponProfile = { main: WeaponHand; off: WeaponHand };

const icon = (name: string) => `https://wow.zamimg.com/images/wow/icons/large/${name}.jpg`;

const armorByClass: Record<string, ArmorType> = {
  priest: "Ткань", mage: "Ткань", warlock: "Ткань",
  druid: "Кожа", rogue: "Кожа", monk: "Кожа", demonhunter: "Кожа",
  hunter: "Кольчуга", shaman: "Кольчуга", evoker: "Кольчуга",
  deathknight: "Латы", paladin: "Латы", warrior: "Латы",
};

const armorIcons: Record<ArmorType, Record<string, string[]>> = {
  "Ткань": {
    "Голова": ["inv_helmet_30", "inv_helmet_31", "inv_helmet_53"],
    "Плечи": ["inv_shoulder_02", "inv_shoulder_05", "inv_shoulder_13"],
    "Нагрудник": ["inv_chest_cloth_17", "inv_chest_cloth_23", "inv_chest_cloth_32"],
    "Наручи": ["inv_bracer_07", "inv_bracer_11", "inv_bracer_12"],
    "Руки": ["inv_gauntlets_05", "inv_gauntlets_15", "inv_gauntlets_18"],
    "Пояс": ["inv_belt_22", "inv_belt_24", "inv_belt_31"],
    "Ноги": ["inv_pants_cloth_05", "inv_pants_cloth_14", "inv_pants_cloth_17"],
    "Ступни": ["inv_boots_cloth_03", "inv_boots_cloth_05", "inv_boots_cloth_14"],
  },
  "Кожа": {
    "Голова": ["inv_helmet_04", "inv_helmet_09", "inv_helmet_41"],
    "Плечи": ["inv_shoulder_07", "inv_shoulder_08", "inv_shoulder_14"],
    "Нагрудник": ["inv_chest_leather_07", "inv_chest_leather_08", "inv_chest_leather_09"],
    "Наручи": ["inv_bracer_08", "inv_bracer_09", "inv_bracer_10"],
    "Руки": ["inv_gauntlets_05", "inv_gauntlets_15", "inv_gauntlets_18"],
    "Пояс": ["inv_belt_15", "inv_belt_17", "inv_belt_23"],
    "Ноги": ["inv_pants_leather_06", "inv_pants_leather_07", "inv_pants_leather_12"],
    "Ступни": ["inv_boots_05", "inv_boots_07", "inv_boots_08"],
  },
  "Кольчуга": {
    "Голова": ["inv_helmet_24", "inv_helmet_69", "inv_helmet_72"],
    "Плечи": ["inv_shoulder_15", "inv_shoulder_18", "inv_shoulder_22"],
    "Нагрудник": ["inv_chest_chain_12", "inv_chest_chain_13", "inv_chest_chain_16"],
    "Наручи": ["inv_bracer_16", "inv_bracer_17", "inv_bracer_19"],
    "Руки": ["inv_gauntlets_11", "inv_gauntlets_12", "inv_gauntlets_17"],
    "Пояс": ["inv_belt_13", "inv_belt_14", "inv_belt_20"],
    "Ноги": ["inv_pants_mail_05", "inv_pants_mail_15", "inv_pants_mail_16"],
    "Ступни": ["inv_boots_chain_05", "inv_boots_chain_08", "inv_boots_chain_10"],
  },
  "Латы": {
    "Голова": ["inv_helmet_151", "inv_helmet_25", "inv_helmet_74"],
    "Плечи": ["inv_shoulder_25", "inv_shoulder_29", "inv_shoulder_35"],
    "Нагрудник": ["inv_chest_plate27", "inv_chest_plate10", "inv_chest_plate16"],
    "Наручи": ["inv_bracer_18", "inv_bracer_15", "inv_bracer_14"],
    "Руки": ["inv_gauntlets_29", "inv_gauntlets_26", "inv_gauntlets_22"],
    "Пояс": ["inv_belt_13", "inv_belt_27", "inv_belt_29"],
    "Ноги": ["inv_pants_plate_06", "inv_pants_plate_15", "inv_pants_plate_18"],
    "Ступни": ["inv_boots_plate_04", "inv_boots_plate_06", "inv_boots_plate_09"],
  },
};

const armorNames: Record<ArmorType, Record<string, string>> = {
  "Ткань": { "Голова": "Капюшон", "Плечи": "Оплечье", "Нагрудник": "Одеяние", "Наручи": "Манжеты", "Руки": "Перчатки", "Пояс": "Шнурованный пояс", "Ноги": "Штаны", "Ступни": "Сандалии" },
  "Кожа": { "Голова": "Маска", "Плечи": "Наплечники", "Нагрудник": "Кожаный доспех", "Наручи": "Нарукавники", "Руки": "Боевые перчатки", "Пояс": "Ремень", "Ноги": "Поножи", "Ступни": "Ботфорты" },
  "Кольчуга": { "Голова": "Боевой шлем", "Плечи": "Наплечье", "Нагрудник": "Кольчуга", "Наручи": "Клёпаные наручи", "Руки": "Захваты", "Пояс": "Боевой пояс", "Ноги": "Набедренники", "Ступни": "Кольчужные сапоги" },
  "Латы": { "Голова": "Шлем", "Плечи": "Латные наплечники", "Нагрудник": "Кираса", "Наручи": "Латные наручи", "Руки": "Рукавицы", "Пояс": "Тяжёлый пояс", "Ноги": "Наголенники", "Ступни": "Башмаки" },
};

const setEpithetByClass: Record<string, string> = {
  druid: "лунного хранителя",
  evoker: "хранителя драконов",
  priest: "небесного хора",
  deathknight: "владыки рун",
  hunter: "тёмного следопыта",
  rogue: "ночного клинка",
  shaman: "первобытной бури",
  paladin: "кузнеца Света",
  mage: "тайной звезды",
  warrior: "горного тана",
  warlock: "повелителя Бездны",
  monk: "небесного монастыря",
  demonhunter: "пожирателя Скверны",
};

const setNameByClass: Record<string, string> = {
  druid: "Облачение лунного хранителя",
  evoker: "Регалии хранителя драконов",
  priest: "Одеяние небесного хора",
  deathknight: "Латы владыки рун",
  hunter: "Снаряжение тёмного следопыта",
  rogue: "Доспехи ночного клинка",
  shaman: "Регалии первобытной бури",
  paladin: "Доспехи кузнеца Света",
  mage: "Одеяние тайной звезды",
  warrior: "Латы горного тана",
  warlock: "Одеяние повелителя Бездны",
  monk: "Облачение небесного монастыря",
  demonhunter: "Доспехи пожирателя Скверны",
};

const armorModelItems: Record<ArmorType, Array<[number, number]>> = {
  "Ткань": [[1, 188836], [3, 34058], [5, 34038], [6, 34046], [7, 34039], [8, 34044], [10, 34041]],
  "Кожа": [[1, 33743], [3, 32813], [5, 33650], [6, 31110], [7, 31115], [8, 31111], [10, 32815]],
  "Кольчуга": [[1, 34367], [3, 34091], [5, 33667], [6, 33665], [7, 33672], [8, 34269], [10, 33668]],
  "Латы": [[1, 34215], [3, 34253], [5, 33983], [6, 33990], [7, 33986], [8, 33989], [10, 33984]],
};

// The shared leather preview is a heavy, horned rogue-style set. On a tauren
// druid it reads as plate armour and obscures the race silhouette. Keep the
// neutral leather pieces for druids and let their staff/spec identity carry the
// preview until the catalog supplies a real class-set appearance.
const modelItemsByClass: Partial<Record<string, Array<[number, number]>>> = {
  druid: armorModelItems["Кожа"].filter(([slot]) => ![1, 3, 5].includes(slot)),
};

const armorSlots = new Set(["Голова", "Плечи", "Нагрудник", "Наручи", "Руки", "Пояс", "Ноги", "Ступни"]);
const accessoryIcons: Record<string, string[]> = {
  "Шея": ["inv_jewelry_amulet_01", "inv_jewelry_amulet_04", "inv_jewelry_amulet_07", "inv_jewelry_amulet_07"],
  "Спина": ["inv_misc_cape_11", "inv_misc_cape_18", "inv_misc_cape_20", "inv_misc_cape_22"],
  "Аксессуар 1": ["inv_misc_orb_05", "inv_misc_gem_bloodstone_02", "inv_relics_idolofrejuvenation", "inv_misc_pocketwatch_02"],
  "Аксессуар 2": ["inv_misc_pocketwatch_01", "inv_relics_totemofrebirth", "inv_misc_rune_01", "inv_jewelry_talisman_06"],
  "Кольцо 1": ["inv_jewelry_ring_127", "inv_jewelry_ring_34", "inv_jewelry_ring_55", "inv_jewelry_ring_78"],
  "Кольцо 2": ["inv_jewelry_ring_167", "inv_jewelry_ring_21", "inv_jewelry_ring_62", "inv_jewelry_ring_86"],
};

const accessoryNames: Record<string, string> = {
  "Шея": "Медальон пути", "Спина": "Плащ пути", "Аксессуар 1": "Знак великого тайника",
  "Аксессуар 2": "Печать ветерана", "Кольцо 1": "Кольцо первого пути", "Кольцо 2": "Кольцо второго пути",
};

const hand = (name: string, category: string, iconName: string, kind: WeaponHand["kind"] = "weapon"): WeaponHand => ({ name, category, icon: iconName, kind });
const twoHand = (name: string, category: string, iconName: string): WeaponProfile => ({ main: hand(name, category, iconName), off: hand(`Двуручный хват: ${name}`, "Левая рука занята двуручным оружием", iconName, "occupied") });
const dual = (mainName: string, offName: string, category: string, mainIcon: string, offIcon = mainIcon): WeaponProfile => ({ main: hand(mainName, category, mainIcon), off: hand(offName, category, offIcon) });
const withFocus = (mainName: string, mainCategory: string, mainIcon: string, offName: string, offIcon: string): WeaponProfile => ({ main: hand(mainName, mainCategory, mainIcon), off: hand(offName, "Левая рука · Магический фокус", offIcon, "focus") });
const withShield = (mainName: string, mainCategory: string, mainIcon: string, shieldName: string, shieldIcon: string): WeaponProfile => ({ main: hand(mainName, mainCategory, mainIcon), off: hand(shieldName, "Левая рука · Щит", shieldIcon, "shield") });

const weapons: Record<string, WeaponProfile> = {
  "balance-druid": twoHand("Посох Лунной рощи", "Двуручное · Посох", "inv_staff_2h_artifactelune_d_01"),
  "feral-druid": twoHand("Копьё первобытной охоты", "Двуручное · Древковое", "inv_spear_05"),
  "guardian-druid": twoHand("Посох тысячелетней коры", "Двуручное · Посох", "inv_staff_08"),
  "restoration-druid": twoHand("Ветвь Изумрудного Сна", "Двуручное · Посох", "inv_staff_2h_artifactheartofkure_d_01"),
  "devastation-evoker": twoHand("Шпиль багрового пламени", "Двуручное · Посох", "inv_staff_51"),
  "preservation-evoker": withFocus("Клык хранителя времени", "Одноручное · Кинжал", "inv_weapon_shortblade_05", "Чаша изумрудной жизни", "inv_misc_orb_01"),
  "augmentation-evoker": withFocus("Клинок чёрной стаи", "Одноручное · Меч", "inv_sword_39", "Хронический кристалл", "inv_misc_orb_05"),
  "discipline-priest": withFocus("Молот искупления", "Одноручное · Дробящее", "inv_mace_01", "Кодекс равновесия", "inv_misc_book_09"),
  "holy-priest": twoHand("Посох безупречного света", "Двуручное · Посох", "inv_staff_47"),
  "shadow-priest": withFocus("Игла Бездны", "Одноручное · Кинжал", "inv_weapon_shortblade_10", "Око шепчущей тьмы", "inv_misc_orb_01"),
  "blood-death-knight": twoHand("Кровавый раскалыватель", "Двуручное · Секира", "inv_axe_2h_artifactmaw_d_01"),
  "frost-death-knight": dual("Морозный приговор", "Иней погибели", "Одноручное · Меч", "inv_sword_27", "inv_sword_122"),
  "unholy-death-knight": twoHand("Клинок чумного владыки", "Двуручное · Меч", "inv_sword_2h_artifactashbringer_d_01"),
  "beast-mastery-hunter": twoHand("Лук вожака стаи", "Дальний бой · Лук", "inv_weapon_bow_08"),
  "marksmanship-hunter": twoHand("Дальнобойная винтовка часового", "Дальний бой · Ружьё", "inv_weapon_rifle_06"),
  "survival-hunter": twoHand("Гарпун дикой охоты", "Двуручное · Древковое", "inv_spear_05"),
  "assassination-rogue": dual("Ядовитый шип", "Клык тихой смерти", "Одноручное · Кинжал", "inv_weapon_shortblade_03", "inv_weapon_shortblade_15"),
  "outlaw-rogue": dual("Сабля удачи", "Клинок вольного корсара", "Одноручное · Меч", "inv_sword_04", "inv_sword_14"),
  "subtlety-rogue": dual("Лезвие ночного шага", "Теневой резец", "Одноручное · Кинжал", "inv_weapon_shortblade_07", "inv_weapon_shortblade_12"),
  "elemental-shaman": withShield("Молот первобытной бури", "Одноручное · Дробящее", "inv_mace_10", "Щит расколотой земли", "inv_shield_05"),
  "enhancement-shaman": dual("Топор вестника бури", "Клык духа волка", "Одноручное · Секира", "inv_axe_04", "inv_axe_06"),
  "restoration-shaman": withShield("Скипетр прилива", "Одноручное · Дробящее", "inv_mace_35", "Тотемный щит предков", "inv_shield_06"),
  "holy-paladin": withShield("Клинок солнечной клятвы", "Одноручное · Меч", "inv_sword_39", "Эгида рассвета", "inv_shield_23"),
  "protection-paladin": withShield("Меч храмовника", "Одноручное · Меч", "inv_sword_20", "Несокрушимый бастион", "inv_shield_32"),
  "retribution-paladin": twoHand("Великий клинок правосудия", "Двуручное · Меч", "inv_sword_2h_artifactashbringer_d_01"),
  "arcane-mage": twoHand("Посох совершенной геометрии", "Двуручное · Посох", "inv_staff_14"),
  "fire-mage": withFocus("Клинок живого пламени", "Одноручное · Меч", "inv_sword_09", "Сфера неугасимого жара", "inv_misc_orb_01"),
  "frost-mage": twoHand("Шпиль вечной зимы", "Двуручное · Посох", "inv_staff_29"),
  "arms-warrior": twoHand("Великий меч стального колосса", "Двуручное · Меч", "inv_sword_2h_artifactarathor_d_01"),
  "fury-warrior": dual("Секира Пасти Проклятых", "Орочий раскалыватель", "Двуручное · Секира", "inv_axe_2h_artifactmaw_d_01", "inv_axe_2h_orcwarrior_c_01"),
  "protection-warrior": withShield("Клинок железной воли", "Одноручное · Меч", "inv_sword_11", "Щит горного тана", "inv_shield_10"),
  "affliction-warlock": twoHand("Посох бесконечной агонии", "Двуручное · Посох", "inv_staff_19"),
  "demonology-warlock": withFocus("Ритуальный клинок призывателя", "Одноручное · Кинжал", "inv_weapon_shortblade_16", "Череп повелителя бесов", "inv_offhand_1h_artifactskulloferedar_d_01"),
  "destruction-warlock": twoHand("Жезл испепеляющего хаоса", "Двуручное · Посох", "inv_staff_52"),
  "brewmaster-monk": twoHand("Посох хмельного мастера", "Двуручное · Посох", "inv_staff_07"),
  "windwalker-monk": dual("Кулак нефритового ветра", "Кулак белого тигра", "Одноручное · Кистевое", "inv_weapon_hand_01", "inv_weapon_hand_04"),
  "mistweaver-monk": twoHand("Посох небесного тумана", "Двуручное · Посох", "inv_staff_42"),
  "havoc-demon-hunter": dual("Глефа яростной Скверны", "Глефа Альдрахи", "Одноручное · Боевые глефы", "inv_glaive_1h_demonhunter_a_01"),
  "vengeance-demon-hunter": dual("Глефа огненной печати", "Глефа возмездия", "Одноручное · Боевые глефы", "inv_glaive_1h_demonhunter_a_01"),
  "devourer-demon-hunter": dual("Глефа голода Бездны", "Разрыватель реальности", "Одноручное · Боевые глефы", "inv_glaive_1h_demonhunter_a_01"),
};

const weaponModelItems: Record<string, [mainHand: number, offHand?: number]> = {
  "balance-druid": [193841], "feral-druid": [31867], "guardian-druid": [31265], "restoration-druid": [193841],
  "devastation-evoker": [31960], "preservation-evoker": [33615, 23177], "augmentation-evoker": [29677, 23177],
  "discipline-priest": [675214, 23177], "holy-priest": [31960], "shadow-priest": [33615, 23177],
  "blood-death-knight": [683182], "frost-death-knight": [22366, 682306], "unholy-death-knight": [682296],
  "beast-mastery-hunter": [30927], "marksmanship-hunter": [682298], "survival-hunter": [683759],
  "assassination-rogue": [33615, 33626], "outlaw-rogue": [22366, 682306], "subtlety-rogue": [33615, 33626],
  "elemental-shaman": [682293, 677551], "enhancement-shaman": [683182, 682292], "restoration-shaman": [675214, 677551],
  "holy-paladin": [29677, 677551], "protection-paladin": [22366, 677551], "retribution-paladin": [682296],
  "arcane-mage": [31960], "fire-mage": [29677, 23177], "frost-mage": [31960],
  "arms-warrior": [682296], "fury-warrior": [701532, 701532], "protection-warrior": [22366, 677551],
  "affliction-warlock": [31960], "demonology-warlock": [33615, 23177], "destruction-warlock": [31960],
  "brewmaster-monk": [31265], "windwalker-monk": [110784, 110783], "mistweaver-monk": [31960],
  "havoc-demon-hunter": [729519, 729518], "vengeance-demon-hunter": [729519, 729518], "devourer-demon-hunter": [729519, 729518],
};

const primaryStat = (theme: TalentSpecTheme) => {
  if (["warrior", "paladin", "deathknight"].includes(theme.classKey)) return "силы";
  if (["hunter", "rogue", "monk", "demonhunter"].includes(theme.classKey)) return "ловкости";
  if (theme.classKey === "druid" && ["feral-druid", "guardian-druid"].includes(theme.slug)) return "ловкости";
  if (theme.classKey === "shaman" && theme.slug === "enhancement-shaman") return "ловкости";
  return "интеллекта";
};

const primaryStatDative = (theme: TalentSpecTheme) => {
  const stat = primaryStat(theme);
  return stat === "силы" ? "силе" : stat === "интеллекта" ? "интеллекту" : "ловкости";
};

export const getPrimaryStatLabel = (theme: TalentSpecTheme): "Сила" | "Ловкость" | "Интеллект" => {
  const stat = primaryStat(theme);
  return stat === "силы" ? "Сила" : stat === "интеллекта" ? "Интеллект" : "Ловкость";
};

const armorFactor: Record<ArmorType, number> = { "Ткань": .32, "Кожа": .54, "Кольчуга": .76, "Латы": 1 };

function scaleArmor(value: string | undefined, armor: ArmorType) {
  if (!value) return undefined;
  const amount = Number(value.replace(/\D/g, ""));
  if (!amount) return value;
  return `${Math.round(amount * armorFactor[armor]).toLocaleString("ru-RU")} брони`;
}

const auditFor = (state: AuditGearItem["state"]): AuditGearDetails["audit"] => ({
  impact: state === "issue" ? "Потенциальная потеря: 1,5–2,3% эффективности" : state === "missing" ? "Потенциальная потеря: 1,1% эффективности" : state === "optimal" ? "Слот соответствует целевому профилю" : "Слот пригоден для текущего контента",
  nextStep: state === "issue" ? "Исправить в плане действий" : state === "missing" ? "Добавить рекомендуемое улучшение" : state === "optimal" ? "Замена не требуется" : "Следующая цель — предмет 515+ уровня",
});

function cloneDetails(details: AuditGearDetails, theme: TalentSpecTheme, slot: string, state: AuditGearItem["state"]): AuditGearDetails {
  const armor = armorByClass[theme.classKey];
  const stat = primaryStat(theme);
  const dative = primaryStatDative(theme);
  const replaceStat = (value?: string) => value
    ?.replace(/к силе|к ловкости|к интеллекту/g, `к ${dative}`)
    .replace(/силы|ловкости|интеллекта/g, stat);
  return {
    ...details,
    category: armorSlots.has(slot) ? `${slot} · ${armor}` : details.category,
    armor: scaleArmor(details.armor, armor),
    primary: replaceStat(details.primary),
    secondaries: details.secondaries.map((secondary) => ({ ...secondary })),
    enchant: details.enchant ? { ...details.enchant, effect: replaceStat(details.enchant.effect) ?? details.enchant.effect } : undefined,
    sockets: details.sockets?.map((socket) => ({ ...socket, effect: replaceStat(socket.effect) ?? socket.effect })),
    set: details.set ? {
      ...details.set,
      name: setNameByClass[theme.classKey] ?? "Классовый комплект",
      bonuses: [
        { pieces: 2, text: `Ключевые способности специализации «${theme.specNameRu}» усилены на 8%`, active: true },
        { pieces: 4, text: `Расход основного ресурса продлевает эффект классового усиления`, active: true },
      ],
    } : undefined,
    audit: auditFor(state),
  };
}

function weaponDetails(template: AuditGearDetails, theme: TalentSpecTheme, handProfile: WeaponHand, state: AuditGearItem["state"]): AuditGearDetails {
  const stat = primaryStat(theme);
  const occupied = handProfile.kind === "occupied";
  return {
    quality: "Эпический",
    binding: "Персональный",
    category: handProfile.category,
    weapon: handProfile.kind === "weapon" ? { damage: template.weapon?.damage ?? "9 840–16 410 урона", speed: template.weapon?.speed ?? "2,60", dps: template.weapon?.dps ?? "5 048,1" } : undefined,
    armor: handProfile.kind === "shield" ? "2 284 брони" : undefined,
    primary: occupied ? undefined : `+2 034 ${stat}`,
    stamina: occupied ? undefined : "+6 214 выносливости",
    secondaries: occupied ? [] : template.secondaries.map((secondary) => ({ ...secondary })),
    enchant: handProfile.kind === "weapon" ? { name: theme.role === "healer" ? "Чары целительной гармонии" : "Чары высшей мощи", effect: `Иногда повышает показатель ${stat} на 340`, active: true } : undefined,
    durability: occupied || handProfile.kind === "focus" ? undefined : "120 / 120",
    source: occupied ? "Связано с оружием в основной руке" : "Великий тайник · Тестовый набор",
    sellPrice: occupied ? undefined : "136 04 22",
    audit: auditFor(state),
  };
}

export function buildTestGear(theme: TalentSpecTheme, characterIndex: number, templateGear: AuditGearItem[]): AuditGearItem[] {
  const armor = armorByClass[theme.classKey];
  const weaponProfile = weapons[theme.slug];
  return templateGear.map((template, slotIndex) => {
    const stateCycle: AuditGearItem["state"][] = ["good", "optimal", "good", "issue", "good", "missing"];
    const state = stateCycle[(characterIndex + slotIndex) % stateCycle.length];
    const itemLevel = 496 + ((characterIndex * 3 + slotIndex * 2) % 18);
    if (template.slot === "Основная рука" || template.slot === "Левая рука") {
      const profile = template.slot === "Основная рука" ? weaponProfile.main : weaponProfile.off;
      const weaponState = profile.kind === "occupied" ? "optimal" : state;
      return { ...template, name: profile.name, itemLevel, iconUrl: icon(profile.icon), state: weaponState, details: weaponDetails(template.details, theme, profile, weaponState) };
    }
    const variants = armorSlots.has(template.slot) ? armorIcons[armor][template.slot] : accessoryIcons[template.slot];
    const iconName = variants?.[(characterIndex + theme.specId) % variants.length];
    const name = armorSlots.has(template.slot)
      ? `${armorNames[armor][template.slot]} ${setEpithetByClass[theme.classKey] ?? "исследователя Азерота"}`
      : accessoryNames[template.slot] ?? template.name;
    return { ...template, name, itemLevel, iconUrl: icon(iconName ?? "inv_misc_questionmark"), state, details: cloneDetails(template.details, theme, template.slot, state) };
  });
}

export function getWeaponProfile(theme: TalentSpecTheme) {
  return weapons[theme.slug];
}

export function getModelItems(theme: TalentSpecTheme): Array<[number, number]> {
  const armor = armorByClass[theme.classKey];
  const [mainHand, offHand] = weaponModelItems[theme.slug];
  const armorPieces = modelItemsByClass[theme.classKey] ?? armorModelItems[armor];
  return [...armorPieces, [21, mainHand], ...(offHand ? [[22, offHand] as [number, number]] : [])];
}
