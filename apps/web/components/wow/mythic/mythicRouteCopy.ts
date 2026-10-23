import { routeText, sourceName, type WowNameTable } from "@/lib/wow/wowNameTable";
import type { RouteAbility, RouteEnemy, RouteStop } from "@/lib/data/wow/mythic/rubyLifePoolsData";

/**
 * Interface copy of the Mythic+ route planner (route map, selectors, combat
 * intel cards, test party). Game terms — dungeon, boss, enemy, ability, class
 * and spec names — stay as they are; the route facts come from the data files,
 * never from this file.
 */
export type RouteLocale = "ru" | "en";
export type RouteRole = "tank" | "healer" | "dps";

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const ru = {
  // Page chrome
  floorMarker: (id: number) => `${id} эт.`,
  breadcrumbsLabel: "Навигация",
  hub: "Эпохальный+",
  season: "Midnight · Сезон 2",
  eyebrow: (location: string) => `Маршрут подземелья · ${location} · Черновик`,
  goal: "Цель:",
  goalText: (description: string, _bosses: number) => description,
  keyLevelLabel: "Уровень ключа",
  controlsLabel: "Настройки маршрута",
  edit: "Редактировать",
  done: "Готово",
  share: "Поделиться",
  import: "Импорт",
  moreActions: "Дополнительные действия",
  downloadJson: "Скачать JSON",
  resetRoute: "Сбросить маршрут",

  // Run summary
  summaryLabel: "Сводка прохождения",
  timer: "Нужно уложиться",
  plan: (planned: string, reserve: string) => `План: ${planned} · запас ${reserve}`,
  forcesDone: "Врагов побеждено",
  forcesGoal: "Нужно: 100%",
  deaths: "Смерти группы",
  removeDeath: "Убрать смерть",
  addDeath: "Добавить смерть",
  deathPenalty: "Каждая добавляет 15 секунд",
  conditions: "Особые условия",
  conditionsHint: "Условия этого забега",
  tyrannical: "Враги сильнее",
  tyrannicalTitle: "Обычные враги сильнее",
  tyrannicalNote: "Обычные враги сильнее и опаснее",
  seasonAffix: "Сезон 2",
  seasonAffixTitle: "Условия текущего сезона",
  seasonAffixNote: "Действуют условия Midnight Сезон 2",

  // Workspace
  plannerLabel: (dungeon: string) => `Планировщик маршрута ${dungeon}`,
  stepsTitle: "Что делать по порядку",
  routeDone: "Маршрут выполнен",
  spent: "Потрачено",
  defeated: (forces: string) => `побеждено ${forces}% врагов`,
  gives: (forces: string) => `даст ${forces}%`,
  lust: "Использовать усиление группы",
  moveUp: "↑ Выше",
  moveDown: "↓ Ниже",
  mapTitle: "Карта подземелья",
  mapHint: "выбранный шаг отмечен на карте",
  floorGroup: "Этаж карты",
  floor: "Этаж",
  mapAlt: (dungeon: string, floor: number) => `Карта ${dungeon}, этаж ${floor}`,
  zoomGroup: "Масштаб карты",
  zoom: "Масштаб",
  zoomOut: "Уменьшить",
  zoomIn: "Увеличить",
  zoomReset: "Сбросить масштаб",
  expandMap: "Развернуть карту",
  collapseMap: "Свернуть карту",
  currentTarget: (index: number, total: number) => `Текущая цель: ${index} из ${total}`,
  completedPercent: (value: number) => `Маршрут выполнен на ${value}%`,
  passed: "пройдено",
  guide: "Подробный разбор",
  communityRoutes: "Маршруты сообщества",

  // Step details
  nowStep: (index: number, total: number) => `Сейчас · шаг ${index} из ${total}`,
  stepMeta: (time: string, forces: string, total: string) => `~${time} · даст ${forces}% · после шага будет ${total}%`,
  enemiesTitle: "Кого победить",
  enemiesCount: (count: number) => `${count} ${plural(count, "враг", "врага", "врагов")}`,
  noFight: "Здесь боя не будет.",
  abilitiesTitle: "На что реагировать",
  noAbilities: "На этом участке нет опасных способностей.",
  calloutsTitle: "Главное в этом шаге",
  rolesLabel: "Что важно каждой роли",
  splitPull: "Разделить врагов",
  stepTools: "Инструменты шага: разделить, заметка, сохранить",
  addNote: "Добавить заметку",
  completeStep: "Отметить шаг выполненным",
  reopenStep: "Вернуть шаг в план",
  noteLabel: "Заметка группы",
  notePlaceholder: "Кто прерывает, где ставим метку, когда нажимаем защиту…",
  save: "Сохранить",
  link: "Ссылка",

  // Timeline + party teaser
  timelineTitle: "Весь план по шагам",
  undo: "Отменить",
  redo: "Повторить",
  partyTeaserTitle: "Команда и план действий",
  partyTeaserText: "Демонстрационный состав из пяти игроков: способности, позиции и назначения для выбранного шага.",
  openParty: "Открыть состав группы и тактические назначения",

  // Announcements
  saved: "Маршрут и прогресс сохранены",
  resetDone: "Маршрут сброшен",
  undone: "Последнее изменение отменено",
  redone: "Изменение возвращено",
  splitOnlyPulls: "Разделить можно только группу врагов",
  splitDone: "Группа врагов разделена на две части",
  linkCopied: "Ссылка на выбранный шаг скопирована",
  copyLinkPrompt: "Скопируйте ссылку",
  jsonDownloaded: "JSON маршрута скачан",
  imported: "Маршрут импортирован",
  importFailed: "Не удалось прочитать JSON маршрута",

  // Import dialog
  importTitle: "Импорт маршрута",
  close: "Закрыть",
  importHeading: "Вставьте JSON маршрута Gildra",
  importText: "Можно вставить массив действий или ранее скачанный файл целиком.",
  cancel: "Отмена",
  importAction: "Импортировать",

  // Timeline items
  bossShort: "Босс",
  transitionShort: "Переход",

  // Selectors
  dungeonLabel: "Подземелье",
  difficultyLabel: "Сложность",
  loading: "Загрузка",
  keyboardHint: "↑↓ выбрать · Enter подтвердить · Esc закрыть",
  dungeonSubtitle: (option: { name: string; nameRu: string; timer: string }) => option.name,
  keyOptions: {
    2: "Входной уровень",
    5: "Быстрый забег",
    8: "Усиленный ключ",
    10: "Слаженная группа",
    12: "Высокий ключ",
    15: "Без права на ошибку",
  } as Record<number, string>,

  // Combat intel cards
  creature: () => "Существо",
  whatItDoes: "Что делает",
  whyDangerous: "Чем опасен",
  countInGroup: "Сколько в этой группе",
  spell: (spellId?: number): string => spellId ? "Заклинание" : "Заклинание · Путеводитель",
  ifIgnored: "Если не среагировать",
  castBy: "Кто применяет",
  castByShort: (source: string) => `Применяет: ${source}`,
  whatToDo: "Что сделать",
  responsible: "Кто отвечает",
  responseShort: (who: string) => `Ответ: ${who}`,
  dangerousEnemy: "Опасный противник",
  enemyFallback: (name: string) => `${name} входит в выбранную группу маршрута. Приоритет и количество рассчитаны для стабильного прохождения ключа.`,
  enemyDangerBoss: "Ключевой противник шага: выполняйте отмеченные механики и не расходуйте назначения одновременно.",
  enemyDanger: "Без контроля или правильного приоритета эта цель создаёт лишнее давление на танка и лекаря.",
  abilityFallback: (name: string) => `${name} — опасная способность выбранного противника. Интерфейс маршрута показывает требуемую реакцию и назначенного игрока.`,
  abilityFailInterrupt: "Заклинание сработает и создаст сильный урон или опасный эффект для всей группы.",
  abilityFailDispel: "Эффект продолжит усиливаться и заметно усложнит лечение группы.",
  abilityFailOther: "Невыполненная механика создаст лишний урон и может сорвать этот шаг маршрута.",
};

export type MythicRouteCopy = typeof ru;

const en: MythicRouteCopy = {
  floorMarker: (id: number) => `${id}F`,
  breadcrumbsLabel: "Breadcrumbs",
  hub: "Mythic+",
  season: "Midnight · Season 2",
  eyebrow: (location) => `Dungeon route · ${location} · Draft`,
  goal: "Goal:",
  goalText: (description) => description,
  keyLevelLabel: "Key level",
  controlsLabel: "Route settings",
  edit: "Edit route",
  done: "Done",
  share: "Share",
  import: "Import",
  moreActions: "More actions",
  downloadJson: "Download JSON",
  resetRoute: "Reset route",

  summaryLabel: "Run summary",
  timer: "Timer",
  plan: (planned, reserve) => `Plan: ${planned} · spare ${reserve}`,
  forcesDone: "Enemy forces",
  forcesGoal: "Required: 100%",
  deaths: "Party deaths",
  removeDeath: "Remove a death",
  addDeath: "Add a death",
  deathPenalty: "Each one adds 15 seconds",
  conditions: "Run conditions",
  conditionsHint: "Conditions of this run",
  tyrannical: "Stronger enemies",
  tyrannicalTitle: "Regular enemies are stronger",
  tyrannicalNote: "Regular enemies are stronger and more dangerous",
  seasonAffix: "Season 2",
  seasonAffixTitle: "Current season conditions",
  seasonAffixNote: "Midnight Season 2 conditions apply",

  plannerLabel: (dungeon) => `${dungeon} route planner`,
  stepsTitle: "Step by step",
  routeDone: "Route complete",
  spent: "Spent",
  defeated: (forces) => `${forces}% enemy forces defeated`,
  gives: (forces) => `gives ${forces}%`,
  lust: "Use the party-wide haste buff",
  moveUp: "↑ Up",
  moveDown: "↓ Down",
  mapTitle: "Dungeon map",
  mapHint: "the selected step is marked on the map",
  floorGroup: "Map floor",
  floor: "Floor",
  mapAlt: (dungeon, floor) => `${dungeon} map, floor ${floor}`,
  zoomGroup: "Map zoom",
  zoom: "Zoom",
  zoomOut: "Zoom out",
  zoomIn: "Zoom in",
  zoomReset: "Reset zoom",
  expandMap: "Expand map",
  collapseMap: "Collapse map",
  currentTarget: (index, total) => `Current step: ${index} of ${total}`,
  completedPercent: (value) => `Route ${value}% complete`,
  passed: "done",
  guide: "Full guide",
  communityRoutes: "Community routes",

  nowStep: (index, total) => `Now · step ${index} of ${total}`,
  stepMeta: (time, forces, total) => `~${time} · gives ${forces}% · ${total}% after this step`,
  enemiesTitle: "Enemies to defeat",
  enemiesCount: (count) => `${count} ${count === 1 ? "enemy" : "enemies"}`,
  noFight: "No fight on this step.",
  abilitiesTitle: "What to react to",
  noAbilities: "No dangerous abilities on this stretch.",
  calloutsTitle: "Key points of this step",
  rolesLabel: "What matters for each role",
  splitPull: "Split the pull",
  stepTools: "Step tools: split, note, save",
  addNote: "Add a note",
  completeStep: "Mark step as done",
  reopenStep: "Return step to the plan",
  noteLabel: "Party note",
  notePlaceholder: "Who interrupts, where the marker goes, when to press defensives…",
  save: "Save",
  link: "Link",

  timelineTitle: "Whole plan, step by step",
  undo: "Undo",
  redo: "Redo",
  partyTeaserTitle: "Party and action plan",
  partyTeaserText: "A demo five-player party: abilities, positions and assignments for the selected step.",
  openParty: "Open the party and tactical assignments",

  saved: "Route and progress saved",
  resetDone: "Route reset",
  undone: "Last change undone",
  redone: "Change restored",
  splitOnlyPulls: "Only an enemy pull can be split",
  splitDone: "The pull was split in two",
  linkCopied: "Link to the selected step copied",
  copyLinkPrompt: "Copy the link",
  jsonDownloaded: "Route JSON downloaded",
  imported: "Route imported",
  importFailed: "Could not read the route JSON",

  importTitle: "Import a route",
  close: "Close",
  importHeading: "Paste a Gildra route JSON",
  importText: "Paste an array of steps or a previously downloaded file as a whole.",
  cancel: "Cancel",
  importAction: "Import",

  bossShort: "Boss",
  transitionShort: "Travel",

  dungeonLabel: "Dungeon",
  difficultyLabel: "Difficulty",
  loading: "Loading",
  keyboardHint: "↑↓ choose · Enter confirm · Esc close",
  dungeonSubtitle: (option) => `Timer ${option.timer}`,
  keyOptions: {
    2: "Entry level",
    5: "Quick run",
    8: "Stronger key",
    10: "Coordinated group",
    12: "High key",
    15: "No room for error",
  },

  creature: () => "Creature",
  whatItDoes: "What it does",
  whyDangerous: "Why it is dangerous",
  countInGroup: "How many in this pull",
  spell: (spellId) => spellId ? "Spell" : "Spell · Guide",
  ifIgnored: "If nobody reacts",
  castBy: "Cast by",
  castByShort: (source) => `Cast by: ${source}`,
  whatToDo: "What to do",
  responsible: "Who handles it",
  responseShort: (who) => `Handled by: ${who}`,
  dangerousEnemy: "Dangerous enemy",
  enemyFallback: (name) => `${name} is part of the selected pull. Priority and count are set for a steady key.`,
  enemyDangerBoss: "Key enemy of this step: handle the marked mechanics and do not spend all assignments at once.",
  enemyDanger: "Without crowd control or the right priority this target adds needless pressure on the tank and the healer.",
  abilityFallback: (name) => `${name} is a dangerous ability of the selected enemy. The route shows the required reaction and the assigned player.`,
  abilityFailInterrupt: "The cast goes off and causes heavy damage or a dangerous effect on the whole party.",
  abilityFailDispel: "The effect keeps stacking and makes healing the party much harder.",
  abilityFailOther: "A missed mechanic causes extra damage and can break this step of the route.",
};

export const mythicRouteCopy: Record<RouteLocale, MythicRouteCopy> = { ru, en };

/* ---------- Labels for route data enums ---------- */

export const priorityLabels: Record<RouteLocale, Record<RouteEnemy["priority"], string>> = {
  ru: { boss: "Босс", high: "Убить первым", medium: "Опасный", low: "Обычный враг" },
  en: { boss: "Boss", high: "Kill first", medium: "Dangerous", low: "Regular enemy" },
};

export const stopKindLabels: Record<RouteLocale, Record<RouteStop["kind"], string>> = {
  ru: { boss: "Босс", miniboss: "Сильный враг", transition: "Переход", pull: "Группа врагов" },
  en: { boss: "Boss", miniboss: "Elite enemy", transition: "Travel", pull: "Enemy pull" },
};

export const actionLabels: Record<RouteLocale, Record<RouteAbility["action"], string>> = {
  ru: { "Кик": "Прервать", "Стоп": "Остановить", "Диспел": "Снять эффект", "Пурж": "Снять усиление", "Фокус": "Убить первым", "Уклонение": "Уклонение", "Защита": "Защита" },
  en: { "Кик": "Interrupt", "Стоп": "Stop", "Диспел": "Dispel", "Пурж": "Purge", "Фокус": "Kill first", "Уклонение": "Dodge", "Защита": "Defensive" },
};

export const roleLabels: Record<RouteLocale, Record<RouteRole, string>> = {
  ru: { tank: "Защита", healer: "Лечение", dps: "Урон" },
  en: { tank: "Tank", healer: "Healer", dps: "Damage" },
};

/** Who answers a mechanic: test-party characters keep their names, groups are translated. */
const targetLabels: Record<RouteLocale, Record<string, string>> = {
  ru: {
    ArcanistVexis: "ArcanistVexis · защита",
    MysticHeals: "MysticHeals · лечение",
    ShadowNova: "ShadowNova · урон",
    Windborne: "Windborne · урон",
    Ironclad: "Ironclad · урон",
    "Ротация киков": "Игроки по очереди",
    "Цель дебаффа": "Игрок с негативным эффектом",
    "Мили": "Игроки рядом с врагом",
    "Все DPS": "Все атакующие",
    "Все кастеры": "Все, кто произносит заклинание",
  },
  en: {
    ArcanistVexis: "ArcanistVexis · tank",
    MysticHeals: "MysticHeals · healer",
    ShadowNova: "ShadowNova · damage",
    Windborne: "Windborne · damage",
    Ironclad: "Ironclad · damage",
    "Ротация киков": "Players in turn",
    "Цель дебаффа": "Player with the debuff",
    "Мили": "Melee players",
    "Все DPS": "All damage dealers",
    "Все кастеры": "All casters",
    "Вся группа": "Whole party",
    "Случайная цель": "Random target",
    "Цель механики": "Mechanic target",
    "Цели механики": "Mechanic targets",
  },
};

export function targetLabel(target: string, locale: RouteLocale) {
  return targetLabels[locale][target] ?? target;
}

const floorLabels: Record<string, string> = { "Нижний": "Lower", "Верхний": "Upper" };

const subtitlesEn: Record<string, string> = {
  "Опасный большой пулл": "Dangerous large pull",
  "Обязательный мини-босс": "Required mini-boss",
  "Босс 1": "Boss 1",
  "Босс 2": "Boss 2",
  "Босс 3": "Boss 3",
  "Radiant Drake · переход": "Radiant Drake · travel",
  "Лейтенант + второй Destroyer": "Lieutenant + second Destroyer",
  "Лейтенант + Flamelasher": "Lieutenant + Flamelasher",
  "Финальный мини-босс": "Final mini-boss",
  "Финальный босс": "Final boss",
  "Активировать древние тотемы": "Activate the ancient totems",
  "Последняя охрана": "Last guard",
  "Собрать припасы": "Gather supplies",
  "Королевские звери": "Royal beasts",
};

/** Short step subtitles; English pages get the translated label when one exists. */
const subtitlesRu: Record<string, string> = {
  "Опасный большой пулл": "Большая опасная группа врагов",
  "Felonious crew": "Банда противников", "Mages + smugglers": "Маги и контрабандисты", "Barrels + freight": "Бочки и груз",
  Wrathguards: "Стражи", "Invokers + flayers": "Заклинатели и свежеватели", "Freight gauntlet": "Проход с грузом",
};
export function stopSubtitle(subtitle: string, locale: RouteLocale, names: WowNameTable, enemies?: readonly { name: string }[]) {
  if (locale === "en") return subtitlesEn[subtitle] ?? subtitle;
  const text = subtitlesRu[subtitle] ?? plainLanguage(subtitle, locale, names);
  // Group subtitles use the original NPC names carried by the route, rather
  // than abbreviated English labels. Stored names and route keys stay intact.
  if (/[A-Za-z]/.test(text) && enemies?.length) return [...new Set(enemies.map((enemy) => sourceName(names, enemy.name, locale)))].join(" + ");
  return text;
}

export function floorLabel(label: string, locale: RouteLocale) {
  return locale === "ru" ? label : floorLabels[label] ?? label;
}

/** Route notes are written by players for players; this keeps the Russian notes free of raid slang. */
export function plainLanguage(text: string, locale: RouteLocale, names: Pick<WowNameTable, "route">) {
  if (locale === "en") return text;
  return routeText(names, text, locale)
    .replaceAll("Стакайте пак", "Соберите врагов вместе")
    .replaceAll("Стак у стены", "Соберитесь у стены")
    .replaceAll("треш", "обычные группы врагов")
    .replaceAll("пулл", "группу врагов")
    .replaceAll("мобов", "врагов")
    .replaceAll("паков", "групп врагов")
    .replaceAll("паком", "группой врагов")
    .replaceAll("пак", "группу врагов")
    .replaceAll("Bloodlust", "усиление всей группы")
    .replaceAll("bloodlust", "усиление всей группы")
    .replaceAll("нужен hard CC", "нужно сильное оглушение")
    .replaceAll("Hard CC", "Сильное оглушение")
    .replaceAll("hard CC", "сильное оглушение")
    .replaceAll("cooldowns", "сильные способности")
    .replaceAll("burst", "сильный урон")
    .replaceAll("mitigation", "защиту")
    .replaceAll("Mitigation", "Используйте защиту")
    .replaceAll("Групповой CD", "Сильную защиту группы")
    .replaceAll("танковый CD", "защиту танка")
    .replaceAll("CD", "защитное умение")
    .replaceAll("АоЕ", "массовое")
    .replaceAll("касты", "заклинания")
    .replaceAll("кастеры", "игроки, произносящие заклинания")
    .replaceAll("кикается", "нужно прервать")
    .replaceAll("кикнуть", "прервать")
    .replaceAll("киков", "прерываний")
    .replaceAll("Кикайте", "Прерывайте")
    .replaceAll("кикайте", "прерывайте")
    .replaceAll("Кики", "Прерывания")
    .replaceAll("кики", "прерывания")
    .replaceAll("Первый кик", "Первое прерывание")
    .replaceAll("главный кик", "главное прерывание")
    .replaceAll(" — кик ", " — прервать ")
    .replaceAll("диспелим", "снимаем")
    .replaceAll("диспелить", "снять")
    .replaceAll("двойной диспел", "одновременное снятие двух эффектов")
    .replaceAll("Пуржите", "Снимите усиление")
    .replaceAll("Пурж", "Снять усиление")
    .replaceAll("purge", "снимите усиление")
    .replaceAll("мили", "бойцы рядом с врагом")
    .replaceAll("ranged", "бойцы вдали")
    .replaceAll("melee", "ближней зоне")
    .replaceAll("адда", "дополнительного врага")
    .replaceAll("whelps", "маленьких драконов")
    .replaceAll("DoT", "периодического урона")
    .replaceAll("cleave", "урона по нескольким целям")
    .replaceAll("stop", "остановите")
    .replaceAll("abilities", "способностей")
    .replaceAll("tactical draft", "черновом плане боя")
    .replaceAll("NPC-сущности", "существа")
    .replaceAll("NPC ID", "игровых ID")
    .replaceAll("Skull/Cross", "череп/крест")
    .replaceAll("стаков", "уровней эффекта")
    .replaceAll("стаками", "уровнями эффекта")
    .replaceAll("дебафф", "негативный эффект")
    .replaceAll("прожимайтесь", "используйте защиту");
}
