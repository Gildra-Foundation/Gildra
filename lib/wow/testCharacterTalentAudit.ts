import type { TalentSpecTheme } from "@/lib/talentSpecThemes";

export type CharacterAuditIssue = {
  id: string;
  tone: "critical" | "recommended" | "optional";
  title: string;
  detail: string;
  gain: number;
  action: "Исправить" | "Сравнить" | "Оптимизировать";
  iconUrl: string;
};

export type CharacterTalentNode = {
  name: string;
  iconUrl: string;
  description: string;
  issue?: boolean;
};

export type CharacterTalentAuditProfile = {
  current: CharacterTalentNode[];
  recommended: CharacterTalentNode[];
  changes: Array<{
    from: string;
    to: string;
    gain: number;
    problem: string;
    reason: string;
    outcome: string;
  }>;
  issues: CharacterAuditIssue[];
  metricLabel: "DPS" | "HPS" | "защиты" | "эфф.";
  statPriority: string;
  signature: string;
  scenario: TalentScenario;
  verdict: string;
  assumptions: string[];
  currentScore: number;
  recommendedScore: number;
};

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

type TalentSeed = {
  core: [string, string, string, string];
  swaps: [string, string, string, string];
  stat: string;
};

const seeds: Record<string, TalentSeed> = {
  "balance-druid": { core: ["Звёздный поток", "Звездопад", "Воплощение: Избранный Элуны", "Новолуние"], swaps: ["Воин Элуны", "Астральное причастие", "Грибной рост", "Сила Голдринна"], stat: "Искусность → Скорость" },
  "feral-druid": { core: ["Свирепый укус", "Разорвать", "Берсерк", "Первобытный гнев"], swaps: ["Лунное вдохновение", "Неистовое бешенство", "Кровавый запах", "Хищный инстинкт"], stat: "Искусность → Критический удар" },
  "guardian-druid": { core: ["Железный мех", "Размах", "Воплощение: Страж Урсока", "Лунный огонь"], swaps: ["Щетинистый мех", "Уязвимая плоть", "Клык Урсока", "Неукротимый страж"], stat: "Универсальность → Искусность" },
  "restoration-druid": { core: ["Омоложение", "Буйный рост", "Расцвет", "Древо Жизни"], swaps: ["Изобилие", "Фотосинтез", "Питательный покров", "Весенние цветы"], stat: "Скорость → Искусность" },
  "devastation-evoker": { core: ["Огненное дыхание", "Вечный выброс", "Глубокий вдох", "Дезинтеграция"], swaps: ["Искра жестокости", "Разрушительная мощь", "Пирокластический поток", "Бесконечность"], stat: "Искусность → Критический удар" },
  "preservation-evoker": { core: ["Изумрудный сон", "Обращение", "Дыхание снов", "Стазис"], swaps: ["Золотой час", "Эхо", "Темпоральная аномалия", "Двойное время"], stat: "Искусность → Скорость" },
  "augmentation-evoker": { core: ["Эбеновая мощь", "Дыхание эпох", "Предвидение", "Извержение"], swaps: ["Драконье чутьё", "Могущество аспектов", "Судьбоносное зеркало", "Пески времени"], stat: "Интеллект → Критический удар" },
  "discipline-priest": { core: ["Искупление вины", "Слово силы: Щит", "Схизма", "Исповедь"], swaps: ["Божественная звезда", "Сумеречное равновесие", "Очищение зла", "Сияние силы"], stat: "Скорость → Критический удар" },
  "holy-priest": { core: ["Слово Света: Безмятежность", "Молитва восстановления", "Божественный гимн", "Апофеоз"], swaps: ["Круг исцеления", "Божественный образ", "Свет наару", "Пробуждение Света"], stat: "Искусность → Критический удар" },
  "shadow-priest": { core: ["Извержение Бездны", "Всепожирающая чума", "Пытка разума", "Темное вознесение"], swaps: ["Подчинитель разума", "Безумие Бездны", "Темное прозрение", "Древнее безумие"], stat: "Скорость → Искусность" },
  "blood-death-knight": { core: ["Удар смерти", "Костяной щит", "Пьющий кровь", "Танцующее руническое оружие"], swaps: ["Разрыв сердца", "Кровопийца", "Ненасытность", "Красная жажда"], stat: "Универсальность → Скорость" },
  "frost-death-knight": { core: ["Ледяной удар", "Воющий ветер", "Ледяной столп", "Дыхание Синдрагосы"], swaps: ["Истребление", "Ледяная шапка", "Лавина", "Абсолютный ноль"], stat: "Искусность → Критический удар" },
  "unholy-death-knight": { core: ["Апокалипсис", "Темное превращение", "Вспышка болезни", "Армия мертвых"], swaps: ["Мор", "Осквернение", "Вечное проклятие", "Нечестивый натиск"], stat: "Искусность → Скорость" },
  "beast-mastery-hunter": { core: ["Команда «Взять!»", "Звериный гнев", "Убийственный выстрел", "Зов дикой природы"], swaps: ["Шквал", "Кровопролитие", "Звериный компаньон", "Вожак стаи"], stat: "Искусность → Скорость" },
  "marksmanship-hunter": { core: ["Прицельный выстрел", "Быстрая стрельба", "Меткий выстрел", "Залп"], swaps: ["Смертельный выстрел", "Верный прицел", "Гидра", "Ритм стрельбы"], stat: "Критический удар → Искусность" },
  "survival-hunter": { core: ["Удар ящера", "Команда «Взять!»", "Координированная атака", "Бомба огня Скверны"], swaps: ["Разделка туши", "Наконечник копья", "Кровоискатель", "Ярость орла"], stat: "Скорость → Критический удар" },
  "assassination-rogue": { core: ["Расправа", "Отравление", "Вендетта", "Рваная рана"], swaps: ["Кровавый вихрь", "Королевский яд", "Слепая зона", "Ядовитая бомба"], stat: "Искусность → Критический удар" },
  "outlaw-rogue": { core: ["Устранение", "Выстрел из пистоли", "Промеж глаз", "Череда убийств"], swaps: ["Метка смерти", "Бросок костей", "Скрытая возможность", "Точный расчет"], stat: "Универсальность → Скорость" },
  "subtlety-rogue": { core: ["Теневой танец", "Потрошение", "Теневые клинки", "Секретный прием"], swaps: ["Мрачная тень", "Разрыв тьмы", "Флагелляция", "Неожиданный прием"], stat: "Искусность → Универсальность" },
  "elemental-shaman": { core: ["Выброс лавы", "Земной шок", "Повелитель стихий", "Гроза"], swaps: ["Ледяная ярость", "Первозданная волна", "Эхо стихий", "Вестник бури"], stat: "Искусность → Скорость" },
  "enhancement-shaman": { core: ["Удар бури", "Вскипание лавы", "Дух дикого зверя", "Роковые ветра"], swaps: ["Ледяной клинок", "Стихийные духи", "Град", "Наследие ведьмы"], stat: "Скорость → Искусность" },
  "restoration-shaman": { core: ["Цепное исцеление", "Тотем целительного прилива", "Первозданная волна", "Духовная связь"], swaps: ["Ливень", "Высвободить жизнь", "Тотем облачного взрыва", "Живой поток"], stat: "Критический удар → Универсальность" },
  "holy-paladin": { core: ["Шок небес", "Маяк Света", "Божественный благовест", "Гнев карателя"], swaps: ["Свет зари", "Маяк добродетели", "Пробуждение", "Священный призматик"], stat: "Критический удар → Скорость" },
  "protection-paladin": { core: ["Щит праведника", "Освящение", "Око Тира", "Ревностный защитник"], swaps: ["Последний защитник", "Божественный резонанс", "Оплот порядка", "Страж древних королей"], stat: "Скорость → Искусность" },
  "retribution-paladin": { core: ["Вердикт храмовника", "Испепеляющий след", "Божественная буря", "Последняя расплата"], swaps: ["Серафим", "Божественный молот", "Пепельное пробуждение", "Правосудие Света"], stat: "Искусность → Критический удар" },
  "arcane-mage": { core: ["Чародейский всплеск", "Чародейские стрелы", "Касание мага", "Мощь тайной магии"], swaps: ["Сверхновая", "Гармония тайной магии", "Сфера магов", "Искусный заклинатель"], stat: "Искусность → Критический удар" },
  "fire-mage": { core: ["Огненная глыба", "Возгорание", "Огненный взрыв", "Пламя феникса"], swaps: ["Живая бомба", "Из жара в пламя", "Солнечная ярость", "Разжигание"], stat: "Скорость → Универсальность" },
  "frost-mage": { core: ["Ледяное копье", "Ледяные пальцы", "Стылая кровь", "Ледяной шар"], swaps: ["Морозный луч", "Раскалывающий лед", "Кометная буря", "Зимний прилив"], stat: "Критический удар → Искусность" },
  "arms-warrior": { core: ["Смертельный удар", "Превосходство", "Колоссальный удар", "Вихрь клинков"], swaps: ["Рассекающий удар", "Кровопускание", "Добивание", "Точность палача"], stat: "Критический удар → Скорость" },
  "fury-warrior": { core: ["Кровожадность", "Яростный выпад", "Буйство", "Безрассудство"], swaps: ["Ярость Одина", "Аннигилятор", "Вихрь", "Танец смерти"], stat: "Скорость → Искусность" },
  "protection-warrior": { core: ["Мощный удар щитом", "Стойкость к боли", "Реванш", "Стена щитов"], swaps: ["Удар грома", "Непробиваемая стена", "Каратель", "Несокрушимая сила"], stat: "Скорость → Универсальность" },
  "affliction-warlock": { core: ["Агония", "Нестабильное колдовство", "Пагуба", "Похищение души"], swaps: ["Призрачная сингулярность", "Посеять семена", "Зловредная порча", "Неизбежная гибель"], stat: "Искусность → Скорость" },
  "demonology-warlock": { core: ["Рука Гул'дана", "Призыв зловещих охотников", "Демонический тиран", "Взрыв бесов"], swaps: ["Портал в Пустоту", "Демоническая сила", "Гримуар: страж Скверны", "Коварство демонов"], stat: "Скорость → Искусность" },
  "destruction-warlock": { core: ["Стрела Хаоса", "Испепеление", "Огненный ливень", "Призыв инфернала"], swaps: ["Огонь и сера", "Истребление", "Пламя Хаоса", "Безумие Азж'Акира"], stat: "Критический удар → Скорость" },
  "brewmaster-monk": { core: ["Очищающий отвар", "Небесный отвар", "Удар бочонком", "Призыв Нюцзао"], swaps: ["Взрывная бочка", "Крепкий отвар", "Высокая терпимость", "Обугленные страсти"], stat: "Универсальность → Искусность" },
  "windwalker-monk": { core: ["Удар восходящего солнца", "Неистовые кулаки", "Буря, земля и огонь", "Удар крутящегося дракона"], swaps: ["Безмятежность", "Белый тигр", "Нефритовый ветер", "Последовательность ударов"], stat: "Универсальность → Критический удар" },
  "mistweaver-monk": { core: ["Заживляющий туман", "Громовой чай", "Дар Шей-луна", "Призыв Юй-лун"], swaps: ["Туманное облако", "Песнь Чи-Цзи", "Нефритовая связь", "Благотворное омоложение"], stat: "Скорость → Универсальность" },
  "havoc-demon-hunter": { core: ["Танец клинков", "Удар Хаоса", "Метаморфоза", "Охота"], swaps: ["Обстрел Скверны", "Сущность разрушения", "Инерция", "Оскверненный клинок"], stat: "Критический удар → Искусность" },
  "vengeance-demon-hunter": { core: ["Демонические шипы", "Огненное клеймо", "Взрывная душа", "Метаморфоза"], swaps: ["Разлом души", "Последнее прибежище", "Кормление демона", "Пылающая кровь"], stat: "Скорость → Универсальность" },
  "devourer-demon-hunter": { core: ["Разрыв реальности", "Пожирание Бездны", "Голодная метка", "Облик аннигилятора"], swaps: ["Эхо глефы", "Пасть Бездны", "Темный импульс", "Неутолимый голод"], stat: "Искусность → Критический удар" },
};

const icon = (name: string) => `https://wow.zamimg.com/images/wow/icons/large/${name}.jpg`;

const classIcons: Record<string, string[]> = {
  druid: ["spell_nature_starfall", "ability_druid_eclipse", "ability_druid_mangle2", "ability_druid_berserk", "spell_nature_healingtouch", "ability_druid_flourish"],
  evoker: ["ability_evoker_firebreath", "ability_evoker_disintegrate", "ability_evoker_deepbreath", "ability_evoker_rewind", "ability_evoker_ebonmight", "ability_evoker_eruption"],
  priest: ["spell_holy_powerwordshield", "spell_holy_penance", "spell_holy_guardianspirit", "spell_holy_divinehymn", "spell_shadow_shadowwordpain", "spell_shadow_dispersion"],
  deathknight: ["spell_deathknight_bloodpresence", "spell_deathknight_deathstrike", "spell_deathknight_frostpresence", "spell_frost_frostnova", "spell_deathknight_unholypresence", "spell_deathknight_armyofthedead"],
  hunter: ["ability_hunter_killcommand", "ability_hunter_bestialdiscipline", "ability_hunter_aimedshot", "ability_hunter_cobrashot", "ability_hunter_camouflage", "ability_hunter_harass"],
  rogue: ["ability_rogue_eviscerate", "ability_rogue_deadenednerves", "ability_rogue_rollthebones", "ability_rogue_pistolshot", "ability_stealth", "ability_rogue_shadowdance"],
  shaman: ["spell_shaman_lavaburst", "spell_nature_lightning", "spell_shaman_feralspirit", "ability_shaman_stormstrike", "spell_nature_healingwavegreater", "ability_shaman_healingtide"],
  paladin: ["spell_holy_holybolt", "spell_holy_searinglight", "ability_paladin_shieldofvengeance", "spell_holy_avengersshield", "spell_holy_retributionaura", "ability_paladin_finalverdict"],
  mage: ["spell_arcane_blast", "spell_arcane_arcane04", "spell_fire_fireball02", "spell_fire_flamebolt", "spell_frost_frostbolt02", "spell_frost_frozenorb"],
  warrior: ["ability_warrior_savageblow", "ability_warrior_colossussmash", "ability_warrior_rampage", "ability_warrior_innerrage", "inv_shield_05", "ability_warrior_defensivestance"],
  warlock: ["spell_shadow_curseofsargeras", "spell_shadow_unstableaffliction_3", "spell_shadow_demonform", "spell_warlock_summonwrathguard", "spell_fire_felcano", "spell_fire_fireball02"],
  monk: ["achievement_brewery_2", "ability_monk_breathoffire", "ability_monk_risingsunkick", "monk_ability_fistoffury", "ability_monk_renewingmists", "ability_monk_dragonkick"],
  demonhunter: ["ability_demonhunter_bladedance", "ability_demonhunter_chaosstrike", "ability_demonhunter_metamorphasisdps", "ability_demonhunter_fierybrand", "ability_demonhunter_soulcleave2", "spell_shadow_soulleech"],
};

function roleMetric(role: TalentSpecTheme["role"]): CharacterTalentAuditProfile["metricLabel"] {
  if (role === "tank") return "защиты";
  if (role === "healer") return "HPS";
  if (role === "support") return "эфф.";
  return "DPS";
}

export function getTestCharacterTalentAudit(theme: TalentSpecTheme, scenarioId: TalentScenarioId = "mythic-plus"): CharacterTalentAuditProfile {
  const seed = seeds[theme.slug];
  const fallback: TalentSeed = { core: [theme.specNameRu, theme.fantasy, theme.heroPaths[0].nameRu, theme.heroPaths[1].nameRu], swaps: ["Универсальный узел", "Целевой талант", "Защитный узел", "Талант специализации"], stat: "Основная характеристика" };
  const profile = seed ?? fallback;
  const pool = classIcons[theme.classKey] ?? ["inv_misc_questionmark"];
  const node = (name: string, index: number, issue = false): CharacterTalentNode => ({
    name,
    iconUrl: index === 0 ? theme.iconUrl : icon(pool[(index - 1) % pool.length]),
    description: issue ? `Этот выбор нарушает синергию специализации «${theme.specNameRu}» для выбранного контента.` : `Поддерживает стиль «${theme.fantasy.toLocaleLowerCase("ru-RU")}».`,
    issue,
  });
  const currentNames = [theme.specNameRu, profile.core[0], profile.swaps[0], profile.core[1], theme.heroPaths[0].nameRu, profile.swaps[2], profile.core[2], profile.core[3]];
  const recommendedNames = [theme.specNameRu, profile.core[0], profile.swaps[1], profile.core[1], theme.heroPaths[0].nameRu, profile.swaps[3], profile.core[2], profile.core[3]];
  const scenario = talentScenarios.find((item) => item.id === scenarioId) ?? talentScenarios[2];
  const metricLabel = scenario.group === "PvP" ? "эфф." : roleMetric(theme.role);
  const current = currentNames.map((name, index) => node(name, index, index === 2 || index === 5));
  const recommended = recommendedNames.map((name, index) => node(name, index));
  const contextualGain = (gain: number) => Number((gain * scenario.multiplier).toFixed(1));
  const changes = [
    {
      from: profile.swaps[0],
      to: profile.swaps[1],
      gain: contextualGain(1.4),
      problem: `«${profile.swaps[0]}» слишком редко даёт пользу в сценарии «${scenario.label}». Очко простаивает в ключевые моменты боя.`,
      reason: `«${profile.swaps[1]}» лучше поддерживает цель режима: ${scenario.goal}.`,
      outcome: `Проще реализовать ${scenario.priority.split(" → ")[0].toLocaleLowerCase("ru-RU")} и меньше зависеть от идеальной ситуации.`,
    },
    {
      from: profile.swaps[2],
      to: profile.swaps[3],
      gain: contextualGain(1),
      problem: `«${profile.swaps[2]}» не закрывает главную опасность этого режима: ${scenario.fight.toLocaleLowerCase("ru-RU")}.`,
      reason: `«${profile.swaps[3]}» усиливает связку с «${profile.core[0]}» именно под выбранный темп боя.`,
      outcome: "Ключевая комбинация становится стабильнее, а ошибку в ротации легче пережить.",
    },
  ];
  const specIcon = theme.iconUrl;
  const abilityIcon = (position: number) => icon(pool[position % pool.length]);
  const issues: CharacterAuditIssue[] = [
    { id: `${theme.slug}-${scenario.id}-swap-primary`, tone: "critical", title: `${profile.swaps[0]} ослабляет билд для «${scenario.label}»`, detail: `Убрать «${profile.swaps[0]}» → поставить «${profile.swaps[1]}»: талант будет полезнее в типичном бою режима.`, gain: contextualGain(1.4), action: "Исправить", iconUrl: abilityIcon(1) },
    { id: `${theme.slug}-${scenario.id}-hero-path`, tone: "critical", title: `Не завершена ветка «${theme.heroPaths[0].nameRu}»`, detail: `Из-за пропущенного узла «${profile.core[0]}» не получает полное усиление в основном окне силы.`, gain: contextualGain(1.1), action: "Исправить", iconUrl: specIcon },
    { id: `${theme.slug}-${scenario.id}-swap-utility`, tone: "recommended", title: `${profile.swaps[2]} не решает задачу режима`, detail: `Убрать «${profile.swaps[2]}» → поставить «${profile.swaps[3]}» под приоритет: ${scenario.priority}.`, gain: contextualGain(1), action: "Сравнить", iconUrl: abilityIcon(3) },
    { id: `${theme.slug}-${scenario.id}-signature`, tone: "recommended", title: `Связка с «${profile.core[2]}» работает не полностью`, detail: `Текущие таланты расходятся по темпу, поэтому сильные эффекты не попадают в одно окно.`, gain: contextualGain(1.7), action: "Исправить", iconUrl: abilityIcon(4) },
    { id: `${theme.slug}-${scenario.id}-stats`, tone: "recommended", title: `Характеристики не поддерживают выбранный билд`, detail: `После смены талантов ориентир характеристик: ${profile.stat}.`, gain: contextualGain(1.2), action: "Оптимизировать", iconUrl: abilityIcon(5) },
    { id: `${theme.slug}-${scenario.id}-defensive`, tone: "optional", title: `Можно добавить защитный узел «${theme.heroPaths[1].nameRu}»`, detail: scenario.group === "PvP" ? "Берите, если вас часто выбирают первой целью; для агрессивной команды узел можно пропустить." : "Берите для незнакомого или сложного контента; на лёгком уровне это очко можно оставить в уроне.", gain: contextualGain(.6), action: "Сравнить", iconUrl: abilityIcon(0) },
  ];
  const currentScore = Math.max(48, Math.round(76 - scenario.multiplier * 6));
  const recommendedScore = Math.min(98, currentScore + Math.round(changes.reduce((sum, change) => sum + change.gain, 0) * 6));
  return {
    current,
    recommended,
    changes,
    issues,
    metricLabel,
    statPriority: profile.stat,
    signature: profile.core[0],
    scenario,
    verdict: `Билд играбелен, но два очка не работают на главную задачу режима «${scenario.label}». Сначала сделайте две замены ниже — это самый понятный и безопасный прирост.`,
    assumptions: [scenario.fight, `Приоритет: ${scenario.priority}`, "Средний уровень исполнения"],
    currentScore,
    recommendedScore,
  };
}
