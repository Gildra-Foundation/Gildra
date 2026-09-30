import { seasonGuideBosses } from "@/lib/lairSeasonBosses";

export type BossKind = "lair" | "world" | "dungeon" | "delve";
export type MechanicTag = "DODGE" | "SOAK" | "INTERRUPT" | "DISPEL" | "HEAL" | "TANK" | "KILL" | "RUN" | "MOVE" | "SPREAD" | "FRONTAL" | "TANK_SWAP" | "DEFENSIVE" | "HARD_CC" | "TARGET_PRIORITY";
export type Mechanic = { name: string; role: "Все" | "Танки" | "Хилы" | "All" | "Tanks" | "Healers" | "DPS"; tone: "frost" | "danger" | "control" | "tank"; action: MechanicTag; tags?: MechanicTag[]; spellId?: number; castBy?: string; sourceUrl?: string; icon: string; description: string; response: string };
export type Loot = { name: string; itemId?: number; slot: string; armor: string; stats: string; priority: string; difficulty?: string; itemLevel?: string; chanceStatus?: "unknown"; sourceUrl?: string };
export type Boss = {
  slug: string; name: string; title: string; kind: BossKind; active?: boolean; zone: string; coordinates: string; image: string; portrait: string; map: string; badgeIcon?: string; accent: string;
  flavor: string; summary: string; reset: string;
  composition: { tanks: string; healers: string; dps: string; size: string };
  farm: { waypoint: string; access: string; lockout: string; best: string };
  difficulties: { name: string; group: string; reward: string; note: string }[];
  mechanics: Mechanic[]; loot: Loot[];
  positioning?: Array<{ label: string; text: string }>;
  sourceUrl?: string;
  lastVerifiedAt?: string;
};

export const lairGuideSourceUrl = "https://www.icy-veins.com/wow/midnight-world-bosses-guide";
export const lairGuideLastVerifiedAt = "2026-09-13";

const lootIconNames: Record<string, string> = {
  "Tidepiercer's Bubble Popper": "inv_staff_2h_ulatek_d_01",
  "Bubblefin Splash Guard": "inv_shield_1h_ulatek_d_01",
  "Frostscale's Mystic Frond": "inv_offhand_1h_ulatek_d_01",
  "Swelling Sea Spaulders": "inv_shoulder_plate_raidpaladinulatek_d_01",
  "Tidebound Sorceress's Robes": "inv_robe_cloth_raidwarlockulatek_d_01",
  "Rising Tide Wristguards": "inv_bracer_mail_raidhunterulatek_d_01",
  "Grips of Swirling Fury": "inv_glove_mail_raidevokerulatek_d_01",
  "Cincture of the Abyssal Grotto": "inv_belt_cloth_raidmageulatek_d_01",
  "Forgotten Grotto Girdle": "inv_belt_plate_raiddeathknightulatek_d_01",
  "Breakwater Boots": "inv_boot_leather_raiddemonhunterulatek_d_01",
  "Alluring Bubbleband": "inv_70_raid_ring8c",
  "Wavecaller's Seastone": "inv_tradeskillitem_sorcererswater",
  "Dawncrazed Beast Cleaver": "inv_axe_1h_questbloodelf_b_01",
  "Scepter of the Unbound Light": "inv_mace_1h_questbloodelf_b_01",
  "Radiant Eversong Scepter": "inv_offhand_1h_questbloodelf_b_01",
  "Bramblestalker's Feathered Cowl": "inv_helm_mail_raidhuntermidnight_d_01",
  "Host Commander's Casque": "inv_plate_raiddeathknightmidnight_d_01_helm",
  "Wretched Scholar's Gilded Robe": "inv_chest_cloth_raidmagemidnight_d_01",
  "Devouring Outrider's Chausses": "inv_pant_leather_raiddemonhuntermidnight_d_01",
  "Forgotten Farstrider's Insignia": "inv_misc_tournaments_banner_bloodelf",
  "Forest Sentinel's Savage Longbow": "inv_bow_1h_amani_c_01",
  "Cragtender Bulwark": "inv_shield_1h_revendrethquest_b_01",
  "Chain of the Ancient Watcher": "inv_7_0raid_necklace_03c",
  "Beastly Blossombarb": "inv_polearm_2h_rutaani_b_01",
  "Blooming Thornblade": "inv_sword_1h_rutaani_b_01",
  "Skulking Nettledirk": "inv_knife_1h_rutaani_b_01",
  "Devouring Vanguard's Soulcleaver": "inv_axe_2h_domanaar_b_01",
  "Voidbender's Spire": "inv_staff_2h_domanaar_b_01",
  "Encroaching Shadow Signet": "inv_ring_oribos_01_silver",
};

export function getLootIcon(name: string) {
  const icon = lootIconNames[name] ?? "inv_misc_tournaments_banner_bloodelf";
  return `/assets/wow/lairs/loot/${icon}.jpg`;
}

const sharedWorldLoot: Loot[] = [
  { name: "Bramblestalker's Feathered Cowl", slot: "Голова", armor: "Кольчуга", stats: "Ловкость / Интеллект", priority: "Высокий" },
  { name: "Host Commander's Casque", slot: "Голова", armor: "Латы", stats: "Сила / Интеллект", priority: "Средний" },
  { name: "Wretched Scholar's Gilded Robe", slot: "Грудь", armor: "Ткань", stats: "Интеллект", priority: "Высокий" },
  { name: "Devouring Outrider's Chausses", slot: "Ноги", armor: "Кожа", stats: "Ловкость / Интеллект", priority: "Средний" },
  { name: "Forgotten Farstrider's Insignia", slot: "Аксессуар", armor: "Универсальный", stats: "Основная характеристика", priority: "Лучший выбор" },
];

const rawBosses: Boss[] = [
  {
    slug: "nymrissa-wavecaller", name: "Nymrissa Wavecaller", title: "Голос глубин", kind: "lair", active: true,
    zone: "The Coiled Isle · Tidebound Grotto", coordinates: "60.0, 66.0", image: "/assets/wow/lairs/bosses/nymrissa.jpg", portrait: "/assets/wow/lairs/bosses/nymrissa.jpg", map: "/assets/wow/lairs/maps/nymrissa.jpg", accent: "#4aa9d8",
    flavor: "Она не поднимает волну. Она приказывает морю вспомнить, кого оно должно поглотить.",
    summary: "Первый босс системы Lairs: отдельный инстанс, четыре уровня сложности и полноценные рейдовые механики без длинного треша.",
    reset: "1 раз в неделю · на каждой сложности", composition: { tanks: "2", healers: "По группе", dps: "Остальные", size: "World: до 40 · N/H: 10–30 · Mythic: 15–25" },
    farm: { waypoint: "/way #2536 60.0 66.0 Tidebound Grotto", access: "World — соло-очередь; остальные — готовая группа", lockout: "Отдельная добыча на каждой сложности", best: "Mythic · Myth 1/6" },
    difficulties: [
      { name: "World", group: "Автосбор · до 40", reward: "Veteran 1/6", note: "Вход соло, группа собирается внутри" },
      { name: "Normal", group: "10–30", reward: "Champion 1/6", note: "Мягкие проверки позиции и урона" },
      { name: "Heroic", group: "10–30", reward: "Hero 1/6", note: "Frost Orbs взрываются без soak" },
      { name: "Mythic", group: "15–25", reward: "Myth 1/6", note: "Новые адды, Water Jet и жёсткий тайминг" },
    ],
    mechanics: [
      { name: "Alluring Bubble", role: "DPS", tone: "control", action: "KILL", icon: "/assets/wow/lairs/spells/inv_elemental_primal_water.jpg", description: "Bubblefin идут к пузырю из кипящих луж. Добравшийся адд превращается в Berserker и пульсирует по рейду.", response: "Фокус аддов → массовый контроль → Frostscale первым на Mythic." },
      { name: "Chilling Frost", role: "Все", tone: "frost", action: "SOAK", icon: "/assets/wow/lairs/spells/spell_fire_blueimmolation.jpg", description: "DoT оставляет Frost Orbs. Каждый подобранный шар создаёт скользкую зону Lingering Frost.", response: "Складывайте шары плотно у босса; на Heroic не оставляйте ни одного." },
      { name: "Abyssal Rain", role: "Хилы", tone: "danger", action: "HEAL", icon: "/assets/wow/lairs/spells/spell_fire_bluerainoffire.jpg", description: "Четыре секунды тяжёлого урона по рейду перед каждой волной аддов. На Heroic усиливает будущий frost-урон.", response: "Назначьте healing CD на каждую волну, личные защиты — со второй." },
      { name: "Iceblade Flurry", role: "Танки", tone: "tank", action: "TANK", icon: "/assets/wow/lairs/spells/inv_polearm_2h_draenorchallenge_d_01_02.jpg", description: "Серия ударов оставляет стакающийся дебафф +20% к следующему Flurry.", response: "Меняйтесь регулярно, не позволяя стакам разогнать следующий удар." },
      { name: "Swirling Whirlpools", role: "Все", tone: "danger", action: "DODGE", icon: "/assets/wow/lairs/spells/inv_elemental_primal_air.jpg", description: "Кольца волн сходятся к центру, оставляя единственный безопасный проход.", response: "Сначала найдите разрыв, затем сместитесь ближе к центру перед Pop!" },
      { name: "Unending Tides", role: "Все", tone: "danger", action: "HEAL", icon: "/assets/wow/lairs/spells/spell_shaman_tidalwaves.jpg", description: "На шестой минуте Нимрисса начинает непрерывно заливать арену — мягкий enrage превращается в вайп.", response: "Закончите бой до 6:00; сохраните сильные защиты и лечение на финальную часть." },
    ],
    loot: [
      { name: "Tidepiercer's Bubble Popper", slot: "Посох 2Р", armor: "Оружие", stats: "Ловкость", priority: "Высокий" },
      { name: "Bubblefin Splash Guard", slot: "Щит", armor: "Оружие", stats: "Сила / Интеллект", priority: "Высокий" },
      { name: "Frostscale's Mystic Frond", slot: "Левая рука", armor: "Оружие", stats: "Интеллект", priority: "Средний" },
      { name: "Swelling Sea Spaulders", slot: "Плечи", armor: "Латы", stats: "Сила / Интеллект", priority: "Средний" },
      { name: "Tidebound Sorceress's Robes", slot: "Грудь", armor: "Ткань", stats: "Интеллект", priority: "Высокий" },
      { name: "Rising Tide Wristguards", slot: "Запястья", armor: "Кольчуга", stats: "Ловкость / Интеллект", priority: "Средний" },
      { name: "Grips of Swirling Fury", slot: "Кисти", armor: "Кольчуга", stats: "Ловкость / Интеллект", priority: "Средний" },
      { name: "Cincture of the Abyssal Grotto", slot: "Пояс", armor: "Ткань", stats: "Интеллект", priority: "Средний" },
      { name: "Forgotten Grotto Girdle", slot: "Пояс", armor: "Латы", stats: "Сила / Интеллект", priority: "Средний" },
      { name: "Breakwater Boots", slot: "Ступни", armor: "Кожа", stats: "Ловкость / Интеллект", priority: "Средний" },
      { name: "Alluring Bubbleband", slot: "Кольцо", armor: "Универсальный", stats: "Вторичные", priority: "Высокий" },
      { name: "Wavecaller's Seastone", slot: "Аксессуар", armor: "Универсальный", stats: "Интеллект", priority: "Лучший выбор" },
    ],
  },
  {
    slug: "luashal", name: "Lu'ashal", title: "Ослеплённая рассветом", kind: "world", zone: "Eversong Woods", coordinates: "45.0, 60.0",
    image: "/assets/wow/lairs/bosses/luashal.jpg", portrait: "/assets/wow/lairs/bosses/luashal.jpg", map: "/assets/wow/lairs/maps/luashal.jpg", accent: "#e8bd55", flavor: "Свет сделал её прекрасной. Избыток Света сделал её чудовищем.",
    summary: "Подвижный бой с лучами, расколотой ареной и постоянным контролем дистанции.", reset: "Еженедельная ротация", composition: { tanks: "Не задано", healers: "По группе", dps: "Остальные", size: "Открытая мировая группа" }, farm: { waypoint: "/way Eversong Woods 45.0 60.0 Lu'ashal", access: "Мировой квест со значком черепа", lockout: "1 гарантированная награда в неделю", best: "Champion · ilvl 246" },
    difficulties: [{ name: "World", group: "Открытая группа", reward: "Champion · ilvl 246", note: "Один босс ротации активен каждую неделю" }],
    mechanics: [
      { name: "Radiant Sunder", role: "Все", tone: "danger", action: "DODGE", icon: "/assets/wow/lairs/spells/inv_ability_holyfire_missile.jpg", description: "Удар раскалывает землю и оставляет Blinding Fissure.", response: "Не стойте по линии разлома и сохраняйте свободный сектор." },
      { name: "Dawncrazed Halo", role: "Все", tone: "control", action: "RUN", icon: "/assets/wow/lairs/spells/inv_ability_holyfire_groundstate.jpg", description: "Отмеченные игроки наносят урон вокруг себя.", response: "Разойдитесь до срабатывания; не пересекайте танков." },
      { name: "Dawnfire Breath", role: "Танки", tone: "tank", action: "TANK", icon: "/assets/wow/lairs/spells/ability_evoker_firebreath.jpg", description: "Тяжёлый фронтальный конус Radiant-урона.", response: "Разверните босса от рейда и не двигайте без причины." },
      { name: "Radiant Flare", role: "Хилы", tone: "danger", action: "HEAL", icon: "/assets/wow/lairs/spells/ability_priest_archangel.jpg", description: "Сильный рейдовый урон выпускает волны Radiant Embers из разломов.", response: "Рейдовый CD и движение между волнами, не через них." },
    ],
    loot: [
      { name: "Dawncrazed Beast Cleaver", slot: "Топор 1Р", armor: "Оружие", stats: "Ловкость", priority: "Высокий" },
      { name: "Scepter of the Unbound Light", slot: "Дробящее 1Р", armor: "Оружие", stats: "Сила", priority: "Высокий" },
      { name: "Radiant Eversong Scepter", slot: "Левая рука", armor: "Оружие", stats: "Интеллект", priority: "Высокий" },
      ...sharedWorldLoot,
    ],
  },
  {
    slug: "cragpine", name: "Cragpine", title: "Сердце древнего леса", kind: "world", zone: "Eversong Woods", coordinates: "45.5, 48.0",
    image: "/assets/wow/lairs/bosses/cragpine.jpg", portrait: "/assets/wow/lairs/bosses/cragpine.jpg", map: "/assets/wow/lairs/maps/cragpine.jpg", accent: "#95b95a", flavor: "Под каждым корнем спит ярость, которая старше любого королевства.",
    summary: "Адд-чек и проверка рейдового лечения: тренты преследуют игроков, а семена заполняют арену.", reset: "Еженедельная ротация", composition: { tanks: "Не задано", healers: "По группе", dps: "Остальные", size: "Открытая мировая группа" }, farm: { waypoint: "/way Eversong Woods 45.5 48.0 Cragpine", access: "Мировой квест со значком черепа", lockout: "1 гарантированная награда в неделю", best: "Champion · ilvl 246" },
    difficulties: [{ name: "World", group: "Открытая группа", reward: "Champion · ilvl 246", note: "Один босс ротации активен каждую неделю" }],
    mechanics: [
      { name: "Rootquake", role: "Хилы", tone: "danger", action: "HEAL", icon: "/assets/wow/lairs/spells/spell_shaman_earthquake.jpg", description: "Тяжёлые импульсы урона по всему рейду пробуждают лес.", response: "Чередуйте рейдовые CD, добивайте раненых до следующего тика." },
      { name: "Ancient Seeds", role: "Все", tone: "control", action: "DODGE", icon: "/assets/wow/lairs/spells/inv_farm_herbseed.jpg", description: "Парящие семена наносят урон всем рядом и ограничивают пространство.", response: "Держите строй свободным и не загоняйте рейд в край." },
      { name: "Angry Treants", role: "DPS", tone: "control", action: "KILL", icon: "/assets/wow/lairs/spells/ability_druid_manatree.jpg", description: "Тренты фиксируются на игроках и преследуют их до смерти.", response: "Сводите аддов под cleave, замедляйте и убивайте быстро." },
      { name: "War Club", role: "Танки", tone: "tank", action: "TANK", icon: "/assets/wow/lairs/spells/ability_druid_manatree.jpg", description: "Тяжёлые автоатаки резко пробивают активного танка.", response: "Держите mitigation постоянно, подстрахуйте внешним CD." },
    ],
    loot: [
      { name: "Forest Sentinel's Savage Longbow", slot: "Лук", armor: "Оружие", stats: "Ловкость", priority: "Высокий" },
      { name: "Cragtender Bulwark", slot: "Щит", armor: "Оружие", stats: "Сила / Интеллект", priority: "Высокий" },
      { name: "Chain of the Ancient Watcher", slot: "Шея", armor: "Универсальный", stats: "Вторичные", priority: "Высокий" },
      ...sharedWorldLoot,
    ],
  },
  {
    slug: "thormbelan", name: "Thorm'belan", title: "Искажённый Светом", kind: "world", zone: "Harandar", coordinates: "40.7, 65.0",
    image: "/assets/wow/lairs/bosses/thormbelan.jpg", portrait: "/assets/wow/lairs/bosses/thormbelan.jpg", map: "/assets/wow/lairs/maps/thormbelan.jpg", accent: "#cfb350", flavor: "Когда-то кроткий зверь, теперь он несёт Lightbloom как открытую рану.",
    summary: "Общий для всех ролей бой на исполнение: перехватывайте Shards, выбегайте из Tendrils и разносите Motes.", reset: "Еженедельная ротация", composition: { tanks: "Не задано", healers: "По группе", dps: "Остальные", size: "Открытая мировая группа" }, farm: { waypoint: "/way Harandar 40.7 65.0 Thorm'belan", access: "Мировой квест со значком черепа", lockout: "1 гарантированная награда в неделю", best: "Champion · ilvl 246" },
    difficulties: [{ name: "World", group: "Открытая группа", reward: "Champion · ilvl 246", note: "Один босс ротации активен каждую неделю" }],
    mechanics: [
      { name: "Scintillating Shard", role: "Все", tone: "danger", action: "SOAK", icon: "/assets/wow/lairs/spells/ability_monk_explodingjadeblossom.jpg", description: "Снаряд должен быть перехвачен игроком; если он долетит до арены, весь рейд будет оглушён.", response: "Назначьте ближайшего игрока на каждый Shard и не дублируйте soak." },
      { name: "Shredding Tendrils", role: "Все", tone: "control", action: "RUN", icon: "/assets/wow/lairs/spells/spell_nature_thorns.jpg", description: "Щупальца притягивают игроков к боссу и наносят урон, пока цель не отойдёт достаточно далеко.", response: "Сразу бегите от босса; заранее держитесь не у центра его модели." },
      { name: "Radiant Mote", role: "Все", tone: "frost", action: "RUN", icon: "/assets/wow/lairs/spells/item_holyspark.jpg", description: "Метка наносит урон и дезориентирует всех игроков рядом в момент окончания.", response: "Разнесите Motes по свободным секторам и не пересекайтесь на возврате." },
    ],
    loot: [
      { name: "Beastly Blossombarb", slot: "Древковое 2Р", armor: "Оружие", stats: "Ловкость", priority: "Высокий" },
      { name: "Blooming Thornblade", slot: "Меч 1Р", armor: "Оружие", stats: "Интеллект", priority: "Высокий" },
      { name: "Skulking Nettledirk", slot: "Кинжал 1Р", armor: "Оружие", stats: "Ловкость", priority: "Высокий" },
      ...sharedWorldLoot,
    ],
  },
  {
    slug: "predaxas", name: "Predaxas", title: "Голод Пустоты", kind: "world", zone: "Voidstorm · Gorging Pit", coordinates: "49.0, 86.4",
    image: "/assets/wow/lairs/bosses/predaxas.jpg", portrait: "/assets/wow/lairs/bosses/predaxas.jpg", map: "/assets/wow/lairs/maps/predaxas.jpg", accent: "#a981d6", flavor: "Он не спит, не думает и не охотится. Он просто продолжает есть.",
    summary: "Хаотичный бой с отбрасываниями и аддами: позиция предыдущей волны определяет опасность следующей.", reset: "Еженедельная ротация", composition: { tanks: "Не задано", healers: "По группе", dps: "Остальные", size: "Открытая мировая группа" }, farm: { waypoint: "/way Voidstorm 49.0 86.4 Predaxas", access: "Мировой квест со значком черепа", lockout: "1 гарантированная награда в неделю", best: "Champion · ilvl 246" },
    difficulties: [{ name: "World", group: "Открытая группа", reward: "Champion · ilvl 246", note: "Один босс ротации активен каждую неделю" }],
    mechanics: [
      { name: "Regurgitation", role: "Танки", tone: "control", action: "KILL", icon: "/assets/wow/lairs/spells/ability_creature_poison_01.jpg", description: "Босс исторгает прошлую добычу — Bloodclaws сразу атакуют рейд.", response: "Заберите аддов и соберите под фронтом босса для cleave." },
      { name: "Seismic Slam", role: "Все", tone: "danger", action: "DODGE", icon: "/assets/wow/lairs/spells/inv_hand_1h_bwdraid_d_01.jpg", description: "Удар отбрасывает игроков и существ, запуская дополнительные эффекты.", response: "Не стойте спиной к краю; вынесите аддов в предсказуемый сектор." },
      { name: "Voidscatter", role: "DPS", tone: "frost", action: "DODGE", icon: "/assets/wow/lairs/spells/inv12_ability_priest_voidvolley.jpg", description: "Voidticks реагируют на Slam и выпускают расходящиеся осколки.", response: "Убейте ticks до Slam или сохраните мобильность для веера." },
      { name: "Bestial Rage", role: "Хилы", tone: "danger", action: "HEAL", icon: "/assets/wow/lairs/spells/spell_shadow_unholyfrenzy.jpg", description: "Bloodclaws периодически усиливают наносимый урон.", response: "Быстро убейте Bloodclaws и используйте защиты на их текущую цель." },
    ],
    loot: [
      { name: "Devouring Vanguard's Soulcleaver", slot: "Топор 2Р", armor: "Оружие", stats: "Сила", priority: "Высокий" },
      { name: "Voidbender's Spire", slot: "Посох 2Р", armor: "Оружие", stats: "Интеллект", priority: "Высокий" },
      { name: "Encroaching Shadow Signet", slot: "Кольцо", armor: "Универсальный", stats: "Вторичные", priority: "Высокий" }, ...sharedWorldLoot,
    ],
  },
  ...seasonGuideBosses,
];

const verifiedBossSlugs = new Set(["nymrissa-wavecaller", "luashal", "cragpine", "thormbelan", "predaxas"]);

const spellIds: Record<string, number> = {
  "Alluring Bubble": 1257717,
  "Swirling Whirlpools": 1258668,
  "Chilling Frost": 1313393,
  "Abyssal Rain": 1260837,
  "Iceblade Flurry": 1282937,
  "Unending Tides": 1294867,
  "Waterfog Shield": 1273091,
  "Frost Burst": 1313450,
  "Water Jet": 1258901,
  "Radiant Sunder": 1243963,
  "Dawncrazed Halo": 1276436,
  "Dawnfire Breath": 1276247,
  "Radiant Flare": 1258427,
  Rootquake: 1235131,
  "Ancient Seeds": 1257906,
  "War Club": 1235144,
  "Scintillating Shard": 1257825,
  "Shredding Tendrils": 1258639,
  "Radiant Mote": 1257320,
  Regurgitation: 1276193,
  "Seismic Slam": 1276320,
  Voidscatter: 1276884,
  "Bestial Rage": 1277711,
};

const itemIds: Record<string, number> = {
  "Tidepiercer's Bubble Popper": 268199,
  "Bubblefin Splash Guard": 268262,
  "Frostscale's Mystic Frond": 268263,
  "Swelling Sea Spaulders": 268226,
  "Tidebound Sorceress's Robes": 268221,
  "Rising Tide Wristguards": 268217,
  "Grips of Swirling Fury": 268238,
  "Cincture of the Abyssal Grotto": 268232,
  "Forgotten Grotto Girdle": 268244,
  "Breakwater Boots": 268247,
  "Alluring Bubbleband": 268266,
  "Wavecaller's Seastone": 270167,
  "Dawncrazed Beast Cleaver": 250451,
  "Scepter of the Unbound Light": 250453,
  "Radiant Eversong Scepter": 250447,
  "Bramblestalker's Feathered Cowl": 250459,
  "Host Commander's Casque": 250458,
  "Wretched Scholar's Gilded Robe": 250456,
  "Devouring Outrider's Chausses": 250457,
  "Forgotten Farstrider's Insignia": 250462,
  "Forest Sentinel's Savage Longbow": 250450,
  "Cragtender Bulwark": 250446,
  "Chain of the Ancient Watcher": 250461,
  "Beastly Blossombarb": 250455,
  "Blooming Thornblade": 250452,
  "Skulking Nettledirk": 250449,
  "Devouring Vanguard's Soulcleaver": 250454,
  "Voidbender's Spire": 250448,
  "Encroaching Shadow Signet": 250460,
};

const mechanicTags: Record<string, MechanicTag[]> = {
  "Alluring Bubble": ["TARGET_PRIORITY", "HARD_CC"],
  "Swirling Whirlpools": ["DODGE", "MOVE"],
  "Chilling Frost": ["SOAK", "MOVE"],
  "Abyssal Rain": ["DEFENSIVE"],
  "Iceblade Flurry": ["TANK_SWAP", "DEFENSIVE"],
  "Unending Tides": ["DEFENSIVE"],
  "Waterfog Shield": ["TARGET_PRIORITY"],
  "Frost Burst": ["SOAK", "DEFENSIVE"],
  "Water Jet": ["TANK_SWAP", "MOVE"],
  "Radiant Sunder": ["DODGE", "MOVE"],
  "Dawncrazed Halo": ["SPREAD"],
  "Dawnfire Breath": ["FRONTAL", "DODGE"],
  "Radiant Flare": ["DODGE", "DEFENSIVE"],
  Rootquake: ["DEFENSIVE"],
  "Ancient Seeds": ["DODGE", "MOVE"],
  "Angry Treants": ["TARGET_PRIORITY", "HARD_CC"],
  "War Club": ["DEFENSIVE"],
  "Scintillating Shard": ["SOAK"],
  "Shredding Tendrils": ["MOVE"],
  "Radiant Mote": ["SPREAD", "MOVE"],
  Regurgitation: ["TARGET_PRIORITY"],
  "Seismic Slam": ["DODGE", "MOVE"],
  Voidscatter: ["DODGE"],
  "Bestial Rage": ["TARGET_PRIORITY", "DEFENSIVE"],
};

const mechanicActors: Record<string, string> = {
  "Waterfog Shield": "Bubblefin Frostscale",
  "Frost Burst": "Frost Orb",
  Voidscatter: "Voidtick",
  "Bestial Rage": "Regurgitated Bloodclaw",
};

const nymrissaMythicMechanics: Mechanic[] = [
  { name: "Waterfog Shield", role: "DPS", tone: "control", action: "KILL", tags: ["TARGET_PRIORITY"], spellId: 1273091, castBy: "Bubblefin Frostscale", sourceUrl: lairGuideSourceUrl, icon: "/assets/wow/lairs/spells/spell_winston_bubble.jpg", description: "Аура снижает урон по ближайшим мурлокам.", response: "На Mythic убивайте Bubblefin Frostscale первым, затем остальных мурлоков." },
  { name: "Frost Burst", role: "Все", tone: "frost", action: "SOAK", tags: ["SOAK", "DEFENSIVE"], spellId: 1313450, castBy: "Frost Orb", sourceUrl: lairGuideSourceUrl, icon: "/assets/wow/lairs/spells/spell_mage_frostbomb.jpg", description: "Каждый подобранный Frost Orb наносит рейдовый frost-урон.", response: "Подбирайте шары по одному, растягивая срабатывания; хилы назначают CD, игроки используют личные защиты." },
  { name: "Water Jet", role: "Танки", tone: "tank", action: "TANK", tags: ["TANK_SWAP", "MOVE"], spellId: 1258901, castBy: "Nymrissa Wavecaller", sourceUrl: lairGuideSourceUrl, icon: "/assets/wow/lairs/spells/ability_mage_waterjet.jpg", description: "Mythic-луч наносит сильный стакающийся урон, отталкивает танка и очищает ледяные зоны.", response: "Меняйтесь на каждый Water Jet и направляйте отбрасывание через Lingering Frost, освобождая арену." },
];

const positioningByBoss: Record<string, Boss["positioning"]> = {
  "nymrissa-wavecaller": [
    { label: "Рейд", text: "Стойте близко к боссу и складывайте Frost Orbs плотно рядом с ним." },
    { label: "Волны", text: "Заранее найдите разрыв в Swirling Whirlpools; перед Pop! сместитесь ближе к центру." },
    { label: "Танки", text: "Меняйтесь по Iceblade Flurry; на Mythic — на каждый Water Jet." },
  ],
  luashal: [
    { label: "Танки", text: "Разверните Dawnfire Breath от группы: конус направлен в текущую цель." },
    { label: "Рейд", text: "Разойдитесь с Dawncrazed Halo и не стойте на Blinding Fissure." },
    { label: "Движение", text: "Во время Radiant Flare проходите между волнами Radiant Embers." },
  ],
  cragpine: [
    { label: "Рейд", text: "Не стойте рядом с плавающими Ancient Seeds." },
    { label: "DPS", text: "Быстро убивайте преследующих игроков Angry Treants." },
    { label: "Танки", text: "Держите активную защиту под тяжёлые удары War Club." },
  ],
  thormbelan: [
    { label: "SOAK", text: "Перехватывайте Scintillating Shard до попадания — иначе весь рейд будет оглушён." },
    { label: "MOVE", text: "Отбегайте от босса при Shredding Tendrils, пока притягивание не прекратится." },
    { label: "SPREAD", text: "Разносите Radiant Mote, чтобы взрыв и дезориентация не задели союзников." },
  ],
  predaxas: [
    { label: "Танки", text: "Забирайте появившихся Regurgitated Bloodclaws." },
    { label: "Рейд", text: "Учитывайте отбрасывание Seismic Slam и держите свободное место за спиной." },
    { label: "DPS", text: "Следите за Voidticks: Seismic Slam запускает их Voidscatter." },
  ],
};

export const bosses: Boss[] = rawBosses.map((boss) => {
  if (!verifiedBossSlugs.has(boss.slug)) return boss;
  const mechanics: Mechanic[] = boss.mechanics.map((mechanic) => ({
    ...mechanic,
    spellId: spellIds[mechanic.name],
    tags: mechanicTags[mechanic.name] ?? [mechanic.action],
    castBy: mechanicActors[mechanic.name] ?? boss.name,
    sourceUrl: lairGuideSourceUrl,
  }));
  if (boss.slug === "nymrissa-wavecaller") mechanics.push(...nymrissaMythicMechanics);
  return {
    ...boss,
    mechanics,
    loot: boss.loot.map((item) => ({
      ...item,
      itemId: itemIds[item.name],
      difficulty: boss.kind === "lair" ? "World / Normal / Heroic / Mythic" : "World",
      itemLevel: boss.kind === "lair" ? "Зависит от сложности" : "246",
      chanceStatus: "unknown" as const,
      sourceUrl: lairGuideSourceUrl,
    })),
    positioning: positioningByBoss[boss.slug],
    sourceUrl: lairGuideSourceUrl,
    lastVerifiedAt: lairGuideLastVerifiedAt,
  };
});

const englishText: Record<string, string> = {
  "Все": "All",
  "Танки": "Tanks",
  "Хилы": "Healers",
  "Голос глубин": "Voice of the Depths",
  "Ослеплённая рассветом": "Blinded by the Dawn",
  "Сердце древнего леса": "Heart of the Ancient Forest",
  "Искажённый Светом": "Twisted by the Light",
  "Голод Пустоты": "Hunger of the Void",
  "Она не поднимает волну. Она приказывает морю вспомнить, кого оно должно поглотить.": "She does not raise the tide. She commands the sea to remember whom it must consume.",
  "Свет сделал её прекрасной. Избыток Света сделал её чудовищем.": "The Light made her beautiful. Too much Light made her a monster.",
  "Под каждым корнем спит ярость, которая старше любого королевства.": "Beneath every root sleeps a fury older than any kingdom.",
  "Когда-то кроткий зверь, теперь он несёт Lightbloom как открытую рану.": "Once a gentle beast, it now carries Lightbloom like an open wound.",
  "Он не спит, не думает и не охотится. Он просто продолжает есть.": "It does not sleep, think, or hunt. It simply keeps eating.",
  "Первый босс системы Lairs: отдельный инстанс, четыре уровня сложности и полноценные рейдовые механики без длинного треша.": "The first Lair boss: a dedicated instance with four difficulty levels and full raid mechanics without a long trash section.",
  "Подвижный бой с лучами, расколотой ареной и постоянным контролем дистанции.": "A movement-heavy fight with beams, a fractured arena, and constant spacing checks.",
  "Адд-чек и проверка рейдового лечения: тренты преследуют игроков, а семена заполняют арену.": "An add-control and raid-healing check: treants chase players while seeds fill the arena.",
  "Общий для всех ролей бой на исполнение: перехватывайте Shards, выбегайте из Tendrils и разносите Motes.": "An execution fight for every role: intercept Shards, run out of Tendrils, and spread Motes.",
  "Хаотичный бой с отбрасываниями и аддами: позиция предыдущей волны определяет опасность следующей.": "A chaotic fight with knockbacks and adds: the previous wave's position determines the danger of the next one.",
  "1 раз в неделю · на каждой сложности": "Once per week · per difficulty",
  "Еженедельная ротация": "Weekly rotation",
  "По группе": "Scale with the group",
  "Остальные": "Remaining players",
  "World: до 40 · N/H: 10–30 · Mythic: 15–25": "World: up to 40 · N/H: 10–30 · Mythic: 15–25",
  "Не задано": "Not specified",
  "Открытая мировая группа": "Open world group",
  "World — соло-очередь; остальные — готовая группа": "World — solo queue; other difficulties — premade group",
  "Отдельная добыча на каждой сложности": "Separate loot lockout for each difficulty",
  "Мировой квест со значком черепа": "World quest marked with a skull icon",
  "1 гарантированная награда в неделю": "One guaranteed reward per week",
  "Автосбор · до 40": "Automatic group · up to 40",
  "Вход соло, группа собирается внутри": "Enter solo; the group forms inside",
  "Мягкие проверки позиции и урона": "Forgiving positioning and damage checks",
  "Frost Orbs взрываются без soak": "Unsoaked Frost Orbs explode",
  "Новые адды, Water Jet и жёсткий тайминг": "New adds, Water Jet, and a strict timing check",
  "Открытая группа": "Open group",
  "Один босс ротации активен каждую неделю": "One rotating boss is active each week",
  "Bubblefin идут к пузырю из кипящих луж. Добравшийся адд превращается в Berserker и пульсирует по рейду.": "Bubblefin move toward a bubble formed from boiling pools. An add that reaches it becomes a Berserker and pulses damage across the raid.",
  "Фокус аддов → массовый контроль → Frostscale первым на Mythic.": "Focus the adds → use crowd control → kill Frostscale first on Mythic.",
  "DoT оставляет Frost Orbs. Каждый подобранный шар создаёт скользкую зону Lingering Frost.": "The DoT leaves Frost Orbs. Each collected orb creates a slippery Lingering Frost area.",
  "Складывайте шары плотно у босса; на Heroic не оставляйте ни одного.": "Drop the orbs tightly near the boss; on Heroic, leave none unsoaked.",
  "Четыре секунды тяжёлого урона по рейду перед каждой волной аддов. На Heroic усиливает будущий frost-урон.": "Four seconds of heavy raid damage before each add wave. On Heroic, it increases subsequent Frost damage.",
  "Назначьте healing CD на каждую волну, личные защиты — со второй.": "Assign a healing cooldown to each wave; use personal defensives from the second wave onward.",
  "Серия ударов оставляет стакающийся дебафф +20% к следующему Flurry.": "A series of strikes leaves a stacking debuff that increases the next Flurry's damage by 20%.",
  "Меняйтесь регулярно, не позволяя стакам разогнать следующий удар.": "Swap regularly so the stacks do not amplify the next hit too far.",
  "Кольца волн сходятся к центру, оставляя единственный безопасный проход.": "Rings of waves converge on the center, leaving a single safe opening.",
  "Сначала найдите разрыв, затем сместитесь ближе к центру перед Pop!": "Find the opening first, then move closer to the center before Pop!",
  "На шестой минуте Нимрисса начинает непрерывно заливать арену — мягкий enrage превращается в вайп.": "At six minutes, Nymrissa begins flooding the arena continuously, turning the soft enrage into a wipe.",
  "Закончите бой до 6:00; сохраните сильные защиты и лечение на финальную часть.": "Finish the fight before 6:00; save strong defensives and healing cooldowns for the final stretch.",
  "Удар раскалывает землю и оставляет Blinding Fissure.": "The strike splits the ground and leaves a Blinding Fissure.",
  "Не стойте по линии разлома и сохраняйте свободный сектор.": "Stay out of the fissure line and keep a clear escape sector.",
  "Отмеченные игроки наносят урон вокруг себя.": "Marked players deal damage around themselves.",
  "Разойдитесь до срабатывания; не пересекайте танков.": "Spread before it triggers and do not cross through the tanks.",
  "Тяжёлый фронтальный конус Radiant-урона.": "A heavy frontal cone of Radiant damage.",
  "Разверните босса от рейда и не двигайте без причины.": "Face the boss away from the raid and do not move it unnecessarily.",
  "Сильный рейдовый урон выпускает волны Radiant Embers из разломов.": "Heavy raid damage releases waves of Radiant Embers from the fissures.",
  "Рейдовый CD и движение между волнами, не через них.": "Use a raid cooldown and move between the waves, not through them.",
  "Тяжёлые импульсы урона по всему рейду пробуждают лес.": "Heavy damage pulses hit the entire raid as the forest awakens.",
  "Чередуйте рейдовые CD, добивайте раненых до следующего тика.": "Rotate raid cooldowns and top injured players before the next tick.",
  "Парящие семена наносят урон всем рядом и ограничивают пространство.": "Floating seeds damage nearby players and restrict the available space.",
  "Держите строй свободным и не загоняйте рейд в край.": "Keep a loose formation and do not force the raid against the edge.",
  "Тренты фиксируются на игроках и преследуют их до смерти.": "Treants fixate on players and pursue them until killed.",
  "Сводите аддов под cleave, замедляйте и убивайте быстро.": "Group the adds for cleave, slow them, and kill them quickly.",
  "Тяжёлые автоатаки резко пробивают активного танка.": "Heavy melee attacks punish the active tank.",
  "Держите mitigation постоянно, подстрахуйте внешним CD.": "Maintain active mitigation and cover dangerous hits with an external cooldown.",
  "Снаряд должен быть перехвачен игроком; если он долетит до арены, весь рейд будет оглушён.": "A player must intercept the projectile; if it reaches the arena, the entire raid is stunned.",
  "Назначьте ближайшего игрока на каждый Shard и не дублируйте soak.": "Assign the nearest player to each Shard and do not double-soak it.",
  "Щупальца притягивают игроков к боссу и наносят урон, пока цель не отойдёт достаточно далеко.": "The tendrils pull players toward the boss and deal damage until the target moves far enough away.",
  "Сразу бегите от босса; заранее держитесь не у центра его модели.": "Run away from the boss immediately; avoid standing at the center of its model beforehand.",
  "Метка наносит урон и дезориентирует всех игроков рядом в момент окончания.": "When it expires, the mark damages and disorients all nearby players.",
  "Разнесите Motes по свободным секторам и не пересекайтесь на возврате.": "Spread the Motes into clear sectors and do not cross paths while returning.",
  "Босс исторгает прошлую добычу — Bloodclaws сразу атакуют рейд.": "The boss regurgitates former prey; Bloodclaws immediately attack the raid.",
  "Заберите аддов и соберите под фронтом босса для cleave.": "Pick up the adds and group them near the boss for cleave while keeping them out of the frontal.",
  "Удар отбрасывает игроков и существ, запуская дополнительные эффекты.": "The slam knocks back players and creatures, triggering additional effects.",
  "Не стойте спиной к краю; вынесите аддов в предсказуемый сектор.": "Do not stand with your back to the edge; position the adds in a predictable sector.",
  "Voidticks реагируют на Slam и выпускают расходящиеся осколки.": "Voidticks react to the Slam by releasing spreading shards.",
  "Убейте ticks до Slam или сохраните мобильность для веера.": "Kill the Voidticks before the Slam or save mobility to avoid the fan of shards.",
  "Bloodclaws периодически усиливают наносимый урон.": "Bloodclaws periodically increase their damage dealt.",
  "Быстро убейте Bloodclaws и используйте защиты на их текущую цель.": "Kill Bloodclaws quickly and use defensives on their current target.",
  "Аура снижает урон по ближайшим мурлокам.": "The aura reduces damage taken by nearby murlocs.",
  "На Mythic убивайте Bubblefin Frostscale первым, затем остальных мурлоков.": "On Mythic, kill the Bubblefin Frostscale first, then the remaining murlocs.",
  "Каждый подобранный Frost Orb наносит рейдовый frost-урон.": "Each collected Frost Orb deals Frost damage to the raid.",
  "Подбирайте шары по одному, растягивая срабатывания; хилы назначают CD, игроки используют личные защиты.": "Collect the orbs one at a time to stagger the hits; healers assign cooldowns and players use personal defensives.",
  "Mythic-луч наносит сильный стакающийся урон, отталкивает танка и очищает ледяные зоны.": "This Mythic beam deals heavy stacking damage, knocks the tank back, and clears icy areas.",
  "Меняйтесь на каждый Water Jet и направляйте отбрасывание через Lingering Frost, освобождая арену.": "Swap for every Water Jet and aim the knockback through Lingering Frost to clear the arena.",
  "Рейд": "Raid",
  "Волны": "Waves",
  "Движение": "Movement",
  "Стойте близко к боссу и складывайте Frost Orbs плотно рядом с ним.": "Stay close to the boss and place Frost Orbs tightly beside it.",
  "Заранее найдите разрыв в Swirling Whirlpools; перед Pop! сместитесь ближе к центру.": "Identify the opening in Swirling Whirlpools early; move closer to the center before Pop!",
  "Меняйтесь по Iceblade Flurry; на Mythic — на каждый Water Jet.": "Swap for Iceblade Flurry; on Mythic, swap for every Water Jet.",
  "Разверните Dawnfire Breath от группы: конус направлен в текущую цель.": "Face Dawnfire Breath away from the group; the cone targets the current tank.",
  "Разойдитесь с Dawncrazed Halo и не стойте на Blinding Fissure.": "Spread with Dawncrazed Halo and stay out of Blinding Fissure.",
  "Во время Radiant Flare проходите между волнами Radiant Embers.": "During Radiant Flare, move between the waves of Radiant Embers.",
  "Не стойте рядом с плавающими Ancient Seeds.": "Do not stand near floating Ancient Seeds.",
  "Быстро убивайте преследующих игроков Angry Treants.": "Quickly kill Angry Treants that are chasing players.",
  "Держите активную защиту под тяжёлые удары War Club.": "Keep active mitigation running for War Club's heavy hits.",
  "Перехватывайте Scintillating Shard до попадания — иначе весь рейд будет оглушён.": "Intercept Scintillating Shard before impact or the entire raid will be stunned.",
  "Отбегайте от босса при Shredding Tendrils, пока притягивание не прекратится.": "Run away from the boss during Shredding Tendrils until the pull ends.",
  "Разносите Radiant Mote, чтобы взрыв и дезориентация не задели союзников.": "Spread Radiant Mote so its damage and disorient do not hit allies.",
  "Забирайте появившихся Regurgitated Bloodclaws.": "Pick up newly spawned Regurgitated Bloodclaws.",
  "Учитывайте отбрасывание Seismic Slam и держите свободное место за спиной.": "Plan for Seismic Slam's knockback and keep clear space behind you.",
  "Следите за Voidticks: Seismic Slam запускает их Voidscatter.": "Watch the Voidticks: Seismic Slam triggers their Voidscatter.",
  "Посох 2Р": "Two-handed staff",
  "Щит": "Shield",
  "Левая рука": "Off-hand",
  "Плечи": "Shoulders",
  "Грудь": "Chest",
  "Запястья": "Wrists",
  "Кисти": "Hands",
  "Пояс": "Waist",
  "Ступни": "Feet",
  "Кольцо": "Ring",
  "Аксессуар": "Trinket",
  "Топор 1Р": "One-handed axe",
  "Дробящее 1Р": "One-handed mace",
  "Голова": "Head",
  "Ноги": "Legs",
  "Лук": "Bow",
  "Шея": "Neck",
  "Древковое 2Р": "Two-handed polearm",
  "Меч 1Р": "One-handed sword",
  "Кинжал 1Р": "One-handed dagger",
  "Топор 2Р": "Two-handed axe",
  "Оружие": "Weapon",
  "Латы": "Plate",
  "Ткань": "Cloth",
  "Кольчуга": "Mail",
  "Кожа": "Leather",
  "Универсальный": "Universal",
  "Ловкость": "Agility",
  "Интеллект": "Intellect",
  "Сила": "Strength",
  "Сила / Интеллект": "Strength / Intellect",
  "Ловкость / Интеллект": "Agility / Intellect",
  "Вторичные": "Secondary stats",
  "Основная характеристика": "Primary stat",
  "Высокий": "High",
  "Средний": "Medium",
  "Лучший выбор": "Best pick",
  "Зависит от сложности": "Depends on difficulty",
};

function translateBossToEnglish(boss: Boss): Boss {
  const translate = (value: string) => englishText[value] ?? value;
  return {
    ...boss,
    title: translate(boss.title),
    flavor: translate(boss.flavor),
    summary: translate(boss.summary),
    reset: translate(boss.reset),
    composition: {
      tanks: translate(boss.composition.tanks),
      healers: translate(boss.composition.healers),
      dps: translate(boss.composition.dps),
      size: translate(boss.composition.size),
    },
    farm: {
      ...boss.farm,
      access: translate(boss.farm.access),
      lockout: translate(boss.farm.lockout),
      best: translate(boss.farm.best),
    },
    difficulties: boss.difficulties.map((difficulty) => ({
      ...difficulty,
      group: translate(difficulty.group),
      reward: translate(difficulty.reward),
      note: translate(difficulty.note),
    })),
    mechanics: boss.mechanics.map((mechanic) => ({
      ...mechanic,
      role: translate(mechanic.role) as Mechanic["role"],
      description: translate(mechanic.description),
      response: translate(mechanic.response),
    })),
    loot: boss.loot.map((item) => ({
      ...item,
      slot: translate(item.slot),
      armor: translate(item.armor),
      stats: translate(item.stats),
      priority: translate(item.priority),
      difficulty: item.difficulty ? translate(item.difficulty) : item.difficulty,
      itemLevel: item.itemLevel ? translate(item.itemLevel) : item.itemLevel,
    })),
    positioning: boss.positioning?.map((item) => ({ label: translate(item.label), text: translate(item.text) })),
  };
}

const bossesEn = bosses.map(translateBossToEnglish);

export function getBoss(slug: string, locale: "ru" | "en" = "ru") {
  return (locale === "en" ? bossesEn : bosses).find((boss) => boss.slug === slug);
}
